import {
    type DataStoreNode,
    type DFDEdge,
    type DFDLevel,
    type DFDNode,
    type EntityNode,
    type ProcessNode,
} from '../data_flow_diagram_model/public_interface';
import { isBlankRow, normalizeColumnName, parseDelimitedText } from './parseDelimitedText';

/**
 * Builds a decomposed level from a spreadsheet export.
 *
 * One row is one process's dealings with one other thing: an external entity, a
 * data store, or another process. `in_flow` and `out_flow` are always read from
 * the process's point of view — what it receives, and what it sends — which is
 * the one convention a reader has to hold in their head, and it means a data
 * store's read and its write are the same two columns as an entity's request and
 * its answer.
 *
 * The shape of the format enforces most of the level's rules on its own: every
 * row has a process at one end, so there is no way to write an entity straight to
 * a data store (E-004) or to wire two entities together (E-003). A row must name
 * at least one direction, since a row naming neither says nothing at all.
 *
 * Nothing here places anything. A decomposed level is arranged by
 * `planDecomposedLevelLayout` from the flows themselves, so an imported diagram
 * is laid out by the same code that lays out a hand-built one, and the importer
 * has no geometry to get wrong.
 *
 * Every problem in the file is reported at once, with line numbers. A user
 * fixing a spreadsheet wants the whole list, not the first mistake.
 */

const PROCESS_COLUMN_ALIASES = ['process', 'process_name', 'parent_process'];
const TYPE_COLUMN_ALIASES = ['type', 'kind', 'connects_to_type', 'counterparty_type'];
const NAME_COLUMN_ALIASES = ['name', 'connects_to', 'counterparty', 'connected_to'];
const IN_FLOW_COLUMN_ALIASES = ['in_flow', 'inflow', 'in', 'input', 'in_flow_name'];
const OUT_FLOW_COLUMN_ALIASES = ['out_flow', 'outflow', 'out', 'output', 'out_flow_name'];

/** Beyond this many problems the list stops being useful to read. */
const MAX_REPORTED_PROBLEMS = 12;

type CounterpartyType = 'entity' | 'datastore' | 'process';

/** What a reader may write in the `type` column for each kind of counterparty. */
const COUNTERPARTY_TYPE_BY_KEYWORD: Record<string, CounterpartyType> = {
    entity: 'entity',
    external_entity: 'entity',
    externalentity: 'entity',
    actor: 'entity',
    datastore: 'datastore',
    data_store: 'datastore',
    store: 'datastore',
    table: 'datastore',
    process: 'process',
    sub_process: 'process',
    subprocess: 'process',
};

export interface DecompositionCsvImportSummary {
    processCount: number;
    participantCount: number;
    dataStoreCount: number;
    flowCount: number;
}

export type DecompositionCsvImportResult =
    | ({ ok: true; nodes: DFDNode[]; edges: DFDEdge[] } & DecompositionCsvImportSummary)
    | { ok: false; problems: string[] };

interface FlowRow {
    processName: string;
    counterpartyType: CounterpartyType;
    counterpartyName: string;
    inFlowLabel: string;
    outFlowLabel: string;
    lineNumber: number;
}

function findColumnIndex(headerKeys: string[], aliases: string[]): number {
    return headerKeys.findIndex((key) => aliases.includes(key));
}

function readCell(row: string[], columnIndex: number): string {
    return columnIndex >= 0 ? (row[columnIndex] ?? '').trim() : '';
}

export function importDecompositionFromCsv(
    csvText: string,
    level: DFDLevel
): DecompositionCsvImportResult {
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

    const processColumn = findColumnIndex(headerKeys, PROCESS_COLUMN_ALIASES);
    const typeColumn = findColumnIndex(headerKeys, TYPE_COLUMN_ALIASES);
    const nameColumn = findColumnIndex(headerKeys, NAME_COLUMN_ALIASES);
    const inFlowColumn = findColumnIndex(headerKeys, IN_FLOW_COLUMN_ALIASES);
    const outFlowColumn = findColumnIndex(headerKeys, OUT_FLOW_COLUMN_ALIASES);

    const missingColumns: string[] = [];
    if (processColumn < 0) missingColumns.push('process');
    if (typeColumn < 0) missingColumns.push('type');
    if (nameColumn < 0) missingColumns.push('name');
    if (inFlowColumn < 0 && outFlowColumn < 0) missingColumns.push('in_flow and/or out_flow');

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
    const flowRows: FlowRow[] = [];

    dataRows.forEach(({ cells, lineNumber }) => {
        const processName = readCell(cells, processColumn);
        const typeText = readCell(cells, typeColumn);
        const counterpartyName = readCell(cells, nameColumn);
        const inFlowLabel = readCell(cells, inFlowColumn);
        const outFlowLabel = readCell(cells, outFlowColumn);

        if (!processName) {
            problems.push(`Line ${lineNumber}: the process name is empty.`);
            return;
        }

        const counterpartyType = COUNTERPARTY_TYPE_BY_KEYWORD[normalizeColumnName(typeText)];
        if (!counterpartyType) {
            problems.push(
                `Line ${lineNumber} ("${processName}"): type is "${typeText || '(empty)'}". ` +
                'Use entity, datastore, or process.'
            );
            return;
        }

        if (!counterpartyName) {
            problems.push(`Line ${lineNumber} ("${processName}"): the name column is empty.`);
            return;
        }

        if (!inFlowLabel && !outFlowLabel) {
            problems.push(
                `Line ${lineNumber} ("${processName}" ↔ "${counterpartyName}"): ` +
                'both in_flow and out_flow are empty, so the row describes no flow at all.'
            );
            return;
        }

        // A process cannot flow to itself, and the layout has nowhere to put it.
        if (counterpartyType === 'process' && counterpartyName === processName) {
            problems.push(
                `Line ${lineNumber}: "${processName}" flows to itself. ` +
                'A flow has to connect two different things.'
            );
            return;
        }

        flowRows.push({
            processName,
            counterpartyType,
            counterpartyName,
            inFlowLabel,
            outFlowLabel,
            lineNumber,
        });
    });

    if (problems.length > 0) {
        const reported = problems.slice(0, MAX_REPORTED_PROBLEMS);
        if (problems.length > reported.length) {
            reported.push(`…and ${problems.length - reported.length} more.`);
        }
        return { ok: false, problems: reported };
    }

    return buildDecomposedLevel(flowRows, level);
}

