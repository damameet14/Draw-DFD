import { useEffect, useState } from 'react';
import { Eye, EyeOff, Grid2x2 } from 'lucide-react';
import { DataFlowDiagramCanvas, DiagramCanvasProvider } from '../diagram_canvas/public_interface';
import {
    ContextDiagramForm,
    ProcessDecompositionForm,
    SubProcessDecompositionForm,
} from '../diagram_authoring/public_interface';
import { useDiagramValidationResults } from '../diagram_state/public_interface';
import { useDiagramAutosave } from '../diagram_persistence/public_interface';
import { type DFDLevel } from '../data_flow_diagram_model/public_interface';
import {
    DiagramVisibilityPreferencesProvider,
    useDiagramVisibilityPreferences,
} from './diagramVisibilityPreferences';
import { ValidationFindingsPanel } from './ValidationFindingsPanel';
import { DiagramDocumentActions } from './DiagramDocumentActions';
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
    const [focusedElementId, setFocusedElementId] = useState<string | null>(null);
    const AuthoringFormForCurrentLevel = AUTHORING_FORM_BY_LEVEL[currentLevel];

    // Findings are computed once here and shared, so the canvas highlighting and
    // the panel listing cannot disagree about what is wrong.
    const validationFindings = useDiagramValidationResults(currentLevel);

    // Restores the last session's diagram, then keeps it saved as it changes.
    useDiagramAutosave();

    // A focused element belongs to the level it was found on.
    useEffect(() => setFocusedElementId(null), [currentLevel]);

    return (
        <DiagramVisibilityPreferencesProvider>
            {/* Wraps the toolbar as well as the canvas, so the PNG export can
                read live node positions from the canvas instance. */}
            <DiagramCanvasProvider>
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
                        <DiagramDocumentActions />
                    </div>

                    <AuthoringFormForCurrentLevel />

                    <main className={styles.mainContent}>
                        <DataFlowDiagramCanvas
                            currentLevel={currentLevel}
                            validationFindings={validationFindings}
                            focusedElementId={focusedElementId}
                        />
                        <ValidationFindingsPanel
                            findings={validationFindings}
                            focusedElementId={focusedElementId}
                            onFocusElement={setFocusedElementId}
                        />
                    </main>
                </div>
            </DiagramCanvasProvider>
        </DiagramVisibilityPreferencesProvider>
    );
}

export default DataFlowDiagramApplication;
