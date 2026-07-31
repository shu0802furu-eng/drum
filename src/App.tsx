import { useState } from 'react';
import './App.css';
import { DrumSheetMaker } from './components/DrumSheetMaker';
import { ProgressLog } from './components/ProgressLog';

type View = 'sheet' | 'progress';

function App() {
  const [view, setView] = useState<View>('sheet');

  return (
    <div className="shell">
      <nav className="tabbar">
        <button
          type="button"
          className={`tabbar__tab${view === 'sheet' ? ' tabbar__tab--active' : ''}`}
          onClick={() => setView('sheet')}
        >
          譜面作成
        </button>
        <button
          type="button"
          className={`tabbar__tab${view === 'progress' ? ' tabbar__tab--active' : ''}`}
          onClick={() => setView('progress')}
        >
          上達ログ
        </button>
      </nav>
      {view === 'sheet' ? <DrumSheetMaker /> : <ProgressLog />}
    </div>
  );
}

export default App;
