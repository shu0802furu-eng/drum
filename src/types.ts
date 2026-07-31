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

/** Glyph drawn in a hit cell; shape-coded (not just color-coded) so it still reads in print/grayscale. */
export const INSTRUMENT_MARKS: Record<Instrument, string> = {
  hihat: '×',
  snare: '◆',
  kick: '●',
};

/** Detected onset times (seconds) for one instrument band. */
export type OnsetTrack = Record<Instrument, number[]>;

/**
 * Per-instrument envelope used for onset detection, shared control-rate. Values are
 * normalized so that a "typical strong hit" in that band sits around 1.0, which is what
 * lets `Sensitivity` below be a single comparable threshold across all three bands.
 */
export interface BandEnvelope {
  instrument: Instrument;
  /** Envelope samples at `hopSeconds` intervals, normalized to that band's own dynamics. */
  values: Float32Array;
  hopSeconds: number;
}

/** Minimum normalized band level (roughly 0-1) required to classify a detected hit as this instrument. */
export interface Sensitivity {
  hihat: number;
  snare: number;
  kick: number;
}

export const DEFAULT_SENSITIVITY: Sensitivity = {
  hihat: 0.35,
  snare: 0.35,
  kick: 0.35,
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
