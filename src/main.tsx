import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Imported directly rather than through the module barrel: see the note in
// application_shell/public_interface.ts about the canvas import cycle.
import DataFlowDiagramApplication from './application_shell/DataFlowDiagramApplication'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataFlowDiagramApplication />
  </StrictMode>,
)
