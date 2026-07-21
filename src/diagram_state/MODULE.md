# Module: diagram_state

## Purpose

Owns the single in-memory Data Flow Diagram being authored and every supported
mutation of it.

## Owned responsibilities

- The current `DFDDiagram` and its lifecycle (load, reset).
- Node and edge mutations.
- Drag behavior that keeps processes and data stores column-aligned on the
  decomposed levels.
- Uniform process-circle diameter per level.
- Deriving validation findings on demand.

## Responsibilities explicitly NOT owned

- Validation rules — owned by `diagram_validation`.
- Rendering and geometry — owned by `diagram_canvas`.
- Which level is currently displayed — owned by `application_shell`. Note that
  `diagram.level` also exists and is used by validation; the displayed level is
  passed explicitly to the canvas.

## Public operations

| Operation | Notes |
| --- | --- |
| `useDiagramStore` | Zustand hook; select the slice you need |
| `useDiagramValidationResults` | Derived findings for the current diagram |

### Store actions

`setDiagramName`, `setLevel`, `addNode`, `updateNode`, `removeNode`, `addEdge`,
`updateEdge`, `removeEdge`, `loadDiagram`, `resetDiagram`,
`moveNodeApplyingColumnAlignment`, `syncProcessNodeDiameter`.

## Internal responsibility map

| File | Responsibility |
| --- | --- |
| `useDiagramStore.ts` | Store definition and all mutations |
| `useDiagramValidationResults.ts` | Memoized validation derivation |
| `public_interface.ts` | Exports the supported hooks |

## Dependencies and side effects

Depends on `data_flow_diagram_model` and `diagram_validation`. State is held in
memory only — there is no persistence, so a page reload discards the diagram.

## Invariants

- Every mutation replaces objects immutably; nothing is mutated in place.
- `removeNode` also removes edges referencing that node, so no edge dangles.
- `resetDiagram` builds a fresh diagram rather than reusing a shared constant.

## Tests

`tests/useDiagramStore.test.ts`
