/**
 * Public interface of the diagram_state module.
 *
 * `useDiagramStore` is exported directly because Zustand stores are consumed as
 * hooks with caller-chosen selectors; wrapping it would remove that ability
 * without protecting any boundary.
 */

export { useDiagramStore } from './useDiagramStore';
export { useDiagramValidationResults } from './useDiagramValidationResults';
