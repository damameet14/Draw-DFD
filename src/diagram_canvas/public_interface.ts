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

/**
 * Context diagram geometry. Exported because `diagram_authoring` assigns a node's
 * initial position when it is created, and that position has to agree with the
 * arc the canvas will attach its flows to.
 */
export {
    planContextDiagramLayout,
    calculateProcessNodePosition,
    calculateRequiredEntitySize,
    calculateEntityRingDistance,
    CONTEXT_PROCESS_CENTER,
    MIN_ENTITY_SIZE,
    MIN_PROCESS_DIAMETER,
    MAX_PROCESS_DIAMETER,
    DEFAULT_ENTITY_TEXT_SIZE_PX,
    DEFAULT_FLOW_LABEL_TEXT_SIZE_PX,
    MIN_TEXT_SIZE_PX,
    MAX_TEXT_SIZE_PX,
    type CanvasPosition,
    type ContextDiagramPlacement,
    type EntityFlowCounts,
} from './contextDiagramGeometry';
