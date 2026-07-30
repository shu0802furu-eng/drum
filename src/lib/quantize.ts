import type { DrumGrid, GridStep, Instrument, OnsetTrack } from '../types';
import { INSTRUMENTS } from '../types';

export interface QuantizeOptions {
  bpm: number;
  offsetSeconds: number;
  stepsPerBeat: number;
  beatsPerMeasure: number;
  durationSeconds: number;
}

/** Snaps detected onset times onto a rhythmic grid derived from BPM and time signature. */
export function quantizeOnsets(onsetTrack: OnsetTrack, options: QuantizeOptions): DrumGrid {
  const { bpm, offsetSeconds, stepsPerBeat, beatsPerMeasure, durationSeconds } = options;
  const stepSeconds = 60 / bpm / stepsPerBeat;
  const stepsPerMeasure = stepsPerBeat * beatsPerMeasure;

  const rawSteps = Math.max(1, Math.ceil((durationSeconds - offsetSeconds) / stepSeconds));
  const totalSteps = Math.ceil(rawSteps / stepsPerMeasure) * stepsPerMeasure;

  const steps: GridStep[] = Array.from({ length: totalSteps }, () => ({
    hihat: false,
    snare: false,
    kick: false,
  }));

  for (const instrument of INSTRUMENTS) {
    for (const t of onsetTrack[instrument]) {
      const relative = t - offsetSeconds;
      if (relative < 0) continue;
      const idx = Math.round(relative / stepSeconds);
      if (idx >= 0 && idx < totalSteps) {
        steps[idx][instrument as Instrument] = true;
      }
    }
  }

  return { bpm, offsetSeconds, stepsPerBeat, beatsPerMeasure, stepSeconds, steps };
}
