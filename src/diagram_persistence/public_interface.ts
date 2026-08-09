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
    serializeDrawIoDocument,
    type CanvasPoint,
    type DrawIoFlowRoute,
    type DrawIoPage,
    type DrawIoShapePlacement,
} from './drawIoDiagramExport';

export {
    downloadDiagramAsFile,
    downloadDrawIoDocument,
    downloadImageDataUrl,
    pickAndReadDiagramFile,
    pickAndReadTextFile,
    type PickedTextFile,
} from './diagramFileTransfer';

export { useDiagramAutosave, clearAutosavedDiagram } from './useDiagramAutosave';
