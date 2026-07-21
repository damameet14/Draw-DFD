import { useState } from 'react';
import { Eye, EyeOff, Grid2x2 } from 'lucide-react';
import { DataFlowDiagramCanvas } from '../diagram_canvas/public_interface';
import {
    ContextDiagramForm,
    ProcessDecompositionForm,
    SubProcessDecompositionForm,
} from '../diagram_authoring/public_interface';
import { type DFDLevel } from '../data_flow_diagram_model/public_interface';
import {
    DiagramVisibilityPreferencesProvider,
    useDiagramVisibilityPreferences,
} from './diagramVisibilityPreferences';
import styles from './DataFlowDiagramApplication.module.css';

const AUTHORING_FORM_BY_LEVEL: Record<DFDLevel, () => React.ReactElement> = {
    0: ContextDiagramForm,
    1: ProcessDecompositionForm,
    2: SubProcessDecompositionForm,
};

const LEVEL_TAB_LABELS: Array<{ level: DFDLevel; label: string }> = [
    { level: 0, label: 'Level 0' },
    { level: 1, label: 'Level 1' },
    { level: 2, label: 'Level 2' },
];

/**
 * Toolbar toggles for canvas affordances. Reads preferences from context so the
 * application root does not have to thread visibility state through props.
 */
function DiagramVisibilityToggles() {
    const {
        areFlowHandlesVisible,
        areArrowDirectionButtonsVisible,
        toggleFlowHandlesVisibility,
        toggleArrowDirectionButtonsVisibility,
        toggleBackgroundGridVisibility,
    } = useDiagramVisibilityPreferences();

    return (
        <div className={styles.visibilityToggleGroup}>
            <button
                className={styles.toggleButton}
                onClick={toggleFlowHandlesVisibility}
                title={areFlowHandlesVisible ? 'Hide handles' : 'Show handles'}
            >
                {areFlowHandlesVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                <span>Handles</span>
            </button>
            <button
                className={styles.toggleButton}
                onClick={toggleArrowDirectionButtonsVisibility}
                title={areArrowDirectionButtonsVisible ? 'Hide arrow buttons' : 'Show arrow buttons'}
            >
                {areArrowDirectionButtonsVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                <span>Arrow Buttons</span>
            </button>
            <button
                className={styles.toggleButton}
                onClick={toggleBackgroundGridVisibility}
                title="Toggle grid"
            >
                <Grid2x2 size={16} />
                <span>Grid</span>
            </button>
        </div>
    );
}

/**
 * Application root: owns which DFD level is on screen and assembles the
 * authoring form and canvas for that level. Contains no diagram rules.
 */
function DataFlowDiagramApplication() {
    const [currentLevel, setCurrentLevel] = useState<DFDLevel>(0);
    const AuthoringFormForCurrentLevel = AUTHORING_FORM_BY_LEVEL[currentLevel];

    return (
        <DiagramVisibilityPreferencesProvider>
            <div className={styles.appContainer}>
                <div className={styles.tabContainer}>
                    {LEVEL_TAB_LABELS.map(({ level, label }) => (
                        <button
                            key={level}
                            className={`${styles.tab} ${currentLevel === level ? styles.tabActive : ''}`}
                            onClick={() => setCurrentLevel(level)}
                        >
                            {label}
                        </button>
                    ))}

                    <DiagramVisibilityToggles />
                </div>

                <AuthoringFormForCurrentLevel />

                <main className={styles.mainContent}>
                    <DataFlowDiagramCanvas currentLevel={currentLevel} />
                </main>
            </div>
        </DiagramVisibilityPreferencesProvider>
    );
}

export default DataFlowDiagramApplication;
