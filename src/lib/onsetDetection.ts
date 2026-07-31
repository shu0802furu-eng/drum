import type { BandEnvelope, Instrument, OnsetTrack, Sensitivity } from '../types';
import { INSTRUMENTS } from '../types';

interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  q?: number;
}

/**
 * Frequency bands used to isolate each drum voice before envelope extraction. Each band
 * is a cascade of biquads for a steeper rolloff than a single filter gives, to keep
 * kick/snare/hihat from bleeding into each other's band as much as possible.
 */
const BAND_FILTERS: Record<Instrument, FilterSpec[]> = {
  kick: [
    { type: 'lowpass', freq: 110, q: 0.7 },
    { type: 'lowpass', freq: 110, q: 0.7 },
    { type: 'lowpass', freq: 110, q: 0.7 },
  ],
  snare: [
    { type: 'highpass', freq: 380, q: 0.7 },
    { type: 'highpass', freq: 380, q: 0.7 },
    { type: 'lowpass', freq: 4000, q: 0.7 },
  ],
  hihat: [
    { type: 'highpass', freq: 8000, q: 0.7 },
    { type: 'highpass', freq: 8000, q: 0.7 },
    { type: 'highpass', freq: 8000, q: 0.7 },
  ],
};

const HOP_SECONDS = 0.005; // 5ms control-rate envelope
const REFRACTORY_SECONDS = 0.08;
/** Envelope-follower attack/release time constants, applied after rectification. */
const ATTACK_SECONDS = 0.002;
const RELEASE_SECONDS = 0.04;

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

/** Band-passes the audio for one drum voice and full-wave rectifies it. */
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

  node.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Turns a rectified signal into a percussive envelope with a fast attack and slower
 * release, à la a compressor's envelope follower. This is deliberately not a symmetric
 * low-pass filter: cascading biquad lowpasses smooths ripple but can itself ring/overshoot
 * on a sharp transient, which was producing a spurious second "hump" — and therefore a
 * phantom extra hit — after every real kick hit's decay. A one-sided leaky integrator
 * (rise fast, decay slower, never overshoots) tracks the true transient shape instead.
 */
function followEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const attackCoeff = Math.exp(-1 / (sampleRate * ATTACK_SECONDS));
  const releaseCoeff = Math.exp(-1 / (sampleRate * RELEASE_SECONDS));
  const out = new Float32Array(samples.length);
  let level = 0;
  for (let i = 0; i < samples.length; i++) {
    const input = Math.abs(samples[i]);
    const coeff = input > level ? attackCoeff : releaseCoeff;
    level = coeff * level + (1 - coeff) * input;
    out[i] = level;
  }
  return out;
}

/** Decimates the full-sample-rate envelope down to a control rate, keeping each block's peak. */
function downsampleEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const hopSize = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  const numHops = Math.floor(samples.length / hopSize);
  const env = new Float32Array(numHops);
  for (let h = 0; h < numHops; h++) {
    let peak = 0;
    const start = h * hopSize;
    const end = start + hopSize;
    for (let i = start; i < end; i++) {
      peak = Math.max(peak, samples[i]);
    }
    env[h] = peak;
  }
  return env;
}

/**
 * A single loud outlier (a crash, an accent) would otherwise skew a plain max-based
 * normalization and make every ordinary hit in that band look quiet by comparison. Using
 * the 90th percentile of the band's own local peaks as the "typical strong hit" reference
 * is more robust to that, and gives every band a comparable ~0-1 scale so a single
 * `Sensitivity` threshold means roughly the same thing for kick, snare and hihat.
 */
function robustPeakReference(envelope: Float32Array): number {
  const peaks: number[] = [];
  for (let i = 1; i < envelope.length - 1; i++) {
    if (envelope[i] >= envelope[i - 1] && envelope[i] >= envelope[i + 1] && envelope[i] > 1e-5) {
      peaks.push(envelope[i]);
    }
  }
  if (peaks.length === 0) {
    let max = 0;
    for (const v of envelope) max = Math.max(max, v);
    return max > 0 ? max : 1;
  }
  peaks.sort((a, b) => a - b);
  const index = Math.min(peaks.length - 1, Math.floor(0.9 * (peaks.length - 1)));
  return peaks[index] || 1;
}

function normalizeEnvelope(envelope: Float32Array, reference: number): Float32Array {
  const ref = reference > 0 ? reference : 1;
  const out = new Float32Array(envelope.length);
  for (let i = 0; i < envelope.length; i++) out[i] = envelope[i] / ref;
  return out;
}

/**
 * Fixed-threshold peak picking over a normalized (0-1-ish) envelope: a local max counts as
 * a hit once it clears `threshold`, with a refractory gap so a single hit's decay ripple
 * isn't re-triggered. Deliberately not adaptive/windowed statistics (mean + k*std over a
 * sliding window): that approach breaks down for a fast, evenly-spaced instrument like
 * hihat 8th/16th-notes, where every window contains about the same number of hits and the
 * "local baseline" stops meaning "the quiet between hits" — which flattens the contrast and
 * silently drops most of the real hits. A plain threshold on an already-normalized envelope
 * doesn't have that failure mode and is easier to reason about besides.
 */
export function pickPeaks(envelope: Float32Array, hopSeconds: number, threshold: number): number[] {
  const n = envelope.length;
  if (n < 3) return [];

  const minGapSamples = Math.max(1, Math.round(REFRACTORY_SECONDS / hopSeconds));
  const onsets: number[] = [];
  let lastPeakIndex = -Infinity;

  for (let i = 1; i < n - 1; i++) {
    const isLocalMax = envelope[i] >= envelope[i - 1] && envelope[i] >= envelope[i + 1];
    if (isLocalMax && envelope[i] >= threshold) {
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

/**
 * Filters + extracts a normalized envelope for all three drum bands. Expensive (runs an
 * OfflineAudioContext render per band); call once per file and cache the result.
 */
export async function computeBandEnvelopes(buffer: AudioBuffer): Promise<Record<Instrument, BandEnvelope>> {
  const entries = await Promise.all(
    INSTRUMENTS.map(async (instrument) => {
      const samples = await renderBand(buffer, instrument);
      const followed = followEnvelope(samples, buffer.sampleRate);
      const raw = downsampleEnvelope(followed, buffer.sampleRate);
      const values = normalizeEnvelope(raw, robustPeakReference(raw));
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
