import {
    type DFDDiagram,
    type DFDLevel,
    type ValidationResult,
} from '../data_flow_diagram_model/public_interface';
import { validateDataFlowDiagram } from './validateDataFlowDiagram';
import { filterValidationResultsForDisplay } from './filterValidationResultsForDisplay';
import { projectDiagramToLevel } from './projectDiagramToLevel';

/**
 * Primary public operation of this module: validate one level of a diagram and
 * return only the findings that are worth showing to a user in its current state.
 *
 * Callers use this instead of running the steps themselves, so the ordering of
 * "narrow to the level, validate, then filter" is owned here rather than
 * repeated at every call site.
 *
 * `level` is required because the store holds every level in one diagram; see
 * `projectDiagramToLevel` for why validating the unsliced diagram is wrong.
 */
export function collectDisplayableValidationResults(
    diagram: DFDDiagram,
    level: DFDLevel
): ValidationResult[] {
    const diagramForLevel = projectDiagramToLevel(diagram, level);
    return filterValidationResultsForDisplay(
        validateDataFlowDiagram(diagramForLevel),
        diagramForLevel
    );
}
