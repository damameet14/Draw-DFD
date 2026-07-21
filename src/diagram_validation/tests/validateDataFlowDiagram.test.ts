import { describe, it, expect } from 'vitest';
import {
    type DFDDiagram,
    type DFDEdge,
    type DFDLevel,
    type DFDNode,
} from '../../data_flow_diagram_model/public_interface';
import { validateDataFlowDiagram } from '../validateDataFlowDiagram';
import { filterValidationResultsForDisplay } from '../filterValidationResultsForDisplay';
import { collectDisplayableValidationResults } from '../collectDisplayableValidationResults';

function buildDiagram(
    level: DFDLevel,
    nodes: DFDNode[],
    edges: DFDEdge[] = []
): DFDDiagram {
    return { id: 'test-diagram', name: 'Test', systemName: 'Test System', level, nodes, edges };
}

function buildProcess(id: string, processNumber: string, level: DFDLevel = 0): DFDNode {
    return { id, type: 'process', label: `Process ${id}`, level, position: { x: 0, y: 0 }, processNumber };
}

function buildEntity(id: string, level: DFDLevel = 0): DFDNode {
    return { id, type: 'entity', label: `Entity ${id}`, level, position: { x: 0, y: 0 } };
}

function buildDataStore(id: string, storeCode: string, level: DFDLevel = 1): DFDNode {
    return { id, type: 'datastore', label: `Store ${id}`, level, position: { x: 0, y: 0 }, storeCode };
}

function buildFlow(
    id: string,
    sourceNodeId: string,
    targetNodeId: string,
    level: DFDLevel = 0,
    label = 'some data'
): DFDEdge {
    return { id, type: 'dataflow', label, sourceNodeId, targetNodeId, level };
}

function ruleCodesFrom(diagram: DFDDiagram): string[] {
    return validateDataFlowDiagram(diagram).map(result => result.ruleCode);
}

describe('validateDataFlowDiagram — node rules', () => {
    it('reports N-002 when a process has no number', () => {
        const diagram = buildDiagram(0, [buildProcess('p1', '')]);
        expect(ruleCodesFrom(diagram)).toContain('N-002');
    });

    it('reports N-002 when a process has a blank name', () => {
        const process = { ...buildProcess('p1', '0.0'), label: '   ' } as DFDNode;
        const diagram = buildDiagram(0, [process]);
        expect(ruleCodesFrom(diagram)).toContain('N-002');
    });

    it('reports N-003 when a data store has no store code', () => {
        const diagram = buildDiagram(1, [buildDataStore('d1', '')]);
        expect(ruleCodesFrom(diagram)).toContain('N-003');
    });

    it('reports N-004 as a warning for a node with no flows', () => {
        const diagram = buildDiagram(1, [buildEntity('e1', 1)]);
        const orphanFindings = validateDataFlowDiagram(diagram).filter(r => r.ruleCode === 'N-004');
        expect(orphanFindings).toHaveLength(1);
        expect(orphanFindings[0].severity).toBe('warning');
        expect(orphanFindings[0].nodeId).toBe('e1');
    });
});

