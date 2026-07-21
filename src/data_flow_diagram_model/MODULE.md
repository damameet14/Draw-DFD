# Module: data_flow_diagram_model

## Purpose

Defines the shared vocabulary of a Data Flow Diagram: nodes, edges, diagrams,
levels, and validation results. This module is the single source of truth for
what a DFD *is*.

## Owned responsibilities

- Node contracts (`EntityNode`, `ProcessNode`, `DataStoreNode`, `ExternalProcessNode`).
- Edge contract (`DFDEdge`) including handle placement and routing metadata.
- Diagram contract (`DFDDiagram`) and level vocabulary (`DFDLevel`).
- The `ValidationResult` contract returned by `diagram_validation`.

## Responsibilities explicitly NOT owned

- Validation rules and their severities — owned by `diagram_validation`.
- Mutation, history, and selection state — owned by `diagram_state`.
- Rendering, geometry, and handle angles — owned by `diagram_canvas`.
- Authoring workflows and form state — owned by `diagram_authoring`.

## Public contracts

Exported from `public_interface.ts`. These are pure type declarations with no
runtime behavior and no dependencies.

## Internal responsibility map

| File | Responsibility |
| --- | --- |
| `dataFlowDiagramContracts.ts` | All contract declarations |
| `public_interface.ts` | Re-exports the supported contracts |

## Dependencies and side effects

None. This module imports nothing and performs no side effects.

## Allowed callers

Every other module in the application.

## Invariants

- `DFDNode` is a discriminated union on `type`; new node kinds must extend it
  and be handled by `diagram_validation` and `diagram_canvas`.
- Every node and edge carries a `level`; the canvas and forms filter by it.

## Tests

None. Type-only module, verified by `tsc` during `npm run build`.
