/**
 * Public interface of the diagram_canvas module.
 *
 * Only the canvas itself is public. Individual node and edge renderers are
 * internal: they are wired up through `canvasNodeAndEdgeRegistry` and must not
 * be imported from outside this module.
 */

export { DataFlowDiagramCanvas } from './DataFlowDiagramCanvas';
