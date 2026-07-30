import { useEffect, useMemo, useRef } from 'react';
import type { DrumGrid, Instrument } from '../types';
import { INSTRUMENTS, INSTRUMENT_LABELS } from '../types';

interface DrumSheetProps {
  grid: DrumGrid;
  currentStepIndex: number;
  onToggleCell: (stepIndex: number, instrument: Instrument) => void;
  onSeek: (stepIndex: number) => void;
}

const TARGET_COLUMNS_PER_LINE = 32;
const MARK: Record<Instrument, string> = {
  hihat: '×',
  snare: '●',
  kick: '●',
};

export function DrumSheet({ grid, currentStepIndex, onToggleCell, onSeek }: DrumSheetProps) {
  const stepsPerMeasure = grid.stepsPerBeat * grid.beatsPerMeasure;
  const measureCount = Math.ceil(grid.steps.length / stepsPerMeasure);
  const measuresPerLine = Math.max(1, Math.floor(TARGET_COLUMNS_PER_LINE / stepsPerMeasure));

  const lines = useMemo(() => {
    const result: number[][] = [];
    for (let m = 0; m < measureCount; m += measuresPerLine) {
      const line: number[] = [];
      for (let k = m; k < Math.min(measureCount, m + measuresPerLine); k++) line.push(k);
      result.push(line);
    }
    return result;
  }, [measureCount, measuresPerLine]);

  const activeMeasure = currentStepIndex >= 0 ? Math.floor(currentStepIndex / stepsPerMeasure) : -1;
  const activeLineIndex = useMemo(
    () => lines.findIndex((line) => line.includes(activeMeasure)),
    [lines, activeMeasure],
  );
  const activeLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeLineIndex < 0) return;
    activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeLineIndex]);

  return (
    <div className="sheet" id="drum-sheet-print">
      {lines.map((lineMeasures, lineIdx) => {
        const isActiveLine = lineIdx === activeLineIndex;
        return (
          <div
            className="sheet__line"
            key={lineIdx}
            ref={isActiveLine ? activeLineRef : undefined}
          >
            <div className="sheet__labels">
              <div className="sheet__label-cell sheet__label-cell--measure">
                {lineMeasures[0] + 1}
              </div>
              {INSTRUMENTS.map((instrument) => (
                <div className="sheet__label-cell" key={instrument}>
                  {INSTRUMENT_LABELS[instrument]}
                </div>
              ))}
            </div>
            <div className="sheet__measures">
              {lineMeasures.map((measureIdx) => {
                const start = measureIdx * stepsPerMeasure;
                const stepIndices = Array.from({ length: stepsPerMeasure }, (_, i) => start + i).filter(
                  (i) => i < grid.steps.length,
                );
                return (
                  <div
                    className={`measure${measureIdx === activeMeasure ? ' measure--active' : ''}`}
                    key={measureIdx}
                  >
                    <div className="measure__number">{measureIdx + 1}</div>
                    {INSTRUMENTS.map((instrument) => (
                      <div
                        className="measure__row"
                        key={instrument}
                        style={{ gridTemplateColumns: `repeat(${stepsPerMeasure}, 1fr)` }}
                      >
                        {stepIndices.map((stepIdx) => {
                          const isBeatStart = (stepIdx - start) % grid.stepsPerBeat === 0;
                          const isHit = grid.steps[stepIdx][instrument];
                          const isCurrent = stepIdx === currentStepIndex;
                          return (
                            <button
                              type="button"
                              key={stepIdx}
                              className={[
                                'cell',
                                isBeatStart ? 'cell--beat-start' : '',
                                isHit ? 'cell--hit' : '',
                                isCurrent ? 'cell--current' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => onToggleCell(stepIdx, instrument)}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                onSeek(stepIdx);
                              }}
                              title={`${stepIdx + 1}拍目 (クリックで入力切替 / ダブルクリックでシーク)`}
                            >
                              {isHit ? MARK[instrument] : ''}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
