# Module: diagram_authoring

## Purpose

Lets a user declare the contents of a Data Flow Diagram — entities, processes,
data stores, and the flows between them — through a form for each DFD level.

## Owned responsibilities

- Form state while a user is composing nodes and flows.
- Translating form input into `addNode` / `addEdge` calls on `diagram_state`.
- Level-specific authoring vocabulary (context participants, process
  decomposition, sub-process decomposition).

## Responsibilities explicitly NOT owned

- Persisting or validating the diagram.
- Node placement geometry beyond the initial position assigned on creation.
- Rendering the diagram — owned by `diagram_canvas`.

## Public operations

| Component | Level | Purpose |
| --- | --- | --- |
| `ContextDiagramForm` | 0 | External entities and the single context process |
| `ProcessDecompositionForm` | 1 | Processes, data stores, and their flows |
| `SubProcessDecompositionForm` | 2 | Sub-processes within one parent process |

## Internal responsibility map

| File | Responsibility |
| --- | --- |
| `ContextDiagramForm.tsx` | Level 0 authoring |
| `ProcessDecompositionForm.tsx` | Level 1 authoring |
| `SubProcessDecompositionForm.tsx` | Level 2 authoring |
| `ContextDiagramForm.module.css` | Level 0 form styling |
| `DecompositionForm.module.css` | Styling shared by the Level 1 and Level 2 forms |

## Dependencies and side effects

Depends on `diagram_state` and `data_flow_diagram_model`. Generates node and
edge identifiers with `crypto.randomUUID()`.

## Known gaps

- The Level 1 and Level 2 forms share a stylesheet but remain separate
  components with substantial structural overlap. Their authoring vocabulary
  genuinely differs, so they were not merged during the restructure; a
  narrower shared sub-component extraction is possible future work.

## Tests

None yet. Form behavior is untested.