describe('validateDataFlowDiagram — edge rules', () => {
    it('reports E-001 for an unnamed flow', () => {
        const diagram = buildDiagram(
            0,
            [buildEntity('e1'), buildProcess('p1', '0.0')],
            [buildFlow('f1', 'e1', 'p1', 0, '')]
        );
        expect(ruleCodesFrom(diagram)).toContain('E-001');
    });

    it('reports E-002 when a flow references a missing node', () => {
        const diagram = buildDiagram(0, [buildEntity('e1')], [buildFlow('f1', 'e1', 'ghost')]);
        expect(ruleCodesFrom(diagram)).toContain('E-002');
    });

    it('reports E-003 for entity to entity', () => {
        const diagram = buildDiagram(
            0,
            [buildEntity('e1'), buildEntity('e2')],
            [buildFlow('f1', 'e1', 'e2')]
        );
        expect(ruleCodesFrom(diagram)).toContain('E-003');
    });

    it('reports E-004 for data store to data store', () => {
        const diagram = buildDiagram(
            1,
            [buildDataStore('d1', 'D1'), buildDataStore('d2', 'D2')],
            [buildFlow('f1', 'd1', 'd2', 1)]
        );
        expect(ruleCodesFrom(diagram)).toContain('E-004');
    });

    it('reports E-005 for entity to data store in both directions', () => {
        const entityToStore = buildDiagram(
            1,
            [buildEntity('e1', 1), buildDataStore('d1', 'D1')],
            [buildFlow('f1', 'e1', 'd1', 1)]
        );
        const storeToEntity = buildDiagram(
            1,
            [buildEntity('e1', 1), buildDataStore('d1', 'D1')],
            [buildFlow('f1', 'd1', 'e1', 1)]
        );
        expect(ruleCodesFrom(entityToStore)).toContain('E-005');
        expect(ruleCodesFrom(storeToEntity)).toContain('E-005');
    });

    it('stops evaluating an edge once E-002 fires, so a dangling edge yields no type rules', () => {
        const diagram = buildDiagram(0, [buildEntity('e1')], [buildFlow('f1', 'e1', 'ghost')]);
        const edgeFindings = validateDataFlowDiagram(diagram).filter(r => r.edgeId === 'f1');
        expect(edgeFindings.map(r => r.ruleCode)).toEqual(['E-002']);
    });
});

describe('validateDataFlowDiagram — process connectivity', () => {
    it('reports P-001 when a process has no input', () => {
        const diagram = buildDiagram(
            0,
            [buildProcess('p1', '0.0'), buildEntity('e1')],
            [buildFlow('f1', 'p1', 'e1')]
        );
        expect(ruleCodesFrom(diagram)).toContain('P-001');
    });

    it('reports P-002 when a process has no output', () => {
        const diagram = buildDiagram(
            0,
            [buildProcess('p1', '0.0'), buildEntity('e1')],
            [buildFlow('f1', 'e1', 'p1')]
        );
        expect(ruleCodesFrom(diagram)).toContain('P-002');
    });

    it('reports P-003 as a warning for a self-referencing process', () => {
        const diagram = buildDiagram(0, [buildProcess('p1', '0.0')], [buildFlow('f1', 'p1', 'p1')]);
        const selfLoopFindings = validateDataFlowDiagram(diagram).filter(r => r.ruleCode === 'P-003');
        expect(selfLoopFindings).toHaveLength(1);
        expect(selfLoopFindings[0].severity).toBe('warning');
    });

    it('raises neither P-001 nor P-002 for a fully connected process', () => {
        const diagram = buildDiagram(
            0,
            [buildProcess('p1', '0.0'), buildEntity('e1'), buildEntity('e2')],
            [buildFlow('f1', 'e1', 'p1'), buildFlow('f2', 'p1', 'e2')]
        );
        const codes = ruleCodesFrom(diagram);
        expect(codes).not.toContain('P-001');
        expect(codes).not.toContain('P-002');
    });
});

describe('validateDataFlowDiagram — level rules', () => {
    it('reports D-001 when Level 0 has more than one process', () => {
        const diagram = buildDiagram(0, [buildProcess('p1', '0.0'), buildProcess('p2', '0.0')]);
        expect(ruleCodesFrom(diagram)).toContain('D-001');
    });

    it('reports D-001 when Level 0 has no process at all', () => {
        const diagram = buildDiagram(0, [buildEntity('e1')]);
        expect(ruleCodesFrom(diagram)).toContain('D-001');
    });

    it('reports L0-001 when the Level 0 process is not numbered 0.0', () => {
        const diagram = buildDiagram(0, [buildProcess('p1', '1.0')]);
        expect(ruleCodesFrom(diagram)).toContain('L0-001');
    });

    it('reports D-002 once per data store on Level 0', () => {
        const diagram = buildDiagram(0, [
            buildProcess('p1', '0.0'),
            buildDataStore('d1', 'D1', 0),
            buildDataStore('d2', 'D2', 0),
        ]);
        expect(ruleCodesFrom(diagram).filter(code => code === 'D-002')).toHaveLength(2);
    });

    it('accepts X.0 numbering on Level 1 and rejects anything else', () => {
        const valid = buildDiagram(1, [buildProcess('p1', '1.0', 1), buildProcess('p2', '12.0', 1)]);
        const invalid = buildDiagram(1, [buildProcess('p1', '1.1', 1), buildProcess('p2', '0.0', 1)]);
        expect(ruleCodesFrom(valid)).not.toContain('L1-001');
        expect(ruleCodesFrom(invalid).filter(code => code === 'L1-001')).toHaveLength(2);
    });

    it('does not apply Level 0 rules to Level 1 diagrams', () => {
        const diagram = buildDiagram(1, [
            buildProcess('p1', '1.0', 1),
            buildProcess('p2', '2.0', 1),
            buildDataStore('d1', 'D1', 1),
        ]);
        const codes = ruleCodesFrom(diagram);
        expect(codes).not.toContain('D-001');
        expect(codes).not.toContain('D-002');
    });
});

