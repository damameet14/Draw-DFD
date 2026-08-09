import {
    type DFDEdge,
    type DFDNode,
    type EntityNode,
    type ProcessNode,
} from '../data_flow_diagram_model/public_interface';
import { planContextDiagramLayout } from '../diagram_canvas/public_interface';
import { isBlankRow, normalizeColumnName, parseDelimitedText } from './parseDelimitedText';

/**
 * Builds a context diagram from a spreadsheet export.
 *
 * One row is one flow pair. The context level's rules are enforced by the shape
 * of the format as much as by the checks below: there is no way to express a
 * data store (D-002), no way to connect two entities (E-003), and no way to
 * name a second process (D-001). The one rule the format *can* violate is the
 * FlowPair rule, so a row missing either direction is rejected rather than
 * imported as a one-way flow.
 *
 * Every problem in the file is reported at once, with line numbers. A user
 * fixing a spreadsheet wants the whole list, not the first mistake.
 */

/** Column headings recognised for each field, after normalisation. */
const ENTITY_COLUMN_ALIASES = ['entity', 'external_entity', 'entity_name', 'name'];
const IN_FLOW_COLUMN_ALIASES = ['in_flow', 'inflow', 'in', 'input', 'in_flow_name'];
const OUT_FLOW_COLUMN_ALIASES = ['out_flow', 'outflow', 'out', 'output', 'out_flow_name'];
const SYSTEM_COLUMN_ALIASES = ['system', 'system_name'];

/** Beyond this many problems the list stops being useful to read. */
const MAX_REPORTED_PROBLEMS = 12;

export interface ContextCsvImportSummary {
    systemName: string | null;
    entityCount: number;
    flowPairCount: number;
}

export type ContextCsvImportResult =
    | ({ ok: true; nodes: DFDNode[]; edges: DFDEdge[] } & ContextCsvImportSummary)
    | { ok: false; problems: string[] };

export interface ContextCsvImportOptions {
    /**
     * The context process already on the canvas. Reusing it keeps flows in
     * Levels 1 and 2 that reference it intact; without one, a fresh `p-0.0` is
     * created.
     */
    existingContextProcess?: ProcessNode;
}

interface FlowPairRow {
    entityName: string;
    inFlowLabel: string;
    outFlowLabel: string;
}

function findColumnIndex(headerKeys: string[], aliases: string[]): number {
    return headerKeys.findIndex((key) => aliases.includes(key));
}

function readCell(row: string[], columnIndex: number): string {
    return columnIndex >= 0 ? (row[columnIndex] ?? '').trim() : '';
}

export function importContextDiagramFromCsv(
    csvText: string,
    options: ContextCsvImportOptions = {}
): ContextCsvImportResult {
    const allRows = parseDelimitedText(csvText);

    // Keep the original line numbers so problems point back at the file.
    const numberedRows = allRows
        .map((cells, rowIndex) => ({ cells, lineNumber: rowIndex + 1 }))
        .filter((row) => !isBlankRow(row.cells));

    if (numberedRows.length === 0) {
        return { ok: false, problems: ['The file is empty.'] };
    }

    const [headerRow, ...dataRows] = numberedRows;
    const headerKeys = headerRow.cells.map(normalizeColumnName);

    const entityColumn = findColumnIndex(headerKeys, ENTITY_COLUMN_ALIASES);
    const inFlowColumn = findColumnIndex(headerKeys, IN_FLOW_COLUMN_ALIASES);
    const outFlowColumn = findColumnIndex(headerKeys, OUT_FLOW_COLUMN_ALIASES);
    const systemColumn = findColumnIndex(headerKeys, SYSTEM_COLUMN_ALIASES);

    const missingColumns: string[] = [];
    if (entityColumn < 0) missingColumns.push('entity');
    if (inFlowColumn < 0) missingColumns.push('in_flow');
    if (outFlowColumn < 0) missingColumns.push('out_flow');

    if (missingColumns.length > 0) {
        return {
            ok: false,
            problems: [
                `The header row must name the columns ${missingColumns.join(', ')}. ` +
                `Found: ${headerRow.cells.map((cell) => cell.trim()).filter(Boolean).join(', ') || '(nothing)'}.`,
            ],
        };
    }

    if (dataRows.length === 0) {
        return { ok: false, problems: ['The file has a header row but no data rows.'] };
    }

    const problems: string[] = [];
    const flowPairRows: FlowPairRow[] = [];
    let systemName: string | null = null;

    dataRows.forEach(({ cells, lineNumber }) => {
        const entityName = readCell(cells, entityColumn);
        const inFlowLabel = readCell(cells, inFlowColumn);
        const outFlowLabel = readCell(cells, outFlowColumn);

        const systemCell = readCell(cells, systemColumn);
        if (systemCell && !systemName) systemName = systemCell;

        if (!entityName) {
            problems.push(`Line ${lineNumber}: the entity name is empty.`);
            return;
        }

        // The FlowPair rule: a context diagram records what an entity sends and
        // what it gets back, so neither direction may be left out.
        const missingDirections: string[] = [];
        if (!inFlowLabel) missingDirections.push('in_flow');
        if (!outFlowLabel) missingDirections.push('out_flow');

        if (missingDirections.length > 0) {
            problems.push(
                `Line ${lineNumber} ("${entityName}"): ${missingDirections.join(' and ')} ` +
                `${missingDirections.length === 1 ? 'is' : 'are'} empty. ` +
                'Every flow needs both a name for what the entity sends and a name for what it receives.'
            );
            return;
        }

        flowPairRows.push({ entityName, inFlowLabel, outFlowLabel });
    });

    if (problems.length > 0) {
        const reported = problems.slice(0, MAX_REPORTED_PROBLEMS);
        if (problems.length > reported.length) {
            reported.push(`…and ${problems.length - reported.length} more.`);
        }
        return { ok: false, problems: reported };
    }

    return buildContextDiagram(flowPairRows, systemName, options);
}

