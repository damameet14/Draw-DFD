/**
 * Public interface of the data_flow_diagram_model module.
 *
 * Every other module must import Data Flow Diagram contracts from here rather
 * than reaching into `dataFlowDiagramContracts.ts` directly, so that the
 * internal file organization of this module can change without breaking callers.
 */

export type {
    DFDLevel,
    DFDNodeType,
    DFDNodeBase,
    DFDNode,
    DFDEdge,
    DFDDiagram,
    EntityNode,
    ProcessNode,
    DataStoreNode,
    ExternalProcessNode,
    ValidationResult,
} from './dataFlowDiagramContracts';
