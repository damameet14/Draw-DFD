/**
 * Public interface of the diagram_persistence module.
 *
 * Everything here is local to the browser: files go through the download and
 * file-picker APIs, and the autosave copy goes to `localStorage`. No diagram is
 * sent anywhere.
 */

export {
    serializeDiagramDocument,
    parseDiagramDocument,
    toDiagramFileName,
    DIAGRAM_DOCUMENT_FORMAT,
    DIAGRAM_DOCUMENT_VERSION,
    type DataFlowDiagramDocument,
    type DiagramDocumentParseResult,
} from './dataFlowDiagramDocument';

export {
    downloadDiagramAsFile,
    downloadImageDataUrl,
    pickAndReadDiagramFile,
} from './diagramFileTransfer';

export { useDiagramAutosave, clearAutosavedDiagram } from './useDiagramAutosave';
