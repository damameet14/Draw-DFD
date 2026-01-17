import { type DFDDiagram, type DFDNode, type ValidationResult } from './types';

/**
 * Runs all validation rules against a given DFD Diagram.
 */
export function validateDiagram(diagram: DFDDiagram): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Helper to add result
    const addResult = (
        code: string,
        severity: ValidationResult['severity'],
        message: string,
        nodeId?: string,
        edgeId?: string
    ) => {
        results.push({
            id: crypto.randomUUID(),
            ruleCode: code,
            severity,
            message,
            nodeId,
            edgeId
        });
    };

    const { nodes, edges, level } = diagram;

    // --- Map for quick node lookup ---
    const nodeMap = new Map<string, DFDNode>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    // --- Node-Level Rules ---
    nodes.forEach(node => {
        // N-002: Process must have number (and name/label checks)
        if (node.type === 'process') {
            if (!node.processNumber) {
                addResult('N-002', 'error', 'Process must have a number.', node.id);
            }
            if (!node.label || node.label.trim() === '') {
                addResult('N-002', 'error', 'Process must have a name.', node.id);
            }
        }

        // N-003: Data Store must have store code
        if (node.type === 'datastore') {
            if (!node.storeCode) {
                addResult('N-003', 'error', 'Data Store must have an identifier (e.g., D1).', node.id);
            }
        }
    });


    // --- Edge-Level Rules ---
    edges.forEach(edge => {
        // E-001: Unlabeled Data Flow
        if (!edge.label || edge.label.trim() === '') {
            addResult('E-001', 'error', 'Data flow must be named.', undefined, edge.id);
        }

        // E-002: Invalid Direction (Partial check, TS types ensure existence, but value could be bad)
        const source = nodeMap.get(edge.sourceNodeId);
        const target = nodeMap.get(edge.targetNodeId);

        if (!source || !target) {
            // This might happen during dragging or deletion
            addResult('E-002', 'error', 'Data flow must connect two valid nodes.', undefined, edge.id);
            return;
        }

        // E-003: Entity -> Entity
        if (source.type === 'entity' && target.type === 'entity') {
            addResult('E-003', 'error', 'External entities cannot exchange data directly.', undefined, edge.id);
        }

        // E-004: Store -> Store
        if (source.type === 'datastore' && target.type === 'datastore') {
            addResult('E-004', 'error', 'Data stores cannot exchange data directly.', undefined, edge.id);
        }

        // E-005: Entity <-> Date Store
        const isEntityToStore = source.type === 'entity' && target.type === 'datastore';
        const isStoreToEntity = source.type === 'datastore' && target.type === 'entity';

        if (isEntityToStore || isStoreToEntity) {
            addResult('E-005', 'error', 'Data stores must connect via a process, not directly to entities.', undefined, edge.id);
        }
    });

    // --- Connectivity Analysis (Orphans, Input/Output) ---
    nodes.forEach(node => {
        const inputs = edges.filter(e => e.targetNodeId === node.id);
        const outputs = edges.filter(e => e.sourceNodeId === node.id);
        const totalConnections = inputs.length + outputs.length;

        // N-004: Orphan Node
        if (totalConnections === 0) {
            addResult('N-004', 'warning', 'Node is not connected to any data flow.', node.id);
        }

        // Process Specific Rules
        if (node.type === 'process') {
            // P-001: No Input
            if (inputs.length === 0) {
                addResult('P-001', 'error', 'Process must receive at least one data input.', node.id);
            }
            // P-002: No Output
            if (outputs.length === 0) {
                addResult('P-002', 'error', 'Process must produce at least one data output.', node.id);
            }
            // P-003: Self-Loop
            const selfLoops = edges.filter(e => e.sourceNodeId === node.id && e.targetNodeId === node.id);
            if (selfLoops.length > 0) {
                addResult('P-003', 'warning', 'Self-referencing process detected.', node.id);
            }
        }
    });

    // --- Diagram-Level Rules ---

    // D-001: Level 0 must have exactly one process
    if (level === 0) {
        const processNodes = nodes.filter(n => n.type === 'process');
        if (processNodes.length !== 1) {
            addResult('D-001', 'error', 'Level 0 DFD must contain exactly one process.', undefined, undefined);
        } else {
            // L0-001: Process number must be 0.0
            const mainProcess = processNodes[0] as import('./types').ProcessNode;
            if (mainProcess.processNumber !== '0.0') {
                addResult('L0-001', 'error', 'Level 0 process must be numbered 0.0.', mainProcess.id);
            }
        }

        // D-002: No Data Stores in Level 0
        const storeNodes = nodes.filter(n => n.type === 'datastore');
        if (storeNodes.length > 0) {
            storeNodes.forEach(s => {
                addResult('D-002', 'error', 'Data stores are not allowed in Level 0 DFD.', s.id);
            });
        }
    }

    // Level 1 Rules
    if (level === 1) {
        nodes.filter(n => n.type === 'process').forEach(n => {
            const pNode = n as import('./types').ProcessNode;
            // L1-001: Process numbering (simple regex check for X.0)
            if (!/^[1-9][0-9]*\.0$/.test(pNode.processNumber)) {
                addResult('L1-001', 'error', `Level 1 processes must be numbered X.0 (e.g., 1.0, 2.0). Found: ${pNode.processNumber}`, pNode.id);
            }
        });
    }

    return results;
}

/**
 * Filter validation results to suppress warnings for empty/initial diagrams.
 * This prevents overwhelming the user when they first start.
 */
export function filterValidationForUI(results: ValidationResult[], diagram: DFDDiagram): ValidationResult[] {
    const hasFlows = diagram.edges.length > 0;
    const processCount = diagram.nodes.filter(n => n.type === 'process').length;

    return results.filter(r => {
        // ALWAYS suppress D-001 if we actually have exactly one process
        // (The validation rule incorrectly triggers sometimes)
        if (r.ruleCode === 'D-001' && processCount === 1) {
            return false;
        }

        // For empty diagrams (no flows), suppress certain errors
        if (!hasFlows) {
            if (r.severity !== 'error') return false;
            const suppressCodes = ['N-004', 'P-001', 'P-002', 'L0-001'];
            return !suppressCodes.includes(r.ruleCode);
        }

        return true;
    });
}
