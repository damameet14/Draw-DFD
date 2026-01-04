import { DFDCanvas } from './components/diagram/DFDCanvas';
import { Level0Form } from './components/forms/Level0Form';
import { useDiagramStore } from './store/useDiagramStore';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import styles from './App.module.css';

function App() {
  const { validationResults } = useDiagramStore();

  return (
    <div className={styles.appContainer}>
      <Level0Form />

      <main className={styles.mainContent}>
        <div className={styles.validationBar}>
          {validationResults.map(result => (
            <div
              key={result.id}
              className={`${styles.validationAlert} ${result.severity === 'error' ? styles.validationError :
                  result.severity === 'warning' ? styles.validationWarning :
                    styles.validationInfo
                }`}
            >
              <AlertTriangle size={16} />
              <span>[{result.ruleCode}] {result.message}</span>
            </div>
          ))}
          {validationResults.length === 0 && (
            <div className={styles.validationSuccess}>
              <CheckCircle size={12} /> Valid DFD
            </div>
          )}
        </div>

        <DFDCanvas />
      </main>
    </div>
  );
}

export default App;
