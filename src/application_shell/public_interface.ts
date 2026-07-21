/**
 * Public interface of the application_shell module.
 *
 * The application root is the default export because `main.tsx` mounts it as the
 * single entry component. Visibility preferences are exported for canvas
 * components, which read them without knowing where the toggles are rendered.
 */

export { default } from './DataFlowDiagramApplication';
export {
    DiagramVisibilityPreferencesProvider,
    useDiagramVisibilityPreferences,
    type DiagramVisibilityPreferences,
} from './diagramVisibilityPreferences';
