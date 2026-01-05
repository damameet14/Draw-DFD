import { useState, createContext } from 'react';
import { DFDCanvas } from './components/diagram/DFDCanvas';
import { Level0Form } from './components/forms/Level0Form';
import { Level1Form } from './components/forms/Level1Form';
import styles from './App.module.css';
import { type DFDLevel } from './core/types';
import { Eye, EyeOff } from 'lucide-react';

// Create context for controlling UI visibility
export const UIVisibilityContext = createContext({
  showHandles: true,
  showArrowButtons: true
});

function App() {
  const [currentLevel, setCurrentLevel] = useState<DFDLevel>(0);
  const [showHandles, setShowHandles] = useState(true);
  const [showArrowButtons, setShowArrowButtons] = useState(true);

  return (
    <UIVisibilityContext.Provider value={{ showHandles, showArrowButtons }}>
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
          </div>
        </div>

        {/* Conditional Form Rendering */}
        {currentLevel === 0 ? <Level0Form /> : <Level1Form />}

        <main className={styles.mainContent}>
          <DFDCanvas currentLevel={currentLevel} />
        </main>
      </div>
    </UIVisibilityContext.Provider>
  );
}

export default App;