describe('filterValidationResultsForDisplay', () => {
    it('suppresses warnings while the diagram has no flows', () => {
        const diagram = buildDiagram(0, [buildProcess('p1', '0.0'), buildEntity('e1')]);
        const displayed = collectDisplayableValidationResults(diagram);
        expect(displayed.every(result => result.severity === 'error')).toBe(true);
        expect(displayed.map(r => r.ruleCode)).not.toContain('N-004');
    });

    it('suppresses P-001 and P-002 until at least one flow exists', () => {
        const diagram = buildDiagram(0, [buildProcess('p1', '0.0')]);
        const codes = collectDisplayableValidationResults(diagram).map(r => r.ruleCode);
        expect(codes).not.toContain('P-001');
        expect(codes).not.toContain('P-002');
    });

    it('surfaces P-001 once a flow exists', () => {
        const diagram = buildDiagram(
            0,
            [buildProcess('p1', '0.0'), buildEntity('e1')],
            [buildFlow('f1', 'p1', 'e1')]
        );
        expect(collectDisplayableValidationResults(diagram).map(r => r.ruleCode)).toContain('P-001');
    });

    it('drops D-001 whenever exactly one process exists (documents the known suppression)', () => {
        const diagram = buildDiagram(
            0,
            [buildProcess('p1', '0.0'), buildEntity('e1')],
            [buildFlow('f1', 'e1', 'p1')]
        );
        expect(collectDisplayableValidationResults(diagram).map(r => r.ruleCode)).not.toContain('D-001');
    });

    it('keeps D-001 when the process count is not one', () => {
        const diagram = buildDiagram(
            0,
            [buildProcess('p1', '0.0'), buildProcess('p2', '0.0'), buildEntity('e1')],
            [buildFlow('f1', 'e1', 'p1'), buildFlow('f2', 'p1', 'e1')]
        );
        expect(collectDisplayableValidationResults(diagram).map(r => r.ruleCode)).toContain('D-001');
    });

    it('composes validate-then-filter identically to calling both steps by hand', () => {
        const diagram = buildDiagram(
            1,
            [buildProcess('p1', '1.0', 1), buildDataStore('d1', 'D1', 1)],
            [buildFlow('f1', 'p1', 'd1', 1)]
        );
        const byHand = filterValidationResultsForDisplay(validateDataFlowDiagram(diagram), diagram);
        const composed = collectDisplayableValidationResults(diagram);
        expect(composed.map(r => r.ruleCode)).toEqual(byHand.map(r => r.ruleCode));
    });
});

describe('validateDataFlowDiagram — purity', () => {
    it('does not mutate the diagram it validates', () => {
        const diagram = buildDiagram(
            0,
            [buildProcess('p1', '0.0'), buildEntity('e1')],
            [buildFlow('f1', 'e1', 'p1')]
        );
        const snapshot = JSON.stringify(diagram);
        validateDataFlowDiagram(diagram);
        expect(JSON.stringify(diagram)).toBe(snapshot);
    });
});
