/**
 * Public interface of the diagram_canvas module.
 *
 * Only the canvas, the provider it needs, and the image renderer are public.
 * Individual node and edge renderers are internal: they are wired up through
 * `canvasNodeAndEdgeRegistry` and must not be imported from outside this module.
 */

export { DataFlowDiagramCanvas } from './DataFlowDiagramCanvas';
export { DiagramCanvasProvider } from './DiagramCanvasProvider';
export { useDiagramImageRenderer } from './useDiagramImageRenderer';
