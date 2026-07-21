import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import DataFlowDiagramApplication from './application_shell/public_interface'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataFlowDiagramApplication />
  </StrictMode>,
)
