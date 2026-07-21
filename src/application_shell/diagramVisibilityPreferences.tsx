import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * User preferences controlling which diagram affordances are drawn.
 *
 * These live in their own module rather than in the application component so
 * that canvas components can consume them without importing the application
 * root, which previously created an import cycle
 * (application -> canvas -> application).
 */
export interface DiagramVisibilityPreferences {
    /** Connection handles drawn on process, entity, and data store nodes. */
    areFlowHandlesVisible: boolean;
    /** In-canvas buttons that flip a flow between horizontal- and vertical-first routing. */
    areArrowDirectionButtonsVisible: boolean;
    /** Background alignment grid. */
    isBackgroundGridVisible: boolean;

    toggleFlowHandlesVisibility: () => void;
    toggleArrowDirectionButtonsVisibility: () => void;
    toggleBackgroundGridVisibility: () => void;
}

const noOperation = () => undefined;

const DiagramVisibilityPreferencesContext = createContext<DiagramVisibilityPreferences>({
    areFlowHandlesVisible: true,
    areArrowDirectionButtonsVisible: true,
    isBackgroundGridVisible: true,
    toggleFlowHandlesVisibility: noOperation,
    toggleArrowDirectionButtonsVisibility: noOperation,
    toggleBackgroundGridVisibility: noOperation,
});

export function DiagramVisibilityPreferencesProvider({ children }: { children: ReactNode }) {
    const [areFlowHandlesVisible, setAreFlowHandlesVisible] = useState(true);
    const [areArrowDirectionButtonsVisible, setAreArrowDirectionButtonsVisible] = useState(true);
    const [isBackgroundGridVisible, setIsBackgroundGridVisible] = useState(true);

    const preferences = useMemo<DiagramVisibilityPreferences>(
        () => ({
            areFlowHandlesVisible,
            areArrowDirectionButtonsVisible,
            isBackgroundGridVisible,
            toggleFlowHandlesVisibility: () => setAreFlowHandlesVisible((isVisible) => !isVisible),
            toggleArrowDirectionButtonsVisibility: () =>
                setAreArrowDirectionButtonsVisible((isVisible) => !isVisible),
            toggleBackgroundGridVisibility: () =>
                setIsBackgroundGridVisible((isVisible) => !isVisible),
        }),
        [areFlowHandlesVisible, areArrowDirectionButtonsVisible, isBackgroundGridVisible]
    );

    return (
        <DiagramVisibilityPreferencesContext.Provider value={preferences}>
            {children}
        </DiagramVisibilityPreferencesContext.Provider>
    );
}

export function useDiagramVisibilityPreferences(): DiagramVisibilityPreferences {
    return useContext(DiagramVisibilityPreferencesContext);
}
