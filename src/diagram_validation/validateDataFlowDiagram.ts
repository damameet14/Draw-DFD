import {
    type DFDDiagram,
    type DFDNode,
    type ProcessNode,
    type ValidationResult,
} from '../data_flow_diagram_model/public_interface';

/**
 * Runs every structural Data Flow Diagram rule against a diagram and returns the
 * complete, unfiltered set of findings.
 *
 * This function is pure: it performs no input or output and does not depend on
 * React, the store, or the canvas. Presentation-level suppression lives in
 * `filterValidationResultsForDisplay`.
 */
export function validateDataFlowDiagram(diagram: DFDDiagram): ValidationResult[] {
    const validationResults: ValidationResult[] = [];

    const recordValidationResult = (
        ruleCode: string,
        severity: ValidationResult['severity'],
        message: string,
        nodeId?: string,
        edgeId?: string
    ) => {
        validationResults.push({
            id: crypto.randomUUID(),
            ruleCode,
            severity,
            message,
            nodeId,
            edgeId,
        });
    };

    const { nodes, edges, level } = diagram;

    const nodesById = new Map<string, DFDNode>();
    nodes.forEach(node => nodesById.set(node.id, node));

    // --- Node-Level Rules ---
    nodes.forEach(node => {
        // N-002: Process must have both a number and a name
        if (node.type === 'process') {
            if (!node.processNumber) {
                recordValidationResult('N-002', 'error', 'Process must have a number.', node.id);
            }
            if (!node.label || node.label.trim() === '') {
                recordValidationResult('N-002', 'error', 'Process must have a name.', node.id);
            }
        }

        // N-003: Data Store must have store code
        if (node.type === 'datastore') {
            if (!node.storeCode) {
                recordValidationResult('N-003', 'error', 'Data Store must have an identifier (e.g., D1).', node.id);
            }
        }
    });

    // --- Edge-Level Rules ---
    edges.forEach(edge => {
        // E-001: Unlabeled Data Flow
        if (!edge.label || edge.label.trim() === '') {
            recordValidationResult('E-001', 'error', 'Data flow must be named.', undefined, edge.id);
        }

        const sourceNode = nodesById.get(edge.sourceNodeId);
        const targetNode = nodesById.get(edge.targetNodeId);

        // E-002: Dangling edge, which can occur transiently during drag or deletion
        if (!sourceNode || !targetNode) {
            recordValidationResult('E-002', 'error', 'Data flow must connect two valid nodes.', undefined, edge.id);
            return;
        }

        // E-003: Entity -> Entity
        if (sourceNode.type === 'entity' && targetNode.type === 'entity') {
            recordValidationResult('E-003', 'error', 'External entities cannot exchange data directly.', undefined, edge.id);
        }

        // E-004: Store -> Store
        if (sourceNode.type === 'datastore' && targetNode.type === 'datastore') {
            recordValidationResult('E-004', 'error', 'Data stores cannot exchange data directly.', undefined, edge.id);
        }

        // E-005: Entity <-> Data Store in either direction
        const isEntityToDataStore = sourceNode.type === 'entity' && targetNode.type === 'datastore';
        const isDataStoreToEntity = sourceNode.type === 'datastore' && targetNode.type === 'entity';

        if (isEntityToDataStore || isDataStoreToEntity) {
            recordValidationResult('E-005', 'error', 'Data stores must connect via a process, not directly to entities.', undefined, edge.id);
        }
    });

    // --- Connectivity Analysis (Orphans, Input/Output) ---
    nodes.forEach(node => {
        const incomingEdges = edges.filter(edge => edge.targetNodeId === node.id);
        const outgoingEdges = edges.filter(edge => edge.sourceNodeId === node.id);
        const totalConnectionCount = incomingEdges.length + outgoingEdges.length;

        // N-004: Orphan Node
        if (totalConnectionCount === 0) {
            recordValidationResult('N-004', 'warning', 'Node is not connected to any data flow.', node.id);
        }

        if (node.type === 'process') {
            // P-001: No Input
            if (incomingEdges.length === 0) {
                recordValidationResult('P-001', 'error', 'Process must receive at least one data input.', node.id);
            }
            // P-002: No Output
            if (outgoingEdges.length === 0) {
                recordValidationResult('P-002', 'error', 'Process must produce at least one data output.', node.id);
            }
            // P-003: Self-Loop
            const selfReferencingEdges = edges.filter(
                edge => edge.sourceNodeId === node.id && edge.targetNodeId === node.id
            );
            if (selfReferencingEdges.length > 0) {
                recordValidationResult('P-003', 'warning', 'Self-referencing process detected.', node.id);
            }
        }
    });

    // --- Diagram-Level Rules ---

    if (level === 0) {
        // D-001: Level 0 must have exactly one process
        const processNodes = nodes.filter(node => node.type === 'process');
        if (processNodes.length !== 1) {
            recordValidationResult('D-001', 'error', 'Level 0 DFD must contain exactly one process.', undefined, undefined);
        } else {
            // L0-001: The single context process must be numbered 0.0
            const contextProcessNode = processNodes[0] as ProcessNode;
            if (contextProcessNode.processNumber !== '0.0') {
                recordValidationResult('L0-001', 'error', 'Level 0 process must be numbered 0.0.', contextProcessNode.id);
            }
        }

        // D-002: No Data Stores in Level 0
        nodes
            .filter(node => node.type === 'datastore')
            .forEach(dataStoreNode => {
                recordValidationResult('D-002', 'error', 'Data stores are not allowed in Level 0 DFD.', dataStoreNode.id);
            });
    }

    if (level === 1) {
        // L1-001: Level 1 processes must be numbered X.0
        nodes
            .filter(node => node.type === 'process')
            .forEach(node => {
                const processNode = node as ProcessNode;
                if (!/^[1-9][0-9]*\.0$/.test(processNode.processNumber)) {
                    recordValidationResult(
                        'L1-001',
                        'error',
                        `Level 1 processes must be numbered X.0 (e.g., 1.0, 2.0). Found: ${processNode.processNumber}`,
                        processNode.id
                    );
                }
            });
    }

    return validationResults;
}
