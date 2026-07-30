import type { OnsetTrack } from '../types';

const MIN_BPM = 60;
const MAX_BPM = 200;
const MIN_PERIOD = 60 / MAX_BPM;
const MAX_PERIOD = 60 / MIN_BPM;
const BIN_SECONDS = 0.02;
const MAX_LOOKAHEAD = 16;
/** Onsets from different bands within this window are treated as the same physical hit. */
const DEDUPE_SECONDS = 0.04;
/** When picking the winning period, prefer the fastest candidate that's still this close to the peak count. */
const OCTAVE_PREFERENCE_RATIO = 0.6;

/** Merges near-coincident onsets (e.g. a kick and snare band both firing on one transient). */
function dedupeOnsets(sorted: number[]): number[] {
  const merged: number[] = [];
  for (const t of sorted) {
    if (merged.length > 0 && t - merged[merged.length - 1] < DEDUPE_SECONDS) continue;
    merged.push(t);
  }
  return merged;
}

function estimateBpmFromOnsets(onsets: number[]): number | null {
  if (onsets.length < 4) return null;
  const sorted = dedupeOnsets([...onsets].sort((a, b) => a - b));
  if (sorted.length < 4) return null;

  const histogram = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < Math.min(sorted.length, i + MAX_LOOKAHEAD); j++) {
      const delta = sorted[j] - sorted[i];
      if (delta < MIN_PERIOD) continue;
      if (delta > MAX_PERIOD) break;
      const bin = Math.round(delta / BIN_SECONDS);
      histogram.set(bin, (histogram.get(bin) ?? 0) + 1);
    }
  }
  if (histogram.size === 0) return null;

  const maxCount = Math.max(...histogram.values());
  // Periodic signals give strong histogram support at every multiple of the true period,
  // so prefer the fastest (smallest-period) candidate that's still close to the strongest bin
  // rather than always the single argmax, which tends to lock onto a slower multiple.
  let bestBin = 0;
  for (const [bin, count] of [...histogram.entries()].sort((a, b) => a[0] - b[0])) {
    if (count >= maxCount * OCTAVE_PREFERENCE_RATIO) {
      bestBin = bin;
      break;
    }
  }
  const period = bestBin * BIN_SECONDS;
  if (period <= 0) return null;
  return Math.round((60 / period) * 10) / 10;
}

/** Estimates BPM (60-200 range) from kick + snare onsets via inter-onset interval histogram. */
export function estimateBpm(onsetTrack: OnsetTrack): number | null {
  const combined = [...onsetTrack.kick, ...onsetTrack.snare];
  return estimateBpmFromOnsets(combined);
}
