import { useMemo } from 'react';
import { type ValidationResult } from '../data_flow_diagram_model/public_interface';
import { collectDisplayableValidationResults } from '../diagram_validation/public_interface';
import { useDiagramStore } from './useDiagramStore';

/**
 * Derives the displayable validation findings for the current diagram.
 *
 * Validation was previously recomputed inside every store mutation and stored on
 * the state object, which meant the whole rule set ran on each keystroke whether
 * or not anything rendered the result. Deriving it here means the cost is paid
 * only by components that actually subscribe.
 */
export function useDiagramValidationResults(): ValidationResult[] {
    const diagram = useDiagramStore((state) => state.diagram);
    return useMemo(() => collectDisplayableValidationResults(diagram), [diagram]);
}
