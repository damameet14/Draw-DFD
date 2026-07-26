import { useCallback, useEffect, useState } from 'react';
import { Download, FilePlus2, FolderOpen, Image, Save } from 'lucide-react';
import { useDiagramStore } from '../diagram_state/public_interface';
import { useDiagramImageRenderer } from '../diagram_canvas/public_interface';
import {
    clearAutosavedDiagram,
    downloadDiagramAsFile,
    downloadImageDataUrl,
    pickAndReadDiagramFile,
} from '../diagram_persistence/public_interface';
import styles from './DiagramDocumentActions.module.css';

const STATUS_VISIBLE_MS = 4000;

interface StatusMessage {
    tone: 'success' | 'error';
    text: string;
}

/**
 * Save, open, export, and reset for the whole document.
 *
 * These act on the entire diagram rather than the level on screen, because a
 * saved file is one document covering all three levels — the same thing the
 * store holds.
 */
export function DiagramDocumentActions() {
    const diagram = useDiagramStore((state) => state.diagram);
    const loadDiagram = useDiagramStore((state) => state.loadDiagram);
    const resetDiagram = useDiagramStore((state) => state.resetDiagram);
    const renderDiagramImage = useDiagramImageRenderer();

    const [status, setStatus] = useState<StatusMessage | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        if (!status) return;
        const timer = setTimeout(() => setStatus(null), STATUS_VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [status]);

    const handleSave = useCallback(() => {
        downloadDiagramAsFile(diagram);
        setStatus({ tone: 'success', text: 'Diagram saved to your downloads.' });
    }, [diagram]);

    const handleOpen = useCallback(async () => {
        const result = await pickAndReadDiagramFile();
        // The user dismissed the picker; leave the current diagram alone.
        if (result === null) return;

        if (!result.ok) {
            setStatus({ tone: 'error', text: result.error });
            return;
        }

        loadDiagram(result.diagram);
        setStatus({ tone: 'success', text: `Opened "${result.diagram.name}".` });
    }, [loadDiagram]);

    const handleExportImage = useCallback(async () => {
        setIsExporting(true);
        try {
            const dataUrl = await renderDiagramImage();
            downloadImageDataUrl(dataUrl, diagram.name, 'png');
            setStatus({ tone: 'success', text: 'Image exported to your downloads.' });
        } catch (error) {
            setStatus({
                tone: 'error',
                text: error instanceof Error ? error.message : 'The image could not be exported.',
            });
        } finally {
            setIsExporting(false);
        }
    }, [renderDiagramImage, diagram.name]);

    const handleReset = useCallback(() => {
        const isConfirmed = window.confirm(
            'Start a new diagram? Everything on all three levels will be discarded. ' +
            'Save first if you want to keep it.'
        );
        if (!isConfirmed) return;

        // Clearing the autosave too, or the discarded diagram returns on reload.
        clearAutosavedDiagram();
        resetDiagram();
        setStatus({ tone: 'success', text: 'Started a new diagram.' });
    }, [resetDiagram]);

    return (
        <div className={styles.actionGroup}>
            <button className={styles.actionButton} onClick={handleSave} title="Save the diagram as a file">
                <Save size={16} />
                <span>Save</span>
            </button>
            <button className={styles.actionButton} onClick={handleOpen} title="Open a saved diagram file">
                <FolderOpen size={16} />
                <span>Open</span>
            </button>
            <button
                className={styles.actionButton}
                onClick={handleExportImage}
                disabled={isExporting}
                title="Export the current level as a PNG image"
            >
                {isExporting ? <Download size={16} /> : <Image size={16} />}
                <span>{isExporting ? 'Exporting…' : 'PNG'}</span>
            </button>
            <button className={styles.actionButton} onClick={handleReset} title="Discard everything and start over">
                <FilePlus2 size={16} />
                <span>New</span>
            </button>

            {status && (
                <div
                    className={`${styles.status} ${status.tone === 'error' ? styles.statusError : styles.statusSuccess}`}
                    role="status"
                >
                    {status.text}
                </div>
            )}
        </div>
    );
}
