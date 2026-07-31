import { useState } from 'react';
import './App.css';
import { DrumSheetMaker } from './components/DrumSheetMaker';
import { ProgressLog } from './components/ProgressLog';
import { PracticeCalendar } from './components/PracticeCalendar';

type View = 'sheet' | 'progress' | 'calendar';

const TABS: Array<{ id: View; label: string }> = [
  { id: 'sheet', label: '譜面作成' },
  { id: 'progress', label: '上達ログ' },
  { id: 'calendar', label: 'カレンダー' },
];

function App() {
  const [view, setView] = useState<View>('sheet');

  return (
    <div className="shell">
      <nav className="tabbar">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={`tabbar__tab${view === tab.id ? ' tabbar__tab--active' : ''}`}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {view === 'sheet' && <DrumSheetMaker />}
      {view === 'progress' && <ProgressLog />}
      {view === 'calendar' && <PracticeCalendar />}
    </div>
  );
}

export default App;
