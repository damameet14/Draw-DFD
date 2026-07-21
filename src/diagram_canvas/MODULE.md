# Module: diagram_canvas

## Purpose

Draws the current DFD level on an interactive React Flow canvas: node shapes,
connection handles, orthogonal flow routing, and direct manipulation.

## Owned responsibilities

- Adapting `DFDNode` / `DFDEdge` contracts into React Flow's node and edge shapes.
- Node rendering for processes, entities, and data stores.
- Handle placement geometry, including the angular distribution of handles
  around process circles.
- Orthogonal edge routing, label placement, and flow direction toggling.
- Choosing which renderer set a level uses.

## Responsibilities explicitly NOT owned

- Diagram mutations — delegated to `diagram_state`.
- Validation — owned by `diagram_validation`.
- Which level is displayed — passed in as `currentLevel` by `application_shell`.

## Public operations

| Component | Input | Purpose |
| --- | --- | --- |
| `DataFlowDiagramCanvas` | `{ currentLevel: DFDLevel }` | Renders that level of the diagram |

Node and edge renderers are internal. External modules must not import them.

## Renderer sets

There are two renderer sets, not three:

- **Context** (`Context*`) — Level 0. Data stores are drawn open-ended and
  processes carry no decomposition column.
- **Decomposed** (`Decomposed*`) — Levels 1 and 2, which share one
  implementation and distinguish themselves at runtime from each node's `level`.

Before the restructure, `level1/` and `level2/` held byte-identical duplicate
component trees, and all three levels had identical edge renderers. Those are
now single implementations.

## Internal responsibility map

| File | Responsibility |
| --- | --- |
| `DataFlowDiagramCanvas.tsx` | Canvas assembly and contract adaptation |
| `canvasNodeAndEdgeRegistry.ts` | Maps node kinds and levels to renderers |
| `process_node/ContextProcessNode.tsx` | Level 0 process circle; also owns `getEntityLayoutInfo` |
| `process_node/DecomposedProcessNode.tsx` | Level 1/2 process circle |
| `entity_node/ContextEntityNode.tsx` | Level 0 external entity box |
| `entity_node/DecomposedEntityNode.tsx` | Level 1/2 external entity box |
| `data_store_node/ContextDataStoreNode.tsx` | Level 0 open-ended data store |
| `data_store_node/DecomposedDataStoreNode.tsx` | Level 1/2 boxed data store |
| `data_flow_edge/DataFlowOrthogonalEdge.tsx` | Orthogonal routing for every level |

## Dependencies and side effects

Depends on `diagram_state`, `data_flow_diagram_model`, `application_shell`
(visibility preferences), and `reactflow`. Node components attach
document-level mouse listeners while a handle is being dragged and remove them
on release.

## Invariants

- Each edge produces exactly one handle per endpoint, keyed by the edge id, so
  `sourceHandle` and `targetHandle` both equal the edge id.
- Handle geometry is derived from the diagram; manual drags are persisted as
  `sourceAngleOffset` / `targetAngleOffset` on the edge, never as local state.

## Tests

None yet. Rendering and handle geometry are untested.
