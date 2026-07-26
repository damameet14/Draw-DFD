import {
    type DFDDiagram,
    type ValidationResult,
} from '../data_flow_diagram_model/public_interface';

/**
 * Suppresses findings that would be noise on an empty or partially authored
 * diagram, so a user who has just opened the application is not shown a wall of
 * errors for work they have not started yet.
 *
 * This is a presentation concern deliberately kept separate from the rules
 * themselves in `validateDataFlowDiagram`.
 *
 * Expects a diagram already narrowed to one level by `projectDiagramToLevel`.
 *
 * This used to also drop D-001 ("Level 0 must contain exactly one process")
 * whenever the diagram held exactly one process, to paper over the rule firing
 * on levels it does not apply to. That was a symptom of validating all three
 * levels at once: D-001 counted processes across every level and compared them
 * against a `diagram.level` that was always 0. With the diagram narrowed to one
 * level first, D-001 only fires when the level-0 process count is not one, so
 * the suppression could never match a real finding and has been removed.
 */
export function filterValidationResultsForDisplay(
    validationResults: ValidationResult[],
    diagram: DFDDiagram
): ValidationResult[] {
    const hasAnyDataFlow = diagram.edges.length > 0;

    return validationResults.filter(validationResult => {
        // On a diagram with no flows yet, show only errors that are actionable
        // without any connections having been drawn.
        if (!hasAnyDataFlow) {
            if (validationResult.severity !== 'error') return false;
            const ruleCodesSuppressedBeforeAnyFlowExists = ['N-004', 'P-001', 'P-002', 'L0-001'];
            return !ruleCodesSuppressedBeforeAnyFlowExists.includes(validationResult.ruleCode);
        }

        return true;
    });
}
