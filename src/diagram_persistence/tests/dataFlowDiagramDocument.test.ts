import { describe, it, expect } from 'vitest';
import { type DFDDiagram } from '../../data_flow_diagram_model/public_interface';
import {
    DIAGRAM_DOCUMENT_FORMAT,
    DIAGRAM_DOCUMENT_VERSION,
    parseDiagramDocument,
    serializeDiagramDocument,
    toDiagramFileName,
} from '../dataFlowDiagramDocument';

function buildDiagram(overrides: Partial<DFDDiagram> = {}): DFDDiagram {
    return {
        id: 'root-diagram',
        name: 'Restaurant ERP',
        systemName: 'Restaurant ERP',
        level: 0,
        nodes: [
            { id: 'p-0.0', type: 'process', label: 'System', level: 0, position: { x: 0, y: 0 }, processNumber: '0.0' },
            { id: 'e-1', type: 'entity', label: 'Customer', level: 0, position: { x: 10, y: 20 } },
            { id: 'd-1', type: 'datastore', label: 'Orders', level: 1, position: { x: 5, y: 5 }, storeCode: 'D1' },
        ],
        edges: [
            { id: 'f-1', type: 'dataflow', label: 'order', sourceNodeId: 'e-1', targetNodeId: 'p-0.0', level: 0 },
        ],
        ...overrides,
    };
}

/** Wraps a diagram the way a saved file does, so parse rejections can be isolated. */
function buildDocumentText(diagram: unknown, overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        format: DIAGRAM_DOCUMENT_FORMAT,
        version: DIAGRAM_DOCUMENT_VERSION,
        savedAt: '2026-07-26T00:00:00.000Z',
        diagram,
        ...overrides,
    });
}

describe('serializeDiagramDocument', () => {
    it('round-trips a diagram unchanged', () => {
        const diagram = buildDiagram();
        const result = parseDiagramDocument(serializeDiagramDocument(diagram));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.diagram.nodes).toEqual(diagram.nodes);
        expect(result.diagram.edges).toEqual(diagram.edges);
        expect(result.diagram.name).toBe(diagram.name);
        expect(result.diagram.level).toBe(diagram.level);
    });

    it('records the format, version, and save time', () => {
        const document = JSON.parse(serializeDiagramDocument(buildDiagram()));

        expect(document.format).toBe(DIAGRAM_DOCUMENT_FORMAT);
        expect(document.version).toBe(DIAGRAM_DOCUMENT_VERSION);
        expect(Number.isNaN(Date.parse(document.savedAt))).toBe(false);
    });

    it('keeps every level in the one document', () => {
        const result = parseDiagramDocument(serializeDiagramDocument(buildDiagram()));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.diagram.nodes.map(node => node.level)).toEqual([0, 0, 1]);
    });
});

describe('parseDiagramDocument — rejections', () => {
    it('rejects text that is not JSON', () => {
        const result = parseDiagramDocument('not json at all');
        expect(result).toEqual({ ok: false, error: 'That file is not valid JSON.' });
    });

    it('rejects JSON that is not a Draw-DFD document', () => {
        const result = parseDiagramDocument(JSON.stringify({ some: 'other tool' }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/not saved by Draw-DFD/);
    });

    it('rejects a document written by a newer version', () => {
        const result = parseDiagramDocument(
            buildDocumentText(buildDiagram(), { version: DIAGRAM_DOCUMENT_VERSION + 1 })
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/newer version/);
    });

    it('rejects a node with an unknown type', () => {
        const diagram = buildDiagram({
            nodes: [{ id: 'x', type: 'sparkle', label: 'X', level: 0, position: { x: 0, y: 0 } } as never],
        });
        const result = parseDiagramDocument(buildDocumentText(diagram));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/unknown type "sparkle"/);
    });

    it('rejects a node with an out-of-range level', () => {
        const diagram = buildDiagram({
            nodes: [{ id: 'x', type: 'entity', label: 'X', level: 7, position: { x: 0, y: 0 } } as never],
        });
        const result = parseDiagramDocument(buildDocumentText(diagram));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/invalid level/);
    });

    it('rejects a node with a non-numeric position', () => {
        const diagram = buildDiagram({
            nodes: [{ id: 'x', type: 'entity', label: 'X', level: 0, position: { x: 'left', y: 0 } } as never],
        });
        const result = parseDiagramDocument(buildDocumentText(diagram));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/invalid position/);
    });

    it('rejects duplicate node ids, which the store addresses by id', () => {
        const diagram = buildDiagram({
            nodes: [
                { id: 'same', type: 'entity', label: 'A', level: 0, position: { x: 0, y: 0 } },
                { id: 'same', type: 'entity', label: 'B', level: 0, position: { x: 1, y: 1 } },
            ],
            edges: [],
        });
        const result = parseDiagramDocument(buildDocumentText(diagram));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/duplicate node ids/);
    });

    it('rejects duplicate flow ids', () => {
        const diagram = buildDiagram({
            edges: [
                { id: 'same', type: 'dataflow', label: 'a', sourceNodeId: 'e-1', targetNodeId: 'p-0.0', level: 0 },
                { id: 'same', type: 'dataflow', label: 'b', sourceNodeId: 'p-0.0', targetNodeId: 'e-1', level: 0 },
            ],
        });
        const result = parseDiagramDocument(buildDocumentText(diagram));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/duplicate flow ids/);
    });

    it('rejects a document with no diagram in it', () => {
        const result = parseDiagramDocument(buildDocumentText(undefined));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/no diagram/);
    });
});

describe('parseDiagramDocument — tolerances', () => {
    it('keeps a flow pointing at a missing node, leaving E-002 to report it', () => {
        const diagram = buildDiagram({
            edges: [
                { id: 'f-ghost', type: 'dataflow', label: 'x', sourceNodeId: 'e-1', targetNodeId: 'gone', level: 0 },
            ],
        });
        const result = parseDiagramDocument(buildDocumentText(diagram));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.diagram.edges).toHaveLength(1);
    });

    it('falls back to the diagram name when systemName is absent', () => {
        const diagram = { ...buildDiagram(), systemName: undefined };
        const result = parseDiagramDocument(buildDocumentText(diagram));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.diagram.systemName).toBe('Restaurant ERP');
    });

    it('accepts an empty diagram', () => {
        const diagram = buildDiagram({ nodes: [], edges: [] });
        const result = parseDiagramDocument(buildDocumentText(diagram));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.diagram.nodes).toEqual([]);
    });

    it('reports the save time when present and null when not', () => {
        const withTime = parseDiagramDocument(buildDocumentText(buildDiagram()));
        const withoutTime = parseDiagramDocument(buildDocumentText(buildDiagram(), { savedAt: 42 }));

        expect(withTime.ok && withTime.savedAt).toBe('2026-07-26T00:00:00.000Z');
        expect(withoutTime.ok && withoutTime.savedAt).toBe(null);
    });
});

describe('toDiagramFileName', () => {
    it('turns a diagram name into a safe file name', () => {
        expect(toDiagramFileName('Restaurant ERP', 'png')).toBe('restaurant-erp.png');
    });

    it('strips punctuation and collapses separators', () => {
        expect(toDiagramFileName('  Level 2 — 3.0 / Billing!  ', 'dfd.json'))
            .toBe('level-2-3-0-billing.dfd.json');
    });

    it('falls back to a default when the name has nothing usable in it', () => {
        expect(toDiagramFileName('***', 'png')).toBe('data-flow-diagram.png');
    });
});
