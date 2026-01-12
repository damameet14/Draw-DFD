import { useState, createContext } from 'react';
import { DFDCanvas } from './components/diagram/DFDCanvas';
import { Level0Form } from './components/forms/Level0Form';
import { Level1Form } from './components/forms/Level1Form';
import { Level2Form } from './components/forms/Level2Form';
import styles from './App.module.css';
import { type DFDLevel } from './core/types';
import { Eye, EyeOff, Grid2x2 } from 'lucide-react';

// Create context for controlling UI visibility
export const UIVisibilityContext = createContext({
  showHandles: true,
  showArrowButtons: true,
  showGrid: true
});

function App() {
  const [currentLevel, setCurrentLevel] = useState<DFDLevel>(0);
  const [showHandles, setShowHandles] = useState(true);
  const [showArrowButtons, setShowArrowButtons] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  return (
    <UIVisibilityContext.Provider value={{ showHandles, showArrowButtons, showGrid }}>
      <div className={styles.appContainer}>
        {/* Level Tabs */}
        <div className={styles.tabContainer}>
          <button
            className={`${styles.tab} ${currentLevel === 0 ? styles.tabActive : ''}`}
            onClick={() => setCurrentLevel(0)}
          >
            Level 0
          </button>
          <button
            className={`${styles.tab} ${currentLevel === 1 ? styles.tabActive : ''}`}
            onClick={() => setCurrentLevel(1)}
          >
            Level 1
          </button>
          <button
            className={`${styles.tab} ${currentLevel === 2 ? styles.tabActive : ''}`}
            onClick={() => setCurrentLevel(2)}
          >
            Level 2
          </button>

          {/* Visibility toggles */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              className={styles.toggleButton}
              onClick={() => setShowHandles(!showHandles)}
              title={showHandles ? "Hide handles" : "Show handles"}
            >
              {showHandles ? <Eye size={16} /> : <EyeOff size={16} />}
              <span>Handles</span>
            </button>
            <button
              className={styles.toggleButton}
              onClick={() => setShowArrowButtons(!showArrowButtons)}
              title={showArrowButtons ? "Hide arrow buttons" : "Show arrow buttons"}
            >
              {showArrowButtons ? <Eye size={16} /> : <EyeOff size={16} />}
              <span>Arrow Buttons</span>
            </button>
            <button
              className={styles.toggleButton}
              onClick={() => setShowGrid(!showGrid)}
              title={showGrid ? "Hide grid" : "Show grid"}
            >
              <Grid2x2 size={16} />
              <span>Grid</span>
            </button>
          </div>
        </div>

        {/* Conditional Form Rendering */}
        {currentLevel === 0 ? <Level0Form /> : currentLevel === 1 ? <Level1Form /> : <Level2Form />}

        <main className={styles.mainContent}>
          <DFDCanvas currentLevel={currentLevel} />
        </main>
      </div>
    </UIVisibilityContext.Provider>
  );
}

export default App;
