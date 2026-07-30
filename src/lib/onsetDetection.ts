import type { BandEnvelope, Instrument, OnsetTrack, Sensitivity } from '../types';
import { INSTRUMENTS } from '../types';

interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  q?: number;
}

/** Rough frequency bands used to isolate each drum voice before envelope extraction. */
const BAND_FILTERS: Record<Instrument, FilterSpec[]> = {
  kick: [
    { type: 'lowpass', freq: 120, q: 0.7 },
    { type: 'lowpass', freq: 120, q: 0.7 },
  ],
  snare: [
    { type: 'highpass', freq: 250, q: 0.7 },
    { type: 'lowpass', freq: 4000, q: 0.7 },
  ],
  hihat: [
    { type: 'highpass', freq: 6000, q: 0.7 },
    { type: 'highpass', freq: 6000, q: 0.7 },
  ],
};

const HOP_SECONDS = 0.005; // 5ms control-rate envelope
const LOCAL_STATS_WINDOW_SECONDS = 0.3;
const REFRACTORY_SECONDS = 0.06;
/** Cutoff for the envelope-follower smoothing stage applied after rectification. */
const ENVELOPE_SMOOTHING_HZ = 25;

let rectifyCurve: Float32Array | null = null;
function getRectifyCurve(): Float32Array {
  if (!rectifyCurve) {
    const size = 1024;
    rectifyCurve = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1)) * 2 - 1;
      rectifyCurve[i] = Math.abs(x);
    }
  }
  return rectifyCurve;
}

/**
 * Band-passes the audio for one drum voice, then full-wave rectifies and smooths the
 * result into a slow envelope. Smoothing here matters more than it looks: rectified
 * low-frequency content (e.g. the kick's ~50-150Hz body) still oscillates fast enough
 * that naive block-RMS produces ripple, which the peak picker mistakes for extra hits.
 */
async function renderBand(buffer: AudioBuffer, instrument: Instrument): Promise<Float32Array> {
  const offlineCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;

  let node: AudioNode = source;
  for (const spec of BAND_FILTERS[instrument]) {
    const filter = offlineCtx.createBiquadFilter();
    filter.type = spec.type;
    filter.frequency.value = spec.freq;
    if (spec.q !== undefined) filter.Q.value = spec.q;
    node.connect(filter);
    node = filter;
  }

  const rectifier = offlineCtx.createWaveShaper();
  rectifier.curve = getRectifyCurve() as Float32Array<ArrayBuffer>;
  node.connect(rectifier);
  node = rectifier;

  for (let i = 0; i < 2; i++) {
    const smoother = offlineCtx.createBiquadFilter();
    smoother.type = 'lowpass';
    smoother.frequency.value = ENVELOPE_SMOOTHING_HZ;
    smoother.Q.value = 0.5;
    node.connect(smoother);
    node = smoother;
  }

  node.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

function computeEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const hopSize = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  const numHops = Math.floor(samples.length / hopSize);
  const env = new Float32Array(numHops);
  for (let h = 0; h < numHops; h++) {
    let sum = 0;
    const start = h * hopSize;
    const end = start + hopSize;
    for (let i = start; i < end; i++) {
      sum += Math.max(0, samples[i]);
    }
    env[h] = sum / hopSize;
  }
  return env;
}

/** Adaptive-threshold peak picking over a control-rate envelope. */
export function pickPeaks(envelope: Float32Array, hopSeconds: number, sensitivity: number): number[] {
  const n = envelope.length;
  if (n < 3) return [];

  const windowSize = Math.max(1, Math.round(LOCAL_STATS_WINDOW_SECONDS / hopSeconds));
  const minGapSamples = Math.max(1, Math.round(REFRACTORY_SECONDS / hopSeconds));

  const prefix = new Float64Array(n + 1);
  const prefixSq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + envelope[i];
    prefixSq[i + 1] = prefixSq[i] + envelope[i] * envelope[i];
  }

  const onsets: number[] = [];
  let lastPeakIndex = -Infinity;

  for (let i = 1; i < n - 1; i++) {
    const lo = Math.max(0, i - windowSize);
    const hi = Math.min(n, i + windowSize);
    const count = hi - lo;
    const sum = prefix[hi] - prefix[lo];
    const sumSq = prefixSq[hi] - prefixSq[lo];
    const mean = sum / count;
    const variance = Math.max(0, sumSq / count - mean * mean);
    const std = Math.sqrt(variance);
    const threshold = mean + sensitivity * std;

    const isLocalMax = envelope[i] >= envelope[i - 1] && envelope[i] >= envelope[i + 1];
    if (isLocalMax && envelope[i] > threshold && envelope[i] > 1e-4) {
      if (i - lastPeakIndex >= minGapSamples) {
        onsets.push(i * hopSeconds);
        lastPeakIndex = i;
      } else if (onsets.length > 0) {
        const prevIndex = Math.round(onsets[onsets.length - 1] / hopSeconds);
        if (envelope[i] > envelope[prevIndex]) {
          onsets[onsets.length - 1] = i * hopSeconds;
          lastPeakIndex = i;
        }
      }
    }
  }
  return onsets;
}

/** Filters + extracts envelopes for all three drum bands. Expensive; run once per file. */
export async function computeBandEnvelopes(buffer: AudioBuffer): Promise<Record<Instrument, BandEnvelope>> {
  const entries = await Promise.all(
    INSTRUMENTS.map(async (instrument) => {
      const samples = await renderBand(buffer, instrument);
      const values = computeEnvelope(samples, buffer.sampleRate);
      return [instrument, { instrument, values, hopSeconds: HOP_SECONDS }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<Instrument, BandEnvelope>;
}

/** Cheap re-run of peak picking against cached envelopes, e.g. when the user tweaks sensitivity. */
export function detectOnsetsFromEnvelopes(
  envelopes: Record<Instrument, BandEnvelope>,
  sensitivity: Sensitivity,
): OnsetTrack {
  const result = {} as OnsetTrack;
  for (const instrument of INSTRUMENTS) {
    const env = envelopes[instrument];
    result[instrument] = pickPeaks(env.values, env.hopSeconds, sensitivity[instrument]);
  }
  return result;
}
