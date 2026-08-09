import { type DFDDiagram } from '../data_flow_diagram_model/public_interface';
import {
    parseDiagramDocument,
    serializeDiagramDocument,
    toDiagramFileName,
    type DiagramDocumentParseResult,
} from './dataFlowDiagramDocument';

/**
 * Moves diagrams between the editor and the user's file system.
 *
 * Everything here goes through an anchor click or a file input rather than any
 * network call: a diagram never leaves the browser.
 */

function triggerDownload(href: string, fileName: string): void {
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/** Saves the diagram as a `.dfd.json` file in the user's downloads. */
export function downloadDiagramAsFile(diagram: DFDDiagram): void {
    const blob = new Blob([serializeDiagramDocument(diagram)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);

    try {
        triggerDownload(objectUrl, toDiagramFileName(diagram.name, 'dfd.json'));
    } finally {
        // Revoked on the next tick so the click has already been handled.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
}

/** Saves already-serialised draw.io XML as a `.drawio` file. */
export function downloadDrawIoDocument(drawIoXml: string, diagramName: string): void {
    const blob = new Blob([drawIoXml], { type: 'application/xml' });
    const objectUrl = URL.createObjectURL(blob);

    try {
        triggerDownload(objectUrl, toDiagramFileName(diagramName, 'drawio'));
    } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
}

/** Saves an already-rendered image (a data URL) under the diagram's name. */
export function downloadImageDataUrl(dataUrl: string, diagramName: string, extension: string): void {
    triggerDownload(dataUrl, toDiagramFileName(diagramName, extension));
}

export interface PickedTextFile {
    fileName: string;
    text: string;
}

/**
 * Opens the browser's file picker and reads the chosen file as text.
 *
 * Resolves to `null` when the user dismisses the picker, which is not an error
 * and should leave the current diagram alone.
 *
 * @param accept value for the input's `accept` attribute, e.g. `'.csv,text/csv'`
 */
export function pickAndReadTextFile(accept: string): Promise<PickedTextFile | null> {
    return new Promise((resolve, reject) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = accept;

        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }

            file.text()
                .then((text) => resolve({ fileName: file.name, text }))
                .catch(() => reject(new Error('That file could not be read.')));
        });

        // Firing on cancel is only supported in newer browsers; where it is not,
        // the promise simply stays pending and the picker is a no-op.
        fileInput.addEventListener('cancel', () => resolve(null));

        fileInput.click();
    });
}

/** Opens the file picker and parses the chosen file as a saved diagram. */
export async function pickAndReadDiagramFile(): Promise<DiagramDocumentParseResult | null> {
    let picked: PickedTextFile | null;

    try {
        picked = await pickAndReadTextFile('.json,application/json');
    } catch {
        return { ok: false, error: 'That file could not be read.' };
    }

    return picked === null ? null : parseDiagramDocument(picked.text);
}
