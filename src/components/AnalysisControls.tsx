import { useRef } from 'react';
import type { Instrument, Sensitivity } from '../types';
import { INSTRUMENTS, INSTRUMENT_NAMES } from '../types';

interface AnalysisControlsProps {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onAutoDetectBpm: () => void;
  offsetSeconds: number;
  onOffsetChange: (offset: number) => void;
  stepsPerBeat: number;
  onStepsPerBeatChange: (steps: number) => void;
  beatsPerMeasure: number;
  onBeatsPerMeasureChange: (beats: number) => void;
  sensitivity: Sensitivity;
  onSensitivityChange: (instrument: Instrument, value: number) => void;
}

export function AnalysisControls({
  bpm,
  onBpmChange,
  onAutoDetectBpm,
  offsetSeconds,
  onOffsetChange,
  stepsPerBeat,
  onStepsPerBeatChange,
  beatsPerMeasure,
  onBeatsPerMeasureChange,
  sensitivity,
  onSensitivityChange,
}: AnalysisControlsProps) {
  const tapTimesRef = useRef<number[]>([]);

  function handleTapTempo() {
    const now = performance.now();
    const taps = tapTimesRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      taps.length = 0; // reset after a pause
    }
    taps.push(now);
    if (taps.length > 8) taps.shift();
    if (taps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      onBpmChange(Math.round((60000 / avgMs) * 10) / 10);
    }
  }

  return (
    <div className="controls">
      <div className="controls__row">
        <label className="field">
          <span>BPM</span>
          <input
            type="number"
            min={30}
            max={300}
            step={0.1}
            value={bpm}
            onChange={(e) => onBpmChange(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={onAutoDetectBpm} className="btn btn--ghost">
          自動検出
        </button>
        <button type="button" onClick={handleTapTempo} className="btn btn--ghost">
          タップでBPM
        </button>
      </div>

      <div className="controls__row">
        <label className="field">
          <span>開始位置のずれ (秒)</span>
          <input
            type="number"
            step={0.01}
            value={offsetSeconds}
            onChange={(e) => onOffsetChange(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>拍子</span>
          <select
            value={beatsPerMeasure}
            onChange={(e) => onBeatsPerMeasureChange(Number(e.target.value))}
          >
            <option value={4}>4/4</option>
            <option value={3}>3/4</option>
            <option value={2}>2/4</option>
            <option value={6}>6/8 (2拍3連換算)</option>
          </select>
        </label>
        <label className="field">
          <span>音符の細かさ</span>
          <select
            value={stepsPerBeat}
            onChange={(e) => onStepsPerBeatChange(Number(e.target.value))}
          >
            <option value={1}>4分</option>
            <option value={2}>8分</option>
            <option value={3}>8分3連</option>
            <option value={4}>16分</option>
          </select>
        </label>
      </div>

      <div className="controls__row controls__row--sensitivity">
        {INSTRUMENTS.map((instrument) => (
          <label className="field field--slider" key={instrument}>
            <span>
              {INSTRUMENT_NAMES[instrument]} 感度: {sensitivity[instrument].toFixed(1)}
            </span>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={sensitivity[instrument]}
              onChange={(e) => onSensitivityChange(instrument, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      <p className="controls__note">
        感度を上げると検出される音が減り（強い音だけ）、下げると増えます（弱い音も拾う）。
      </p>
    </div>
  );
}
