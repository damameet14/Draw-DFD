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
 * KNOWN ISSUE: the D-001 branch below unconditionally drops the "exactly one
 * process" finding whenever the diagram has one process, including on Level 1
 * and Level 2 where D-001 is never raised in the first place. The original
 * comment claimed the underlying rule "incorrectly triggers sometimes". The
 * suppression is preserved here to keep behavior unchanged during the module
 * restructure; the underlying rule should be diagnosed separately.
 */
export function filterValidationResultsForDisplay(
    validationResults: ValidationResult[],
    diagram: DFDDiagram
): ValidationResult[] {
    const hasAnyDataFlow = diagram.edges.length > 0;
    const processNodeCount = diagram.nodes.filter(node => node.type === 'process').length;

    return validationResults.filter(validationResult => {
        if (validationResult.ruleCode === 'D-001' && processNodeCount === 1) {
            return false;
        }

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
