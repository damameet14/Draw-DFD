export type DFDLevel = 0 | 1 | 2;

export type DFDNodeType = 'entity' | 'process' | 'datastore' | 'process_ref';

// Base Node Interface
export interface DFDNodeBase {
    id: string;
    type: DFDNodeType;
    label: string;
    level: DFDLevel;
    position: { x: number; y: number }; // For drag & drop state
    parentProcessId?: string; // For Level 2, associating with a parent process
}

// Concrete Node Types
export interface EntityNode extends DFDNodeBase {
    type: 'entity';
    width?: number;  // Optional custom width (default: 160px)
    height?: number; // Optional custom height (default: 80px)
    // Optional: Role metadata if needed (e.g., 'admin', 'customer')
}

export interface ProcessNode extends DFDNodeBase {
    type: 'process';
    processNumber: string; // "0.0", "1.0", "3.2"
    diameter?: number; // Optional custom diameter (default: 200px)
}

export interface DataStoreNode extends DFDNodeBase {
    type: 'datastore';
    storeCode: string; // "D1", "D2"
}

export interface ExternalProcessNode extends DFDNodeBase {
    type: 'process_ref';
    width?: number;
    height?: number;
}

export type DFDNode = EntityNode | ProcessNode | DataStoreNode | ExternalProcessNode;

// Edge Interface
export interface DFDEdge {
    id: string;
    type: 'dataflow';
    label: string;
    sourceNodeId: string;
    targetNodeId: string;
    level: DFDLevel;
    sourceAngleOffset?: number; // Angle offset in degrees for source handle on process circles
    targetAngleOffset?: number; // Angle offset in degrees for target handle on process circles
    sourceHandle?: string;
    targetHandle?: string;
    arrowDirection?: 'horizontal-first' | 'vertical-first' | 'smart'; // Auto or Manual arrow path direction
    labelOffset?: number; // Label position along path (0-1, default 0.5 for center)
}

// Diagram Interface
export interface DFDDiagram {
    id: string;
    name: string;
    level: DFDLevel;
    systemName: string;
    nodes: DFDNode[];
    edges: DFDEdge[];
    parentDiagramId?: string | null; // For linking sub-diagrams
}

// Validation Result Interface
export interface ValidationResult {
    id: string;
    severity: 'error' | 'warning' | 'info';
    ruleCode: string; // e.g., "DFD-E-001"
    message: string;
    nodeId?: string;
    edgeId?: string;
}
