import { type NodeTypes, type EdgeTypes } from 'reactflow';
import { type DFDLevel } from '../data_flow_diagram_model/public_interface';

import { ContextProcessNode } from './process_node/ContextProcessNode';
import { ContextEntityNode } from './entity_node/ContextEntityNode';
import { ContextDataStoreNode } from './data_store_node/ContextDataStoreNode';

import { DecomposedProcessNode } from './process_node/DecomposedProcessNode';
import { DecomposedEntityNode } from './entity_node/DecomposedEntityNode';
import { DecomposedDataStoreNode } from './data_store_node/DecomposedDataStoreNode';

import { DataFlowOrthogonalEdge } from './data_flow_edge/DataFlowOrthogonalEdge';

/**
 * Maps DFD node kinds to the React Flow components that draw them.
 *
 * There are two renderer sets, not three. Level 0 (the context diagram) draws
 * data stores open-ended and processes without a decomposition column, while
 * Level 1 and Level 2 share a single set of decomposed renderers. Those two
 * levels previously had byte-identical duplicate component trees under
 * `level1/` and `level2/`; they are one implementation now, and the components
 * distinguish levels at runtime via each node's `level` field.
 */

const contextLevelNodeTypes: NodeTypes = {
    process: ContextProcessNode,
    entity: ContextEntityNode,
    datastore: ContextDataStoreNode,
    // A referenced external process is drawn with the same box as an entity.
    process_ref: ContextEntityNode,
};

const decomposedLevelNodeTypes: NodeTypes = {
    process: DecomposedProcessNode,
    entity: DecomposedEntityNode,
    datastore: DecomposedDataStoreNode,
    process_ref: DecomposedEntityNode,
};

/**
 * Every level routes flows with the same orthogonal edge renderer, so this is a
 * constant rather than a per-level lookup. The three former per-level edge
 * files were identical.
 */
export const dataFlowEdgeTypes: EdgeTypes = { orthogonal: DataFlowOrthogonalEdge };

export function selectNodeTypesForLevel(level: DFDLevel): NodeTypes {
    return level === 0 ? contextLevelNodeTypes : decomposedLevelNodeTypes;
}
