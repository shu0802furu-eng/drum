import { useEffect, useRef, useState } from 'react';
import { VideoDropzone } from './VideoDropzone';
import { AnalysisControls } from './AnalysisControls';
import { DrumSheet } from './DrumSheet';
import { decodeAudioFromFile } from '../lib/audioDecode';
import { computeBandEnvelopes, detectOnsetsFromEnvelopes } from '../lib/onsetDetection';
import { estimateBpm } from '../lib/tempo';
import { quantizeOnsets } from '../lib/quantize';
import type { BandEnvelope, DrumGrid, Instrument, Sensitivity } from '../types';
import { DEFAULT_SENSITIVITY } from '../types';

type Status = 'idle' | 'decoding' | 'analyzing' | 'ready' | 'error';

export function DrumSheetMaker() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [envelopes, setEnvelopes] = useState<Record<Instrument, BandEnvelope> | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const [sensitivity, setSensitivity] = useState<Sensitivity>(DEFAULT_SENSITIVITY);
  const [bpm, setBpm] = useState(120);
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  const [stepsPerBeat, setStepsPerBeat] = useState(4);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);

  const [grid, setGrid] = useState<DrumGrid | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  // Read inside the playback-sync effect instead of depending on `grid` directly, so toggling
  // a cell or re-quantizing mid-playback (which replaces the grid object) doesn't tear down
  // and rebuild the rAF loop/listeners — that briefly froze the real-time cursor before.
  const gridRef = useRef<DrumGrid | null>(null);
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  function handleFile(file: File) {
    setVideoFile(file);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setStatus('idle');
    setErrorMessage(null);
    setNotice(null);
    setEnvelopes(null);
    setDuration(null);
    setGrid(null);
  }

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  async function handleAnalyze() {
    if (!videoFile) return;
    setStatus('decoding');
    setErrorMessage(null);
    setNotice(null);
    try {
      const buffer = await decodeAudioFromFile(videoFile);
      setStatus('analyzing');
      const envs = await computeBandEnvelopes(buffer);
      const onsets = detectOnsetsFromEnvelopes(envs, sensitivity);
      const detectedBpm = estimateBpm(onsets) ?? 120;

      setEnvelopes(envs);
      setDuration(buffer.duration);
      setBpm(detectedBpm);
      setOffsetSeconds(0);
      setGrid(
        quantizeOnsets(onsets, {
          bpm: detectedBpm,
          offsetSeconds: 0,
          stepsPerBeat,
          beatsPerMeasure,
          durationSeconds: buffer.duration,
        }),
      );
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : '解析中にエラーが発生しました。');
    }
  }

  // Re-quantize whenever detection parameters change (cheap: reuses cached envelopes).
  useEffect(() => {
    if (!envelopes || duration === null) return;
    const onsets = detectOnsetsFromEnvelopes(envelopes, sensitivity);
    setGrid(
      quantizeOnsets(onsets, {
        bpm,
        offsetSeconds,
        stepsPerBeat,
        beatsPerMeasure,
        durationSeconds: duration,
      }),
    );
  }, [envelopes, duration, sensitivity, bpm, offsetSeconds, stepsPerBeat, beatsPerMeasure]);

  function handleAutoDetectBpm() {
    if (!envelopes) return;
    const onsets = detectOnsetsFromEnvelopes(envelopes, sensitivity);
    const detected = estimateBpm(onsets);
    if (detected) {
      setBpm(detected);
      setNotice(null);
    } else {
      setNotice('BPMを自動検出できませんでした。手動で入力するかタップテンポをお試しください。');
    }
  }

  function handleSensitivityChange(instrument: Instrument, value: number) {
    setSensitivity((prev) => ({ ...prev, [instrument]: value }));
  }

  function handleToggleCell(stepIndex: number, instrument: Instrument) {
    setGrid((prev) => {
      if (!prev) return prev;
      const steps = prev.steps.map((step, i) =>
        i === stepIndex ? { ...step, [instrument]: !step[instrument] } : step,
      );
      return { ...prev, steps };
    });
  }

  function handleSeek(stepIndex: number) {
    const video = videoRef.current;
    if (!video || !grid) return;
    video.currentTime = grid.offsetSeconds + stepIndex * grid.stepSeconds;
  }

  // Playback cursor synced to the video element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !gridRef.current) return;
    let rafId = 0;

    function updateFromTime() {
      const g = gridRef.current;
      if (!g) return;
      const time = video!.currentTime;
      const idx = Math.floor((time - g.offsetSeconds) / g.stepSeconds);
      setCurrentStepIndex(idx >= 0 && idx < g.steps.length ? idx : -1);
      setCurrentTimeSeconds(time);
    }
    function tick() {
      updateFromTime();
      rafId = requestAnimationFrame(tick);
    }
    function onPlay() {
      rafId = requestAnimationFrame(tick);
    }
    function onPause() {
      cancelAnimationFrame(rafId);
      updateFromTime();
    }
    function onSeeked() {
      // Only a one-off refresh here: if the video is still playing (e.g. the user sought
      // mid-playback via double-click), the running tick loop already owns the updates,
      // and cancelling it here would freeze the cursor even though playback continues.
      updateFromTime();
    }

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    return () => {
      cancelAnimationFrame(rafId);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
    };
    // Only (re)attach when a grid first becomes available/unavailable, not on every
    // grid content change — see the gridRef comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(grid)]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>ドラム譜メーカー</h1>
        <p>動画を読み込んで、演奏されているドラムのリズムを譜面（ドラムタブ）に変換します。</p>
      </header>

      <VideoDropzone fileName={videoFile?.name ?? null} onFile={handleFile} />

      {videoUrl && (
        <div className="video-panel">
          <video ref={videoRef} src={videoUrl} controls>
            <track kind="captions" />
          </video>
          <div className="video-panel__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleAnalyze}
              disabled={status === 'decoding' || status === 'analyzing'}
            >
              {status === 'decoding'
                ? '音声を読み込み中…'
                : status === 'analyzing'
                  ? '解析中…'
                  : '解析する'}
            </button>
            {status === 'ready' && (
              <span className="status">解析完了。下の設定で調整できます。</span>
            )}
            {status === 'error' && errorMessage && (
              <span className="status status--error">{errorMessage}</span>
            )}
          </div>
        </div>
      )}

      {grid && (status === 'ready' || status === 'analyzing') && (
        <>
          <AnalysisControls
            bpm={bpm}
            onBpmChange={setBpm}
            onAutoDetectBpm={handleAutoDetectBpm}
            offsetSeconds={offsetSeconds}
            onOffsetChange={setOffsetSeconds}
            stepsPerBeat={stepsPerBeat}
            onStepsPerBeatChange={setStepsPerBeat}
            beatsPerMeasure={beatsPerMeasure}
            onBeatsPerMeasureChange={setBeatsPerMeasure}
            sensitivity={sensitivity}
            onSensitivityChange={handleSensitivityChange}
          />
          {notice && <p className="status">{notice}</p>}

          <section className="app__sheet-section">
            <DrumSheet
              grid={grid}
              currentStepIndex={currentStepIndex}
              currentTimeSeconds={currentTimeSeconds}
              onToggleCell={handleToggleCell}
              onSeek={handleSeek}
            />
            <button type="button" className="btn btn--ghost" onClick={() => window.print()}>
              印刷 / PDF保存
            </button>
          </section>
        </>
      )}
    </div>
  );
}
