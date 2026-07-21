/**
 * Public interface of the diagram_validation module.
 *
 * Prefer `collectDisplayableValidationResults` for user-facing validation. The
 * two underlying steps are exported for callers that need the unfiltered rule
 * output (for example, an export or reporting feature).
 */

export { collectDisplayableValidationResults } from './collectDisplayableValidationResults';
export { validateDataFlowDiagram } from './validateDataFlowDiagram';
export { filterValidationResultsForDisplay } from './filterValidationResultsForDisplay';
