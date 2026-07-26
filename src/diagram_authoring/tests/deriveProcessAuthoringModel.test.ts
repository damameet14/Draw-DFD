import { describe, it, expect } from 'vitest';
import {
    type DFDDiagram,
    type DFDEdge,
    type DFDLevel,
    type DFDNode,
} from '../../data_flow_diagram_model/public_interface';
import {
    createFlowEdgeId,
    createInteractionPairId,
    deriveProcessAuthoringModels,
    nextDataStoreCode,
    nextProcessNumber,
    selectDataStores,
    selectFlowParticipants,
    selectProcesses,
} from '../deriveProcessAuthoringModel';

function buildDiagram(nodes: DFDNode[], edges: DFDEdge[] = []): DFDDiagram {
    return { id: 'd', name: 'Test', systemName: 'Test', level: 0, nodes, edges };
}

function process(id: string, processNumber: string, level: DFDLevel = 1): DFDNode {
    return { id, type: 'process', label: `P ${id}`, level, position: { x: 0, y: 0 }, processNumber };
}

function entity(id: string, level: DFDLevel = 1): DFDNode {
    return { id, type: 'entity', label: `E ${id}`, level, position: { x: 0, y: 0 } };
}

function processRef(id: string, level: DFDLevel = 2): DFDNode {
    return { id, type: 'process_ref', label: `Ref ${id}`, level, position: { x: 0, y: 0 } };
}

function dataStore(id: string, storeCode: string, level: DFDLevel = 1): DFDNode {
    return { id, type: 'datastore', label: `S ${id}`, level, position: { x: 0, y: 0 }, storeCode };
}

function flow(
    id: string,
    sourceNodeId: string,
    targetNodeId: string,
    label = 'data',
    level: DFDLevel = 1,
    pairId?: string
): DFDEdge {
    return { id, type: 'dataflow', label, sourceNodeId, targetNodeId, level, pairId };
}

describe('selectors', () => {
    it('returns only the nodes on the requested level', () => {
        const diagram = buildDiagram([
            process('p1', '1.0', 1),
            process('p2', '2.1', 2),
            entity('e1', 1),
            dataStore('d1', 'D1', 1),
            dataStore('d2', 'D2', 2),
        ]);

        expect(selectProcesses(diagram, 1).map(n => n.id)).toEqual(['p1']);
        expect(selectDataStores(diagram, 1).map(n => n.id)).toEqual(['d1']);
        expect(selectFlowParticipants(diagram, 1).map(n => n.id)).toEqual(['e1']);
    });

    it('counts a process reference as a flow participant', () => {
        const diagram = buildDiagram([entity('e1', 2), processRef('r1', 2), process('p1', '2.1', 2)]);
        expect(selectFlowParticipants(diagram, 2).map(n => n.id)).toEqual(['e1', 'r1']);
    });
});

