export type Instrument = 'hihat' | 'snare' | 'kick';

export const INSTRUMENTS: Instrument[] = ['hihat', 'snare', 'kick'];

export const INSTRUMENT_LABELS: Record<Instrument, string> = {
  hihat: 'HH',
  snare: 'SD',
  kick: 'BD',
};

export const INSTRUMENT_NAMES: Record<Instrument, string> = {
  hihat: 'ハイハット',
  snare: 'スネア',
  kick: 'バスドラム',
};

/** Detected onset times (seconds) for one instrument band. */
export type OnsetTrack = Record<Instrument, number[]>;

/** Per-instrument envelope used for onset detection, shared control-rate. */
export interface BandEnvelope {
  instrument: Instrument;
  /** Envelope samples at `hopSeconds` intervals. */
  values: Float32Array;
  hopSeconds: number;
}

export interface Sensitivity {
  hihat: number;
  snare: number;
  kick: number;
}

export const DEFAULT_SENSITIVITY: Sensitivity = {
  hihat: 1.5,
  snare: 1.5,
  kick: 1.5,
};

/** One column of the drum tab grid. */
export type GridStep = Record<Instrument, boolean>;

export interface DrumGrid {
  bpm: number;
  offsetSeconds: number;
  stepsPerBeat: number;
  beatsPerMeasure: number;
  stepSeconds: number;
  steps: GridStep[];
}
