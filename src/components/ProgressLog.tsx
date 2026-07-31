import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProgressEntry } from '../lib/progressStore';
import { addProgressEntry, deleteProgressEntry, getAllProgressEntries } from '../lib/progressStore';
import { buildShareHtml, downloadHtml } from '../lib/shareExport';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProgressLog() {
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [recordedAt, setRecordedAt] = useState(todayIso());
  const [note, setNote] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [compareIds, setCompareIds] = useState<string[]>([]);

  const [shareIds, setShareIds] = useState<string[]>([]);
  const [authorName, setAuthorName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getAllProgressEntries()
      .then((loaded) => {
        if (!cancelled) setEntries(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('保存済みの記録を読み込めませんでした。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1)),
    [entries],
  );

  const objectUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      map.set(entry.id, URL.createObjectURL(entry.video));
    }
    return map;
  }, [entries]);

  useEffect(() => {
    return () => {
      for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    };
  }, [objectUrls]);

  async function handleAdd() {
    if (!pendingFile) {
      setError('動画ファイルを選択してください。');
      return;
    }
    setSaving(true);
    setError(null);
    const entry: ProgressEntry = {
      id: crypto.randomUUID(),
      title: title.trim() || '無題の練習',
      recordedAt,
      note: note.trim(),
      video: pendingFile,
      createdAt: Date.now(),
    };
    try {
      await addProgressEntry(entry);
      setEntries((prev) => [...prev, entry]);
      setTitle('');
      setNote('');
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setError('保存に失敗しました。動画のサイズが大きすぎる可能性があります。');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteProgressEntry(id);
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    setCompareIds((prev) => prev.filter((x) => x !== id));
    setShareIds((prev) => prev.filter((x) => x !== id));
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  function toggleShare(id: string) {
    setShareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleExportShare() {
    const selected = entries.filter((entry) => shareIds.includes(entry.id));
    if (selected.length === 0) {
      setShareError('共有する記録を選んでください。');
      return;
    }
    setExporting(true);
    setShareError(null);
    try {
      const html = await buildShareHtml(selected, authorName);
      downloadHtml(html, `drum-progress-${todayIso()}.html`);
    } catch {
      setShareError('書き出しに失敗しました。動画のサイズが大きすぎる可能性があります。');
    } finally {
      setExporting(false);
    }
  }

  const compareEntries = compareIds
    .map((id) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is ProgressEntry => Boolean(entry))
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : 1));

  return (
    <div className="app">
      <header className="app__header">
        <h1>上達ログ</h1>
        <p>練習動画を記録して、ドラムの上達具合をあとから見比べられます。データはこの端末のブラウザ内にのみ保存されます。</p>
      </header>

      <div className="upload-card">
        <p className="controls__section-title">練習動画を追加</p>
        <div className="upload-card__row">
          <label className="field">
            <span>動画ファイル</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="field">
            <span>タイトル</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 8ビート練習"
            />
          </label>
          <label className="field">
            <span>日付</span>
            <input
              type="date"
              value={recordedAt}
              onChange={(e) => setRecordedAt(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span>メモ</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="気づいたことなど"
          />
        </label>
        <div>
          <button type="button" className="btn btn--primary" onClick={handleAdd} disabled={saving}>
            {saving ? '保存中…' : '記録に追加'}
          </button>
        </div>
        {error && <p className="status status--error">{error}</p>}
      </div>

      <div className="upload-card">
        <p className="controls__section-title">他の人に共有する</p>
        <p className="controls__note">
          一覧の各記録にある「共有に含める」にチェックを付けて選び、単独のHTMLファイルとして書き出します。動画も中に埋め込まれるので、そのファイルを送るだけで相手はアプリなしにブラウザで再生できます。サーバーには保存されません。
        </p>
        <div className="upload-card__row">
          <label className="field">
            <span>名前（任意）</span>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="例: たろう"
            />
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleExportShare}
            disabled={exporting}
          >
            {exporting
              ? '書き出し中…'
              : `選択した${shareIds.length}件を共有ファイルに書き出す`}
          </button>
        </div>
        {shareError && <p className="status status--error">{shareError}</p>}
      </div>

      {compareEntries.length === 2 && (
        <div className="sheet-card">
          <div className="sheet-card__header">
            <h2>見比べる</h2>
            <span className="sheet-card__meta">
              {compareEntries[0].recordedAt} → {compareEntries[1].recordedAt}
            </span>
          </div>
          <div className="compare-grid">
            {compareEntries.map((entry) => (
              <div className="compare-grid__item" key={entry.id}>
                <video src={objectUrls.get(entry.id)} controls>
                  <track kind="captions" />
                </video>
                <p className="compare-grid__caption">
                  <strong>{entry.title}</strong>
                  <br />
                  {entry.recordedAt}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="progress-list">
        {loading && <p className="status">読み込み中…</p>}
        {!loading && sortedEntries.length === 0 && (
          <p className="status">まだ記録がありません。最初の練習動画を追加してみましょう。</p>
        )}
        {sortedEntries.map((entry) => (
          <div className="progress-item" key={entry.id}>
            <video src={objectUrls.get(entry.id)} controls>
              <track kind="captions" />
            </video>
            <div className="progress-item__body">
              <div className="progress-item__header">
                <strong>{entry.title}</strong>
                <span className="progress-item__date">{entry.recordedAt}</span>
              </div>
              {entry.note && <p className="progress-item__note">{entry.note}</p>}
              <div className="progress-item__actions">
                <label className="progress-item__compare">
                  <input
                    type="checkbox"
                    checked={compareIds.includes(entry.id)}
                    onChange={() => toggleCompare(entry.id)}
                  />
                  見比べる
                </label>
                <label className="progress-item__compare">
                  <input
                    type="checkbox"
                    checked={shareIds.includes(entry.id)}
                    onChange={() => toggleShare(entry.id)}
                  />
                  共有に含める
                </label>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => handleDelete(entry.id)}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