describe('deriveProcessAuthoringModels', () => {
    it('sorts a process\'s flows into inputs, outputs, store use, and process flows', () => {
        const pairId = 'int-abc';
        const diagram = buildDiagram(
            [process('p1', '1.0'), process('p2', '2.0'), entity('e1'), dataStore('d1', 'D1')],
            [
                flow('f-in', 'e1', 'p1', 'request'),
                flow('f-out', 'p1', 'e1', 'response'),
                flow('f-read', 'd1', 'p1', 'stored order', 1, pairId),
                flow('f-write', 'p1', 'd1', 'new order', 1, pairId),
                flow('f-proc', 'p1', 'p2', 'handoff'),
            ]
        );

        const [model] = deriveProcessAuthoringModels(diagram, 1);

        expect(model.participantInputs).toEqual([
            { edgeId: 'f-in', participantId: 'e1', label: 'request' },
        ]);
        expect(model.participantOutputs).toEqual([
            { edgeId: 'f-out', participantId: 'e1', label: 'response' },
        ]);
        expect(model.processFlows).toEqual([
            { edgeId: 'f-proc', otherProcessId: 'p2', direction: 'to', label: 'handoff' },
        ]);
        expect(model.dataStoreInteractions).toEqual([
            {
                interactionId: pairId,
                dataStoreId: 'd1',
                readLabel: 'stored order',
                writeLabel: 'new order',
                readEdgeId: 'f-read',
                writeEdgeId: 'f-write',
            },
        ]);
        expect(model.totalFlowCount).toBe(4);
    });

    it('regroups the two edges of one store interaction by their pairId', () => {
        const diagram = buildDiagram(
            [process('p1', '1.0'), dataStore('d1', 'D1')],
            [
                flow('a-in', 'd1', 'p1', 'read', 1, 'pair-1'),
                flow('a-out', 'p1', 'd1', 'write', 1, 'pair-1'),
                flow('b-in', 'd1', 'p1', 'other read', 1, 'pair-2'),
            ]
        );

        const [model] = deriveProcessAuthoringModels(diagram, 1);

        expect(model.dataStoreInteractions).toHaveLength(2);
        expect(model.dataStoreInteractions[1]).toEqual({
            interactionId: 'pair-2',
            dataStoreId: 'd1',
            readLabel: 'other read',
            readEdgeId: 'b-in',
            writeLabel: '',
        });
    });

    it('keeps a store flow with no pairId as an interaction of its own', () => {
        const diagram = buildDiagram(
            [process('p1', '1.0'), dataStore('d1', 'D1')],
            [flow('legacy', 'p1', 'd1', 'write only')]
        );

        const [model] = deriveProcessAuthoringModels(diagram, 1);

        expect(model.dataStoreInteractions).toEqual([
            {
                interactionId: 'legacy',
                dataStoreId: 'd1',
                readLabel: '',
                writeLabel: 'write only',
                writeEdgeId: 'legacy',
            },
        ]);
    });

    it('records the direction of a flow arriving from another process', () => {
        const diagram = buildDiagram(
            [process('p1', '1.0'), process('p2', '2.0')],
            [flow('f', 'p2', 'p1', 'upstream')]
        );

        const [firstProcess, secondProcess] = deriveProcessAuthoringModels(diagram, 1);

        expect(firstProcess.processFlows[0]).toMatchObject({ otherProcessId: 'p2', direction: 'from' });
        expect(secondProcess.processFlows[0]).toMatchObject({ otherProcessId: 'p1', direction: 'to' });
    });

    it('ignores flows and nodes belonging to another level', () => {
        const diagram = buildDiagram(
            [process('p1', '1.0', 1), entity('e1', 1), process('p2', '2.1', 2), entity('e2', 2)],
            [flow('f1', 'e1', 'p1', 'level one', 1), flow('f2', 'e2', 'p2', 'level two', 2)]
        );

        const levelOne = deriveProcessAuthoringModels(diagram, 1);

        expect(levelOne).toHaveLength(1);
        expect(levelOne[0].participantInputs.map(f => f.edgeId)).toEqual(['f1']);
    });

    it('skips a self-referencing flow, which has no counterpart to list it under', () => {
        const diagram = buildDiagram([process('p1', '1.0')], [flow('loop', 'p1', 'p1', 'retry')]);

        const [model] = deriveProcessAuthoringModels(diagram, 1);

        expect(model.totalFlowCount).toBe(0);
    });

    it('survives an edge pointing at a node that no longer exists', () => {
        const diagram = buildDiagram([process('p1', '1.0')], [flow('dangling', 'ghost', 'p1', 'x')]);

        const [model] = deriveProcessAuthoringModels(diagram, 1);

        expect(model.totalFlowCount).toBe(0);
    });

    it('returns a model per process even when nothing is connected yet', () => {
        const diagram = buildDiagram([process('p1', '1.0'), process('p2', '2.0')]);
        const models = deriveProcessAuthoringModels(diagram, 1);

        expect(models.map(m => m.process.id)).toEqual(['p1', 'p2']);
        expect(models.every(m => m.totalFlowCount === 0)).toBe(true);
    });
});

describe('identifier allocation', () => {
    it('takes the next store code from the highest in use, not the count', () => {
        // D2 deleted from D1/D2/D3 must not hand out a second D3.
        const stores = [dataStore('a', 'D1'), dataStore('c', 'D3')].filter(
            (node): node is Extract<DFDNode, { type: 'datastore' }> => node.type === 'datastore'
        );

        expect(nextDataStoreCode(stores)).toBe('D4');
    });

    it('starts store codes at D1', () => {
        expect(nextDataStoreCode([])).toBe('D1');
    });

    it('ignores store codes that are not in D<n> form', () => {
        const stores = [dataStore('a', 'Orders'), dataStore('b', 'D2')].filter(
            (node): node is Extract<DFDNode, { type: 'datastore' }> => node.type === 'datastore'
        );

        expect(nextDataStoreCode(stores)).toBe('D3');
    });

    it('takes the next process number from the highest in use', () => {
        const processes = [process('a', '1.0'), process('c', '4.0')].filter(
            (node): node is Extract<DFDNode, { type: 'process' }> => node.type === 'process'
        );

        expect(nextProcessNumber(processes)).toBe('5.0');
    });

    it('starts process numbering at 1.0', () => {
        expect(nextProcessNumber([])).toBe('1.0');
    });

    it('generates distinct identifiers', () => {
        expect(createFlowEdgeId()).not.toBe(createFlowEdgeId());
        expect(createInteractionPairId()).not.toBe(createInteractionPairId());
    });
});
