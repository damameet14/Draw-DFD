import { useState } from 'react';
import { DFDCanvas } from './components/diagram/DFDCanvas';
import { Level0Form } from './components/forms/Level0Form';
import { Level1Form } from './components/forms/Level1Form';
import styles from './App.module.css';
import { type DFDLevel } from './core/types';

function App() {
  const [currentLevel, setCurrentLevel] = useState<DFDLevel>(0);

  return (
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
      </div>

      {/* Conditional Form Rendering */}
      {currentLevel === 0 ? <Level0Form /> : <Level1Form />}

      <main className={styles.mainContent}>
        <DFDCanvas currentLevel={currentLevel} />
      </main>
    </div>
  );
}

export default App;