function buildContextDiagram(
    flowPairRows: FlowPairRow[],
    systemName: string | null,
    options: ContextCsvImportOptions
): ContextCsvImportResult {
    // Entities keep the order they first appear in the file, which is the order
    // the author chose and so the order they are laid out in.
    const entityNamesInOrder: string[] = [];
    for (const row of flowPairRows) {
        if (!entityNamesInOrder.includes(row.entityName)) {
            entityNamesInOrder.push(row.entityName);
        }
    }

    // Every row is one flow pair, so an entity's row count is both its in-flow
    // and its out-flow count. Sizing the layout from these up front means the
    // imported diagram is already correctly proportioned on first render, rather
    // than growing into shape as the canvas auto-sizing effects settle.
    const flowPairCountByEntity = new Map<string, number>();
    flowPairRows.forEach((row) => {
        flowPairCountByEntity.set(row.entityName, (flowPairCountByEntity.get(row.entityName) ?? 0) + 1);
    });

    const placement = planContextDiagramLayout(
        entityNamesInOrder.map((entityName) => {
            const pairCount = flowPairCountByEntity.get(entityName) ?? 0;
            return { inFlowCount: pairCount, outFlowCount: pairCount };
        })
    );

    // An import lays out the whole level, so the process is re-centred on the ring
    // as well as resized. Its id is kept when one already exists, so flows on the
    // other levels that reference it are not broken.
    const contextProcess: ProcessNode = options.existingContextProcess
        ? {
            ...options.existingContextProcess,
            label: systemName ?? options.existingContextProcess.label,
            position: placement.processPosition,
            diameter: placement.processDiameter,
        }
        : {
            id: 'p-0.0',
            type: 'process',
            label: systemName ?? 'System',
            processNumber: '0.0',
            level: 0,
            position: placement.processPosition,
            diameter: placement.processDiameter,
        };

    const entityIdByName = new Map<string, string>();
    const entityNodes: EntityNode[] = entityNamesInOrder.map((entityName, entityIndex) => {
        const id = `e-${crypto.randomUUID().slice(0, 8)}`;
        entityIdByName.set(entityName, id);

        const { position, size } = placement.entities[entityIndex];

        return {
            id,
            type: 'entity',
            label: entityName,
            level: 0,
            position,
            width: size,
            height: size,
        };
    });

    const edges: DFDEdge[] = [];

    flowPairRows.forEach((row) => {
        const entityId = entityIdByName.get(row.entityName)!;
        const pairId = `pair-${crypto.randomUUID().slice(0, 8)}`;

        // Handles are keyed by edge id at both ends; see the canvas invariant.
        const inEdgeId = `df-${crypto.randomUUID().slice(0, 8)}`;
        const outEdgeId = `df-${crypto.randomUUID().slice(0, 8)}`;

        edges.push({
            id: inEdgeId,
            type: 'dataflow',
            label: row.inFlowLabel,
            sourceNodeId: entityId,
            targetNodeId: contextProcess.id,
            sourceHandle: inEdgeId,
            targetHandle: inEdgeId,
            level: 0,
            pairId,
        });

        edges.push({
            id: outEdgeId,
            type: 'dataflow',
            label: row.outFlowLabel,
            sourceNodeId: contextProcess.id,
            targetNodeId: entityId,
            sourceHandle: outEdgeId,
            targetHandle: outEdgeId,
            level: 0,
            pairId,
        });
    });

    return {
        ok: true,
        nodes: [contextProcess, ...entityNodes],
        edges,
        systemName,
        entityCount: entityNodes.length,
        flowPairCount: flowPairRows.length,
    };
}
