# Module: diagram_validation

## Purpose

Decides whether a Data Flow Diagram is structurally valid, and which findings are
worth showing to the user given how complete the diagram currently is.

## Owned responsibilities

- The DFD rule set and its severities (see rule codes below).
- Presentation-level suppression of findings on empty or partial diagrams.

## Responsibilities explicitly NOT owned

- Storing or recomputing results — `diagram_state` derives them on demand.
- Rendering findings — no module currently displays them (see Known gaps).
- Contract shapes — owned by `data_flow_diagram_model`.

## Public operations

| Operation | Input | Output |
| --- | --- | --- |
| `collectDisplayableValidationResults` | `DFDDiagram` | `ValidationResult[]` fit for display |
| `validateDataFlowDiagram` | `DFDDiagram` | every finding, unfiltered |
| `filterValidationResultsForDisplay` | `ValidationResult[]`, `DFDDiagram` | suppressed subset |

## Rule set

| Code | Severity | Rule |
| --- | --- | --- |
| `N-002` | error | Process needs a number and a name |
| `N-003` | error | Data store needs an identifier |
| `N-004` | warning | Node has no connected data flow |
| `E-001` | error | Data flow must be named |
| `E-002` | error | Data flow must connect two existing nodes |
| `E-003` | error | Entity may not flow directly to an entity |
| `E-004` | error | Data store may not flow directly to a data store |
| `E-005` | error | Data store and entity must connect through a process |
| `P-001` | error | Process needs at least one input |
| `P-002` | error | Process needs at least one output |
| `P-003` | warning | Process references itself |
| `D-001` | error | Level 0 holds exactly one process |
| `D-002` | error | Level 0 holds no data stores |
| `L0-001` | error | Level 0 process is numbered `0.0` |
| `L1-001` | error | Level 1 processes are numbered `X.0` |

## Internal responsibility map

| File | Responsibility |
| --- | --- |
| `validateDataFlowDiagram.ts` | The rule set; pure, no dependencies beyond contracts |
| `filterValidationResultsForDisplay.ts` | Display suppression policy |
| `collectDisplayableValidationResults.ts` | Composes validate-then-filter |
| `public_interface.ts` | Exports the supported operations |

## Dependencies and side effects

Depends only on `data_flow_diagram_model`. The single side effect is
`crypto.randomUUID()` when assigning finding identifiers.

## Invariants

- Validation never mutates the diagram it is given.
- `validateDataFlowDiagram` is deterministic apart from generated finding ids.

## Known gaps

- No module renders `ValidationResult`; the rules run but the user never sees
  them. Wiring a validation panel is tracked as separate work.
- `filterValidationResultsForDisplay` suppresses `D-001` whenever exactly one
  process exists, masking a suspected defect in the D-001 rule itself.

## Tests

`tests/validateDataFlowDiagram.test.ts`
