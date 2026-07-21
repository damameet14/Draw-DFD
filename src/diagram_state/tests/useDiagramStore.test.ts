import { describe, it, expect, beforeEach } from 'vitest';
import {
    type DFDEdge,
    type DFDLevel,
    type DFDNode,
    type ProcessNode,
} from '../../data_flow_diagram_model/public_interface';
import { useDiagramStore } from '../useDiagramStore';

function buildProcess(id: string, level: DFDLevel, x: number, y: number): DFDNode {
    return {
        id,
        type: 'process',
        label: `Process ${id}`,
        level,
        position: { x, y },
        processNumber: '1.0',
    };
}

function buildDataStore(id: string, level: DFDLevel, x: number, y: number): DFDNode {
    return {
        id,
        type: 'datastore',
        label: `Store ${id}`,
        level,
        position: { x, y },
        storeCode: 'D1',
    };
}

function buildEntity(id: string, level: DFDLevel, x: number, y: number): DFDNode {
    return { id, type: 'entity', label: `Entity ${id}`, level, position: { x, y } };
}

function buildFlow(id: string, sourceNodeId: string, targetNodeId: string, level: DFDLevel): DFDEdge {
    return { id, type: 'dataflow', label: 'data', sourceNodeId, targetNodeId, level };
}

function storeActions() {
    return useDiagramStore.getState();
}

function currentNodes() {
    return useDiagramStore.getState().diagram.nodes;
}

function nodeById(id: string) {
    return currentNodes().find(node => node.id === id)!;
}

beforeEach(() => {
    useDiagramStore.getState().resetDiagram();
});

describe('resetDiagram', () => {
    it('returns the diagram to an empty state', () => {
        storeActions().addNode(buildEntity('e1', 0, 0, 0));
        storeActions().resetDiagram();
        expect(useDiagramStore.getState().diagram.nodes).toHaveLength(0);
    });

    it('produces a fresh object each time, so a mutated reset does not leak', () => {
        storeActions().resetDiagram();
        const firstReset = useDiagramStore.getState().diagram;
        firstReset.nodes.push(buildEntity('leaked', 0, 0, 0));

        storeActions().resetDiagram();
        expect(useDiagramStore.getState().diagram.nodes).toHaveLength(0);
    });
});

describe('removeNode', () => {
    it('also removes flows that referenced the node, leaving none dangling', () => {
        storeActions().addNode(buildEntity('e1', 0, 0, 0));
        storeActions().addNode(buildProcess('p1', 0, 100, 0));
        storeActions().addEdge(buildFlow('f1', 'e1', 'p1', 0));
        storeActions().addEdge(buildFlow('f2', 'p1', 'e1', 0));

        storeActions().removeNode('e1');

        expect(useDiagramStore.getState().diagram.edges).toHaveLength(0);
        expect(currentNodes().map(n => n.id)).toEqual(['p1']);
    });

    it('keeps flows between surviving nodes', () => {
        storeActions().addNode(buildEntity('e1', 0, 0, 0));
        storeActions().addNode(buildProcess('p1', 0, 100, 0));
        storeActions().addNode(buildEntity('e2', 0, 200, 0));
        storeActions().addEdge(buildFlow('f1', 'e1', 'p1', 0));

        storeActions().removeNode('e2');

        expect(useDiagramStore.getState().diagram.edges.map(e => e.id)).toEqual(['f1']);
    });
});

