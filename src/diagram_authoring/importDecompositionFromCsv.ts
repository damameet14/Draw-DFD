import {
    type DataStoreNode,
    type DFDEdge,
    type DFDLevel,
    type DFDNode,
    type EntityNode,
    type ExternalProcessNode,
    type ProcessNode,
} from '../data_flow_diagram_model/public_interface';
import { isBlankRow, normalizeColumnName, parseDelimitedText } from './parseDelimitedText';

/**
 * Builds a decomposed level from a spreadsheet export.
 *
 * One row is one process's dealings with one entity and one data store:
 *
 *     process_name, entity_name, in_flow, out_flow,
 *     data_store, data_store_inflow, data_store_outflow
 *
 * The four flow columns read along the chain a level is drawn in — entity, then
 * process, then store — so "in" always means the flow travelling towards the
 * store and "out" the one coming back:
 *
 *     in_flow             entity  →  process
 *     out_flow            process →  entity
 *     data_store_inflow   process →  store
 *     data_store_outflow  store   →  process
 *
 * A registration row reads the whole way across: the visitor sends registration
 * details, the process writes them to the table, the table answers, and the
 * process passes the acknowledgement back.
 *
 * Either half of a row may be left out. A row with no data store describes only
 * the entity's exchange, and a row with no entity only the store's.
 *
 * `process_name` may carry its number — `1.0 Registration` — in which case the
 * number is taken off and used to order the processes down the page. Rows naming
 * the same process are gathered onto one circle.
 *
 * Repeated rows are not merged. Four entities logging in through one process
 * produce four separate exchanges with the user table, because that is what the
 * file says and what a DFD drawn this way shows.
 *
 * A name in `entity_name` written with a process number is a process rather than
 * an entity. If the file defines that process the row draws a flow between the
 * two circles; if it does not, the diagram only refers to it, and a DFD draws
 * that as a box beside the entities.
 *
 * ## Level 2
 *
 * The same columns, one file per process. A Level 2 diagram decomposes a single
 * process and inherits its numbering, so its sub-processes must be numbered
 * `6.1`, `6.2` and so on: that is what makes the parent `6.0` inferable from the
 * file alone, and it is also what stops two decompositions being imported onto
 * one page. A file whose sub-processes do not agree on a parent is refused.
 *
 * The shape of the format enforces the level's rules on its own: every flow has
 * the process at one end, so an entity cannot reach a store directly (E-004) and
 * two entities cannot be wired together (E-003).
 *
 * Nothing here places anything. A decomposed level is arranged by
 * `planDecomposedLevelLayout` from the flows themselves, so an imported diagram
 * is laid out by the same code as a hand-built one.
 *
 * Every problem in the file is reported at once, with line numbers. A user
 * fixing a spreadsheet wants the whole list, not the first mistake.
 */

const PROCESS_COLUMN_ALIASES = ['process_name', 'process', 'process_title'];
const ENTITY_COLUMN_ALIASES = ['entity_name', 'entity', 'external_entity', 'actor'];
const IN_FLOW_COLUMN_ALIASES = ['in_flow', 'inflow', 'in', 'input', 'entity_inflow'];
const OUT_FLOW_COLUMN_ALIASES = ['out_flow', 'outflow', 'out', 'output', 'entity_outflow'];
const DATA_STORE_COLUMN_ALIASES = [
    'data_store',
    'datastore',
    'store',
    'data_store_name',
    'table',
];
const DATA_STORE_IN_COLUMN_ALIASES = [
    'data_store_inflow',
    'data_store_in_flow',
    'datastore_inflow',
    'store_inflow',
    'data_store_in',
];
const DATA_STORE_OUT_COLUMN_ALIASES = [
    'data_store_outflow',
    'data_store_out_flow',
    'datastore_outflow',
    'store_outflow',
    'data_store_out',
];

/** Beyond this many problems the list stops being useful to read. */
const MAX_REPORTED_PROBLEMS = 12;

/** `1.0 Registration`, `2 Login`, `3.1 - Profile Management`. */
const NUMBERED_PROCESS_PATTERN = /^(\d+(?:\.\d+)?)[\s.:\-–—]+(.+)$/;

export interface DecompositionCsvImportSummary {
    processCount: number;
    participantCount: number;
    dataStoreCount: number;
    flowCount: number;
    /**
     * The process a Level 2 file decomposes, worked out from the sub-process
     * numbers: `6.1` and `6.2` are the children of `6.0`. Null on Level 1, which
     * decomposes the context process rather than one of its own.
     */
    parentProcessNumber: string | null;
}

