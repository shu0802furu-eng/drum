import { useEffect, useMemo, useState } from 'react';
import { getAllProgressEntries } from '../lib/progressStore';
import { computeStreakStats } from '../lib/streaks';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function todayIso(): string {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

export function PracticeCalendar() {
  const [recordedDates, setRecordedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewedYear, setViewedYear] = useState(() => new Date().getFullYear());
  const [viewedMonth, setViewedMonth] = useState(() => new Date().getMonth());

  useEffect(() => {
    let cancelled = false;
    getAllProgressEntries()
      .then((entries) => {
        if (!cancelled) setRecordedDates(entries.map((entry) => entry.recordedAt));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = todayIso();
  const stats = useMemo(() => computeStreakStats(recordedDates, today), [recordedDates, today]);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const date of recordedDates) {
      map.set(date, (map.get(date) ?? 0) + 1);
    }
    return map;
  }, [recordedDates]);

  const cells = useMemo(() => {
    const firstWeekday = new Date(viewedYear, viewedMonth, 1).getDay();
    const daysInMonth = new Date(viewedYear, viewedMonth + 1, 0).getDate();
    const result: Array<{ day: number; date: string } | null> = [];
    for (let i = 0; i < firstWeekday; i++) result.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      result.push({ day, date: isoDate(viewedYear, viewedMonth, day) });
    }
    return result;
  }, [viewedYear, viewedMonth]);

  function goToMonth(delta: number) {
    const next = new Date(viewedYear, viewedMonth + delta, 1);
    setViewedYear(next.getFullYear());
    setViewedMonth(next.getMonth());
  }

  function goToday() {
    const now = new Date();
    setViewedYear(now.getFullYear());
    setViewedMonth(now.getMonth());
  }

  function levelFor(count: number): string {
    if (count <= 0) return '';
    if (count === 1) return 'calendar-cell--level-1';
    if (count === 2) return 'calendar-cell--level-2';
    return 'calendar-cell--level-3';
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>練習カレンダー</h1>
        <p>「上達ログ」に記録した練習日をカレンダーで振り返り、継続日数を確認できます。</p>
      </header>

      <div className="streak-stats">
        <div className="streak-stat">
          <span className="streak-stat__value">{stats.currentStreak}</span>
          <span className="streak-stat__label">現在の連続日数</span>
        </div>
        <div className="streak-stat">
          <span className="streak-stat__value">{stats.longestStreak}</span>
          <span className="streak-stat__label">最長連続記録</span>
        </div>
        <div className="streak-stat">
          <span className="streak-stat__value">{stats.totalDays}</span>
          <span className="streak-stat__label">合計練習日数</span>
        </div>
      </div>

      <div className="sheet-card">
        <div className="calendar-header">
          <button type="button" className="btn btn--ghost" onClick={() => goToMonth(-1)}>
            ← 前の月
          </button>
          <h2>
            {viewedYear}年{viewedMonth + 1}月
          </h2>
          <div className="calendar-header__right">
            <button type="button" className="btn btn--ghost" onClick={goToday}>
              今月
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => goToMonth(1)}>
              次の月 →
            </button>
          </div>
        </div>

        {loading ? (
          <p className="status">読み込み中…</p>
        ) : (
          <>
            <div className="calendar-grid calendar-grid--weekdays">
              {WEEKDAY_LABELS.map((label) => (
                <div className="calendar-weekday" key={label}>
                  {label}
                </div>
              ))}
            </div>
            <div className="calendar-grid">
              {cells.map((cell, i) => {
                if (!cell) return <div className="calendar-cell calendar-cell--empty" key={i} />;
                const count = countByDate.get(cell.date) ?? 0;
                const isToday = cell.date === today;
                return (
                  <div
                    className={`calendar-cell ${levelFor(count)}${isToday ? ' calendar-cell--today' : ''}`}
                    key={cell.date}
                    title={count > 0 ? `${cell.date}: ${count}件の練習記録` : cell.date}
                  >
                    <span className="calendar-cell__day">{cell.day}</span>
                    {count > 0 && <span className="calendar-cell__dot" />}
                  </div>
                );
              })}
            </div>
            <div className="calendar-legend">
              <span>少ない</span>
              <span className="calendar-legend__swatch" />
              <span className="calendar-legend__swatch calendar-cell--level-1" />
              <span className="calendar-legend__swatch calendar-cell--level-2" />
              <span className="calendar-legend__swatch calendar-cell--level-3" />
              <span>多い</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
