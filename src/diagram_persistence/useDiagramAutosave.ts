import { useEffect, useRef } from 'react';
import { useDiagramStore } from '../diagram_state/public_interface';
import { parseDiagramDocument, serializeDiagramDocument } from './dataFlowDiagramDocument';

const STORAGE_KEY = 'draw-dfd:autosaved-diagram';

/** How long editing must pause before the diagram is written to storage. */
const AUTOSAVE_QUIET_PERIOD_MS = 600;

/**
 * Keeps the working diagram in `localStorage` so a refresh, a crash, or a closed
 * tab does not throw the work away.
 *
 * Restoring happens once, before the autosave subscription is attached, so the
 * empty starting diagram can never be written over a real saved one.
 *
 * A failed read is discarded rather than surfaced: the saved copy is a
 * convenience, and refusing to start the editor because of a corrupt autosave
 * would be worse than quietly beginning fresh. Explicit file opens, where the
 * user chose a specific file, do report their errors.
 */
export function useDiagramAutosave(): void {
    const hasRestored = useRef(false);

    useEffect(() => {
        if (!hasRestored.current) {
            hasRestored.current = true;
            restoreAutosavedDiagram();
        }

        let pendingWrite: ReturnType<typeof setTimeout> | undefined;

        const unsubscribe = useDiagramStore.subscribe((state, previousState) => {
            if (state.diagram === previousState.diagram) return;

            clearTimeout(pendingWrite);
            pendingWrite = setTimeout(() => {
                writeAutosavedDiagram();
            }, AUTOSAVE_QUIET_PERIOD_MS);
        });

        return () => {
            clearTimeout(pendingWrite);
            unsubscribe();
        };
    }, []);
}

function restoreAutosavedDiagram(): void {
    let savedText: string | null = null;

    try {
        savedText = window.localStorage.getItem(STORAGE_KEY);
    } catch {
        // Storage can be unavailable in private browsing or when blocked.
        return;
    }

    if (!savedText) return;

    const result = parseDiagramDocument(savedText);
    if (result.ok) {
        useDiagramStore.getState().loadDiagram(result.diagram);
    }
}

function writeAutosavedDiagram(): void {
    try {
        const { diagram } = useDiagramStore.getState();
        window.localStorage.setItem(STORAGE_KEY, serializeDiagramDocument(diagram));
    } catch {
        // A full or unavailable storage quota must not interrupt editing.
    }
}

/** Forgets the autosaved copy, so a reset is not undone by the next reload. */
export function clearAutosavedDiagram(): void {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to do; the caller is resetting either way.
    }
}
