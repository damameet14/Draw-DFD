import { type ReactNode } from 'react';
import { ReactFlowProvider } from 'reactflow';

/**
 * Shares one canvas instance with everything rendered inside it.
 *
 * The application shell needs this so its toolbar can export the diagram as an
 * image: reading node positions requires the canvas instance, and without a
 * provider that instance is only reachable from inside the canvas component
 * itself. Wrapping here also keeps `reactflow` an implementation detail of this
 * module — the shell never imports it.
 */
export function DiagramCanvasProvider({ children }: { children: ReactNode }) {
    return <ReactFlowProvider>{children}</ReactFlowProvider>;
}
