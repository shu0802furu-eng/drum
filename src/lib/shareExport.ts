import type { ProgressEntry } from './progressStore';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds a single self-contained HTML file (video data embedded inline) showing the given
 * practice entries, so it can be sent to someone else and opened directly in any browser
 * with no server, account, or app install on their end.
 */
export async function buildShareHtml(entries: ProgressEntry[], authorName: string): Promise<string> {
  const sorted = [...entries].sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : 1));
  const cards = await Promise.all(
    sorted.map(async (entry) => {
      const dataUrl = await blobToDataUrl(entry.video);
      return `
        <article class="card">
          <video src="${dataUrl}" controls></video>
          <div class="card__body">
            <div class="card__header">
              <h2>${escapeHtml(entry.title)}</h2>
              <span class="card__date">${escapeHtml(entry.recordedAt)}</span>
            </div>
            ${entry.note ? `<p class="card__note">${escapeHtml(entry.note)}</p>` : ''}
          </div>
        </article>`;
    }),
  );

  const heading = authorName.trim()
    ? `${escapeHtml(authorName.trim())}さんの上達ログ`
    : '上達ログ';

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${heading}</title>
<style>
  :root {
    --bg: #f7f7fb; --panel: #eef0f6; --border: #dcdfe8; --text: #5b5f72; --text-h: #14151f; --accent: #5b4fe0;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14151c; --panel: #1b1c26; --border: #2c2e3b; --text: #9b9fb3; --text-h: #f1f1f6; --accent: #948bff; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font: 16px/1.6 system-ui, sans-serif; color: var(--text); background: var(--bg);
  }
  .page { max-width: 720px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { color: var(--text-h); font-size: 1.8rem; margin: 0 0 8px; }
  .subtitle { margin: 0 0 28px; }
  .cards { display: flex; flex-direction: column; gap: 20px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .card video { width: 100%; max-height: 420px; display: block; background: #000; }
  .card__body { padding: 14px 18px; }
  .card__header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .card__header h2 { margin: 0; font-size: 1.1rem; color: var(--text-h); }
  .card__date { font-size: 13px; color: var(--text); }
  .card__note { margin: 8px 0 0; font-size: 14px; }
  footer { margin-top: 32px; font-size: 12px; color: var(--text); }
</style>
</head>
<body>
  <div class="page">
    <h1>${heading}</h1>
    <p class="subtitle">ドラム譜メーカーの「上達ログ」から書き出された練習記録です。</p>
    <div class="cards">
      ${cards.join('\n')}
    </div>
    <footer>このファイルは単体で動作します。サーバーへのアップロードは行われていません。</footer>
  </div>
</body>
</html>`;
}

export function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded';

/**
 * Hands the file to the OS/browser share sheet (LINE, メッセージ, メール, AirDropなど) when the
 * platform supports it, so sharing is a single tap with no manual file handling. Falls back to a
 * plain download on browsers without file-sharing support (e.g. desktop Firefox).
 */
export async function shareOrDownloadHtml(
  html: string,
  filename: string,
  shareTitle: string,
): Promise<ShareResult> {
  const file = new File([html], filename, { type: 'text/html' });
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareTitle });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    }
  }

  downloadHtml(html, filename);
  return 'downloaded';
}