export type DecompositionCsvImportResult =
    | ({ ok: true; nodes: DFDNode[]; edges: DFDEdge[] } & DecompositionCsvImportSummary)
    | { ok: false; problems: string[] };

interface InteractionRow {
    processLabel: string;
    processNumber: string | null;
    entityName: string;
    inFlowLabel: string;
    outFlowLabel: string;
    dataStoreName: string;
    dataStoreInLabel: string;
    dataStoreOutLabel: string;
    lineNumber: number;
}

function findColumnIndex(headerKeys: string[], aliases: string[]): number {
    return headerKeys.findIndex((key) => aliases.includes(key));
}

function readCell(row: string[], columnIndex: number): string {
    return columnIndex >= 0 ? (row[columnIndex] ?? '').trim() : '';
}

/** Splits `1.0 Registration` into its number and its name. */
function parseProcessName(processName: string): { label: string; number: string | null } {
    const match = NUMBERED_PROCESS_PATTERN.exec(processName);
    if (!match) return { label: processName, number: null };

    // `1` and `1.0` name the same process; both are stored the way a circle
    // shows them.
    const number = match[1].includes('.') ? match[1] : `${match[1]}.0`;
    return { label: match[2].trim(), number };
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
    const entityColumn = findColumnIndex(headerKeys, ENTITY_COLUMN_ALIASES);
    const inFlowColumn = findColumnIndex(headerKeys, IN_FLOW_COLUMN_ALIASES);
    const outFlowColumn = findColumnIndex(headerKeys, OUT_FLOW_COLUMN_ALIASES);
    const dataStoreColumn = findColumnIndex(headerKeys, DATA_STORE_COLUMN_ALIASES);
    const dataStoreInColumn = findColumnIndex(headerKeys, DATA_STORE_IN_COLUMN_ALIASES);
    const dataStoreOutColumn = findColumnIndex(headerKeys, DATA_STORE_OUT_COLUMN_ALIASES);

    const missingColumns: string[] = [];
    if (processColumn < 0) missingColumns.push('process_name');
    if (entityColumn < 0 && dataStoreColumn < 0) {
        missingColumns.push('entity_name and/or data_store');
    }

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
    const interactionRows: InteractionRow[] = [];

    // A process is one circle however many rows mention it, so a number given
    // twice for the same name has to agree.
    const numberByProcessLabel = new Map<string, { number: string; lineNumber: number }>();

    dataRows.forEach(({ cells, lineNumber }) => {
        const processCell = readCell(cells, processColumn);
        const entityName = readCell(cells, entityColumn);
        const inFlowLabel = readCell(cells, inFlowColumn);
        const outFlowLabel = readCell(cells, outFlowColumn);
        const dataStoreName = readCell(cells, dataStoreColumn);
        const dataStoreInLabel = readCell(cells, dataStoreInColumn);
        const dataStoreOutLabel = readCell(cells, dataStoreOutColumn);

        if (!processCell) {
            problems.push(`Line ${lineNumber}: the process name is empty.`);
            return;
        }

        const { label: processLabel, number: processNumber } = parseProcessName(processCell);

        if (processNumber) {
            const seen = numberByProcessLabel.get(processLabel);
            if (seen && seen.number !== processNumber) {
                problems.push(
                    `Line ${lineNumber}: "${processLabel}" is numbered ${processNumber} here ` +
                    `but ${seen.number} on line ${seen.lineNumber}.`
                );
                return;
            }
            if (!seen) numberByProcessLabel.set(processLabel, { number: processNumber, lineNumber });
        }

        const hasEntityFlow = Boolean(inFlowLabel || outFlowLabel);
        const hasDataStoreFlow = Boolean(dataStoreInLabel || dataStoreOutLabel);

        if (entityName && !hasEntityFlow) {
            problems.push(
                `Line ${lineNumber} ("${processLabel}" ↔ "${entityName}"): ` +
                'in_flow and out_flow are both empty, so the entity exchanges nothing.'
            );
            return;
        }

        if (!entityName && hasEntityFlow) {
            problems.push(
                `Line ${lineNumber} ("${processLabel}"): in_flow or out_flow is named ` +
                'but entity_name is empty.'
            );
            return;
        }

        if (dataStoreName && !hasDataStoreFlow) {
            problems.push(
                `Line ${lineNumber} ("${processLabel}" ↔ "${dataStoreName}"): ` +
                'data_store_inflow and data_store_outflow are both empty.'
            );
            return;
        }

        if (!dataStoreName && hasDataStoreFlow) {
            problems.push(
                `Line ${lineNumber} ("${processLabel}"): a data store flow is named ` +
                'but data_store is empty.'
            );
            return;
        }

        if (!entityName && !dataStoreName) {
            problems.push(
                `Line ${lineNumber} ("${processLabel}"): the row names neither an entity ` +
                'nor a data store, so it describes no flow.'
            );
            return;
        }

        interactionRows.push({
            processLabel,
            processNumber,
            entityName,
            inFlowLabel,
            outFlowLabel,
            dataStoreName,
            dataStoreInLabel,
            dataStoreOutLabel,
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

    if (level === 2) {
        const parentProblems = findParentProblems(interactionRows);
        if (parentProblems.length > 0) return { ok: false, problems: parentProblems };
    }

    return buildDecomposedLevel(interactionRows, level);
}

/** The parent a sub-process number belongs to: `6.1` and `6.2` both give `6.0`. */
function parentNumberOf(processNumber: string): string {
    return `${Math.floor(Number(processNumber))}.0`;
}

/**
 * Checks that a Level 2 file describes one process's decomposition.
 *
 * A Level 2 diagram takes its numbering from the process above it, so its
 * sub-processes are `6.1`, `6.2` and so on. Requiring that is what lets the
 * parent be worked out from the file alone, and it is also what stops two
 * decompositions being imported onto the same page.
 */
function findParentProblems(rows: InteractionRow[]): string[] {
    const unnumbered = [...new Set(rows.filter((row) => !row.processNumber).map((row) => row.processLabel))];
    if (unnumbered.length > 0) {
        return [
            'A Level 2 file numbers each sub-process after the process it decomposes, ' +
            `as in "6.1 Cart Handling". Unnumbered: ${unnumbered.join(', ')}.`,
        ];
    }

    const parents = [...new Set(rows.map((row) => parentNumberOf(row.processNumber!)))];
    if (parents.length > 1) {
        return [
            `This file decomposes ${parents.join(' and ')}. A Level 2 diagram covers one ` +
            'process, so import one file per process.',
        ];
    }

    return [];
}

/** Sorts `1.0` before `2.0` before `10.0`, rather than as text. */
function compareProcessNumbers(a: string, b: string): number {
    const parse = (value: string) => value.split('.').map(Number);
    const [aMajor, aMinor = 0] = parse(a);
    const [bMajor, bMinor = 0] = parse(b);
    return aMajor - bMajor || aMinor - bMinor;
}

function buildDecomposedLevel(
    interactionRows: InteractionRow[],
    level: DFDLevel
): DecompositionCsvImportResult {
    // Entities and stores keep the order they first appear in the file, which is
    // the order they are stacked in. Processes are ordered by their number when
    // the file gives one, so the column reads 1.0 downwards.
    const entityNamesInOrder: string[] = [];
    const dataStoreNamesInOrder: string[] = [];
    const processLabelsInOrder: string[] = [];
    const numberByProcessLabel = new Map<string, string>();

    interactionRows.forEach((row) => {
        if (!processLabelsInOrder.includes(row.processLabel)) {
            processLabelsInOrder.push(row.processLabel);
        }
        if (row.processNumber) numberByProcessLabel.set(row.processLabel, row.processNumber);

        if (row.entityName && !entityNamesInOrder.includes(row.entityName)) {
            entityNamesInOrder.push(row.entityName);
        }
        if (row.dataStoreName && !dataStoreNamesInOrder.includes(row.dataStoreName)) {
            dataStoreNamesInOrder.push(row.dataStoreName);
        }
    });

    // An unnumbered process takes the next number after every one the file gave.
    let nextUnnumbered = processLabelsInOrder.reduce((highest, label) => {
        const number = numberByProcessLabel.get(label);
        return number ? Math.max(highest, Math.floor(Number(number))) : highest;
    }, 0);

    processLabelsInOrder.forEach((label) => {
        if (!numberByProcessLabel.has(label)) {
            nextUnnumbered += 1;
            numberByProcessLabel.set(label, `${nextUnnumbered}.0`);
        }
    });

    const orderedProcessLabels = [...processLabelsInOrder].sort((a, b) =>
        compareProcessNumbers(numberByProcessLabel.get(a)!, numberByProcessLabel.get(b)!)
    );

    // Positions are all the same point on purpose: a decomposed level is
    // arranged by the canvas layout, which reads the flows and ignores whatever
    // is stored here.
    const origin = { x: 0, y: 0 };

    const processIdByLabel = new Map<string, string>();
    const processNodes: ProcessNode[] = orderedProcessLabels.map((label) => {
        const id = `p${level}-${crypto.randomUUID().slice(0, 8)}`;
        processIdByLabel.set(label, id);

        return {
            id,
            type: 'process',
            label,
            processNumber: numberByProcessLabel.get(label)!,
            level,
            position: origin,
        };
    });

    const processIdByNumber = new Map(
        processNodes.map((process) => [process.processNumber, process.id])
    );

    /**
     * A participant named with a process number is a process, not an entity —
     * `2.0 Login` in a Level 2 file means the Login process next door.
     *
     * If that process is in this file it is the circle itself, and the row draws
     * a flow between two processes. If it is not, it is a process the diagram
     * only refers to, which a DFD draws as a box beside the entities.
     */
    const participantIdByName = new Map<string, string>();
    const referencedProcessNodes: ExternalProcessNode[] = [];
    const entityNodes: EntityNode[] = [];

    entityNamesInOrder.forEach((name) => {
        const { number } = parseProcessName(name);

        const processInThisFile = number ? processIdByNumber.get(number) : undefined;
        if (processInThisFile) {
            participantIdByName.set(name, processInThisFile);
            return;
        }

        const id = `${number ? 'ref' : 'e'}${level}-${crypto.randomUUID().slice(0, 8)}`;
        participantIdByName.set(name, id);

        if (number) {
            // Keeps its number in the label, which is how a reference to another
            // process is read.
            referencedProcessNodes.push({ id, type: 'process_ref', label: name, level, position: origin });
        } else {
            entityNodes.push({ id, type: 'entity', label: name, level, position: origin });
        }
    });

    const dataStoreIdByName = new Map<string, string>();
    const dataStoreNodes: DataStoreNode[] = dataStoreNamesInOrder.map((name, index) => {
        const id = `ds${level}-${crypto.randomUUID().slice(0, 8)}`;
        dataStoreIdByName.set(name, id);

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

    /**
     * Distinguishes this import's flow ids from any other's.
     *
     * Without it a Level 1 import and a Level 2 import both number their rows
     * from zero and hand out the same ids. Nothing complains while editing, but
     * the two levels live in one saved document, and reading it back rejects the
     * file for holding duplicate flow ids.
     */
    const importToken = crypto.randomUUID().slice(0, 6);

    interactionRows.forEach((row, rowIndex) => {
        const processId = processIdByLabel.get(row.processLabel)!;

        /**
         * The two directions of one exchange share a pair id, which is what
         * keeps them side by side when the level is laid out.
         */
        const addExchange = (
            pairKey: string,
            towards: { label: string; from: string; to: string } | null,
            backwards: { label: string; from: string; to: string } | null
        ) => {
            const pairId = `imp-${importToken}-${rowIndex}-${pairKey}`;
            const isPaired = Boolean(towards && backwards);

            [towards, backwards].forEach((flow, index) => {
                if (!flow) return;
                edges.push({
                    id: `${pairId}-${index === 0 ? 'in' : 'out'}`,
                    type: 'dataflow',
                    label: flow.label,
                    sourceNodeId: flow.from,
                    targetNodeId: flow.to,
                    level,
                    ...(isPaired && { pairId }),
                });
            });
        };

        if (row.entityName) {
            const entityId = participantIdByName.get(row.entityName)!;
            addExchange(
                'entity',
                row.inFlowLabel ? { label: row.inFlowLabel, from: entityId, to: processId } : null,
                row.outFlowLabel ? { label: row.outFlowLabel, from: processId, to: entityId } : null
            );
        }

        if (row.dataStoreName) {
            const dataStoreId = dataStoreIdByName.get(row.dataStoreName)!;
            addExchange(
                'store',
                row.dataStoreInLabel
                    ? { label: row.dataStoreInLabel, from: processId, to: dataStoreId }
                    : null,
                row.dataStoreOutLabel
                    ? { label: row.dataStoreOutLabel, from: dataStoreId, to: processId }
                    : null
            );
        }
    });

    const participants = [...entityNodes, ...referencedProcessNodes];

    return {
        ok: true,
        nodes: [...participants, ...processNodes, ...dataStoreNodes],
        edges,
        processCount: processNodes.length,
        participantCount: participants.length,
        dataStoreCount: dataStoreNodes.length,
        flowCount: edges.length,
        parentProcessNumber:
            level === 2 && processNodes.length > 0
                ? parentNumberOf(processNodes[0].processNumber)
                : null,
    };
}
