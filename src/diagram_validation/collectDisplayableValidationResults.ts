import { type DFDDiagram, type ValidationResult } from '../data_flow_diagram_model/public_interface';
import { validateDataFlowDiagram } from './validateDataFlowDiagram';
import { filterValidationResultsForDisplay } from './filterValidationResultsForDisplay';

/**
 * Primary public operation of this module: validate a diagram and return only
 * the findings that are worth showing to a user in its current state.
 *
 * Callers use this instead of running the two steps themselves, so the ordering
 * of "validate then filter" is owned here rather than repeated at every call site.
 */
export function collectDisplayableValidationResults(diagram: DFDDiagram): ValidationResult[] {
    return filterValidationResultsForDisplay(validateDataFlowDiagram(diagram), diagram);
}