describe('moveNodeApplyingColumnAlignment', () => {
    it('moves only the dragged node on Level 0', () => {
        storeActions().addNode(buildProcess('p1', 0, 100, 100));
        storeActions().addNode(buildProcess('p2', 0, 100, 300));

        storeActions().moveNodeApplyingColumnAlignment('p1', { x: 160, y: 140 }, 0);

        expect(nodeById('p1').position).toEqual({ x: 160, y: 140 });
        expect(nodeById('p2').position).toEqual({ x: 100, y: 300 });
    });

    it('moves every process on the level horizontally on Level 1, but only the dragged node vertically', () => {
        storeActions().addNode(buildProcess('p1', 1, 100, 100));
        storeActions().addNode(buildProcess('p2', 1, 100, 300));

        storeActions().moveNodeApplyingColumnAlignment('p1', { x: 160, y: 140 }, 1);

        expect(nodeById('p1').position).toEqual({ x: 160, y: 140 });
        expect(nodeById('p2').position).toEqual({ x: 160, y: 300 });
    });

    it('does not disturb nodes of a different type in the same column band', () => {
        storeActions().addNode(buildProcess('p1', 1, 100, 100));
        storeActions().addNode(buildDataStore('d1', 1, 400, 100));

        storeActions().moveNodeApplyingColumnAlignment('p1', { x: 160, y: 100 }, 1);

        expect(nodeById('d1').position).toEqual({ x: 400, y: 100 });
    });

    it('does not disturb same-type nodes belonging to a different level', () => {
        storeActions().addNode(buildProcess('p1', 1, 100, 100));
        storeActions().addNode(buildProcess('p2', 2, 100, 100));

        storeActions().moveNodeApplyingColumnAlignment('p1', { x: 160, y: 100 }, 1);

        expect(nodeById('p2').position).toEqual({ x: 100, y: 100 });
    });

    it('moves entities freely on Level 1, since only processes and stores are column-locked', () => {
        storeActions().addNode(buildEntity('e1', 1, 100, 100));
        storeActions().addNode(buildEntity('e2', 1, 100, 300));

        storeActions().moveNodeApplyingColumnAlignment('e1', { x: 160, y: 140 }, 1);

        expect(nodeById('e1').position).toEqual({ x: 160, y: 140 });
        expect(nodeById('e2').position).toEqual({ x: 100, y: 300 });
    });

    it('column-locks data stores on Level 2 as well', () => {
        storeActions().addNode(buildDataStore('d1', 2, 400, 100));
        storeActions().addNode(buildDataStore('d2', 2, 400, 300));

        storeActions().moveNodeApplyingColumnAlignment('d1', { x: 460, y: 100 }, 2);

        expect(nodeById('d2').position).toEqual({ x: 460, y: 300 });
    });

    it('ignores a drag for an unknown node id', () => {
        storeActions().addNode(buildProcess('p1', 1, 100, 100));

        storeActions().moveNodeApplyingColumnAlignment('missing', { x: 999, y: 999 }, 1);

        expect(nodeById('p1').position).toEqual({ x: 100, y: 100 });
    });

    it('falls back to the diagram level when no override is given', () => {
        storeActions().setLevel(1);
        storeActions().addNode(buildProcess('p1', 1, 100, 100));
        storeActions().addNode(buildProcess('p2', 1, 100, 300));

        storeActions().moveNodeApplyingColumnAlignment('p1', { x: 160, y: 140 });

        expect(nodeById('p2').position.x).toBe(160);
    });
});

describe('syncProcessNodeDiameter', () => {
    it('applies the diameter to every process on the level', () => {
        storeActions().addNode(buildProcess('p1', 1, 0, 0));
        storeActions().addNode(buildProcess('p2', 1, 0, 200));

        storeActions().syncProcessNodeDiameter(1, 240);

        expect((nodeById('p1') as ProcessNode).diameter).toBe(240);
        expect((nodeById('p2') as ProcessNode).diameter).toBe(240);
    });

    it('leaves processes on other levels and non-process nodes untouched', () => {
        storeActions().addNode(buildProcess('p1', 1, 0, 0));
        storeActions().addNode(buildProcess('p2', 2, 0, 0));
        storeActions().addNode(buildDataStore('d1', 1, 0, 0));

        storeActions().syncProcessNodeDiameter(1, 240);

        expect((nodeById('p2') as ProcessNode).diameter).toBeUndefined();
        expect(nodeById('d1')).not.toHaveProperty('diameter');
    });
});

describe('mutation immutability', () => {
    it('replaces the node array rather than mutating it', () => {
        storeActions().addNode(buildProcess('p1', 1, 0, 0));
        const nodesBefore = useDiagramStore.getState().diagram.nodes;

        storeActions().updateNode('p1', { position: { x: 50, y: 50 } });

        expect(useDiagramStore.getState().diagram.nodes).not.toBe(nodesBefore);
        expect(nodesBefore[0].position).toEqual({ x: 0, y: 0 });
    });
});
