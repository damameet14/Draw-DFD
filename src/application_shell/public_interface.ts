/**
 * Public interface of the application_shell module.
 *
 * Visibility preferences are exported for canvas components, which read them
 * without knowing where the toggles are rendered.
 *
 * The application root is deliberately NOT re-exported here. `diagram_canvas`
 * imports this barrel for the preferences, and the shell imports
 * `diagram_canvas` for the canvas and the image export — so re-exporting the
 * root made every canvas import pull the entire application back in, and the
 * cycle failed at module-evaluation time with "cannot access
 * DecomposedDataStoreNode before initialization". `main.tsx`, as the
 * composition root, imports the application component directly instead.
 */

export {
    DiagramVisibilityPreferencesProvider,
    useDiagramVisibilityPreferences,
    type DiagramVisibilityPreferences,
} from './diagramVisibilityPreferences';
