import {
    type DFDDiagram,
    type DFDEdge,
    type DFDLevel,
    type DFDNode,
    type DFDNodeType,
} from '../data_flow_diagram_model/public_interface';

/**
 * The on-disk and in-storage representation of a saved diagram.
 *
 * The diagram is wrapped rather than written bare so that a file carries enough
 * information to be recognised and migrated: `format` distinguishes a Draw-DFD
 * document from any other JSON a user might open, and `version` gives future
 * readers something to branch on when the contracts change.
 */
export interface DataFlowDiagramDocument {
    format: typeof DIAGRAM_DOCUMENT_FORMAT;
    version: number;
    savedAt: string;
    diagram: DFDDiagram;
}

export const DIAGRAM_DOCUMENT_FORMAT = 'draw-dfd';
export const DIAGRAM_DOCUMENT_VERSION = 1;

export type DiagramDocumentParseResult =
    | { ok: true; diagram: DFDDiagram; savedAt: string | null }
    | { ok: false; error: string };

const VALID_NODE_TYPES: readonly DFDNodeType[] = ['entity', 'process', 'datastore', 'process_ref'];
const VALID_LEVELS: readonly DFDLevel[] = [0, 1, 2];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLevel(value: unknown): value is DFDLevel {
    return VALID_LEVELS.includes(value as DFDLevel);
}

function isPosition(value: unknown): value is { x: number; y: number } {
    return (
        isRecord(value) &&
        typeof value.x === 'number' &&
        Number.isFinite(value.x) &&
        typeof value.y === 'number' &&
        Number.isFinite(value.y)
    );
}

/** Serialises the current diagram into the text written to a file or storage. */
export function serializeDiagramDocument(diagram: DFDDiagram): string {
    const document: DataFlowDiagramDocument = {
        format: DIAGRAM_DOCUMENT_FORMAT,
        version: DIAGRAM_DOCUMENT_VERSION,
        savedAt: new Date().toISOString(),
        diagram,
    };

    return JSON.stringify(document, null, 2);
}

function validateNode(value: unknown, index: number): string | null {
    if (!isRecord(value)) return `node ${index} is not an object`;
    if (typeof value.id !== 'string' || value.id === '') return `node ${index} has no id`;
    if (!VALID_NODE_TYPES.includes(value.type as DFDNodeType)) {
        return `node "${value.id}" has unknown type "${String(value.type)}"`;
    }
    if (typeof value.label !== 'string') return `node "${value.id}" has no label`;
    if (!isLevel(value.level)) return `node "${value.id}" has invalid level "${String(value.level)}"`;
    if (!isPosition(value.position)) return `node "${value.id}" has an invalid position`;
    return null;
}

function validateEdge(value: unknown, index: number): string | null {
    if (!isRecord(value)) return `flow ${index} is not an object`;
    if (typeof value.id !== 'string' || value.id === '') return `flow ${index} has no id`;
    if (typeof value.label !== 'string') return `flow "${value.id}" has no label`;
    if (!isLevel(value.level)) return `flow "${value.id}" has invalid level "${String(value.level)}"`;
    if (typeof value.sourceNodeId !== 'string' || typeof value.targetNodeId !== 'string') {
        return `flow "${value.id}" does not name both endpoints`;
    }
    return null;
}

/**
 * Reads a document back, rejecting anything that would put the editor into a
 * state the rest of the application does not expect.
 *
 * Duplicate identifiers are treated as fatal rather than tolerated: the store
 * addresses nodes and edges by id, so a file containing two nodes with the same
 * id would make selection, editing, and deletion act on an arbitrary one of them.
 *
 * A flow pointing at a node that is not in the file is left in place instead of
 * rejected — the rule set already reports that as E-002, which tells a user far
 * more than a refusal to open the file would.
 */
export function parseDiagramDocument(documentText: string): DiagramDocumentParseResult {
    let parsed: unknown;

    try {
        parsed = JSON.parse(documentText);
    } catch {
        return { ok: false, error: 'That file is not valid JSON.' };
    }

    if (!isRecord(parsed)) return { ok: false, error: 'That file does not contain a diagram.' };

    if (parsed.format !== DIAGRAM_DOCUMENT_FORMAT) {
        return { ok: false, error: 'That file was not saved by Draw-DFD.' };
    }

    if (typeof parsed.version !== 'number' || parsed.version > DIAGRAM_DOCUMENT_VERSION) {
        return {
            ok: false,
            error: `That file was saved by a newer version of Draw-DFD (format ${String(parsed.version)}).`,
        };
    }

    const diagram = parsed.diagram;
    if (!isRecord(diagram)) return { ok: false, error: 'That file has no diagram in it.' };

    if (typeof diagram.id !== 'string' || typeof diagram.name !== 'string') {
        return { ok: false, error: 'The diagram in that file is missing its name.' };
    }
    if (!isLevel(diagram.level)) {
        return { ok: false, error: 'The diagram in that file has an invalid level.' };
    }
    if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
        return { ok: false, error: 'The diagram in that file has no nodes or flows.' };
    }

    for (const [index, node] of diagram.nodes.entries()) {
        const problem = validateNode(node, index);
        if (problem) return { ok: false, error: `Could not read the diagram: ${problem}.` };
    }

    for (const [index, edge] of diagram.edges.entries()) {
        const problem = validateEdge(edge, index);
        if (problem) return { ok: false, error: `Could not read the diagram: ${problem}.` };
    }

    const nodes = diagram.nodes as DFDNode[];
    const edges = diagram.edges as DFDEdge[];

    const nodeIds = new Set(nodes.map((node) => node.id));
    if (nodeIds.size !== nodes.length) {
        return { ok: false, error: 'Could not read the diagram: it contains duplicate node ids.' };
    }

    const edgeIds = new Set(edges.map((edge) => edge.id));
    if (edgeIds.size !== edges.length) {
        return { ok: false, error: 'Could not read the diagram: it contains duplicate flow ids.' };
    }

    return {
        ok: true,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
        diagram: {
            id: diagram.id,
            name: diagram.name,
            systemName: typeof diagram.systemName === 'string' ? diagram.systemName : diagram.name,
            level: diagram.level,
            parentDiagramId:
                typeof diagram.parentDiagramId === 'string' ? diagram.parentDiagramId : null,
            nodes,
            edges,
        },
    };
}

/** Turns a diagram name into something safe to use as a file name. */
export function toDiagramFileName(diagramName: string, extension: string): string {
    const cleaned = diagramName
        .trim()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();

    return `${cleaned || 'data-flow-diagram'}.${extension}`;
}