/**
 * A name may be used by more than one kind of thing without ambiguity, since the
 * `type` column says which is meant, so names are keyed by kind as well.
 */
function counterpartyKey(type: CounterpartyType, name: string): string {
    return `${type}:${name}`;
}

function buildDecomposedLevel(
    flowRows: FlowRow[],
    level: DFDLevel
): DecompositionCsvImportResult {
    // Everything keeps the order it first appears in the file. That is the order
    // the author chose, and it decides the process numbering, the store codes,
    // and the order the columns are stacked in.
    const processNamesInOrder: string[] = [];
    const participantNamesInOrder: string[] = [];
    const dataStoreNamesInOrder: string[] = [];

    const noteProcess = (name: string) => {
        if (!processNamesInOrder.includes(name)) processNamesInOrder.push(name);
    };

    flowRows.forEach((row) => {
        noteProcess(row.processName);

        if (row.counterpartyType === 'process') {
            noteProcess(row.counterpartyName);
        } else if (row.counterpartyType === 'entity') {
            if (!participantNamesInOrder.includes(row.counterpartyName)) {
                participantNamesInOrder.push(row.counterpartyName);
            }
        } else if (!dataStoreNamesInOrder.includes(row.counterpartyName)) {
            dataStoreNamesInOrder.push(row.counterpartyName);
        }
    });

    const idsByKey = new Map<string, string>();

    // Positions are all the same point on purpose: a decomposed level is
    // arranged by the canvas layout, which reads the flows and ignores whatever
    // is stored here.
    const origin = { x: 0, y: 0 };

    const processNodes: ProcessNode[] = processNamesInOrder.map((name, index) => {
        const id = `p${level}-${crypto.randomUUID().slice(0, 8)}`;
        idsByKey.set(counterpartyKey('process', name), id);

        return {
            id,
            type: 'process',
            label: name,
            processNumber: `${index + 1}.0`,
            level,
            position: origin,
        };
    });

    const participantNodes: EntityNode[] = participantNamesInOrder.map((name) => {
        const id = `e${level}-${crypto.randomUUID().slice(0, 8)}`;
        idsByKey.set(counterpartyKey('entity', name), id);

        return { id, type: 'entity', label: name, level, position: origin };
    });

    const dataStoreNodes: DataStoreNode[] = dataStoreNamesInOrder.map((name, index) => {
        const id = `ds${level}-${crypto.randomUUID().slice(0, 8)}`;
        idsByKey.set(counterpartyKey('datastore', name), id);

        return {
            id,
            type: 'datastore',
            label: name,
            storeCode: `D${index + 1}`,
            level,
            position: origin,
        };
    });

    const edges: DFDEdge[] = [];

    flowRows.forEach((row, rowIndex) => {
        const processId = idsByKey.get(counterpartyKey('process', row.processName))!;
        const counterpartyId = idsByKey.get(
            counterpartyKey(row.counterpartyType, row.counterpartyName)
        )!;

        // Both directions of one row share a pair id, which is what keeps them
        // side by side when the level is laid out.
        const pairId = `imp-${rowIndex}-${crypto.randomUUID().slice(0, 6)}`;
        const hasBothDirections = Boolean(row.inFlowLabel && row.outFlowLabel);

        if (row.inFlowLabel) {
            edges.push({
                id: `${pairId}-in`,
                type: 'dataflow',
                label: row.inFlowLabel,
                sourceNodeId: counterpartyId,
                targetNodeId: processId,
                level,
                ...(hasBothDirections && { pairId }),
            });
        }

        if (row.outFlowLabel) {
            edges.push({
                id: `${pairId}-out`,
                type: 'dataflow',
                label: row.outFlowLabel,
                sourceNodeId: processId,
                targetNodeId: counterpartyId,
                level,
                ...(hasBothDirections && { pairId }),
            });
        }
    });

    return {
        ok: true,
        nodes: [...participantNodes, ...processNodes, ...dataStoreNodes],
        edges,
        processCount: processNodes.length,
        participantCount: participantNodes.length,
        dataStoreCount: dataStoreNodes.length,
        flowCount: edges.length,
    };
}
