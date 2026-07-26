import {
    type DFDDiagram,
    type DFDEdge,
    type DFDLevel,
    type DataStoreNode,
    type EntityNode,
    type ExternalProcessNode,
    type ProcessNode,
} from '../data_flow_diagram_model/public_interface';

/**
 * Projects the stored diagram into the shape the decomposition forms display.
 *
 * The Level 1 and Level 2 forms used to keep their own `useState` copy of every
 * process and flow they had created. That copy was lost whenever the level tabs
 * unmounted the form, leaving the nodes stranded on the canvas with no way to
 * edit or delete them. Deriving the same view from the store instead means the
 * store stays the single source of truth and the forms hold nothing but the
 * text currently being typed into their inputs.
 */

/** An external entity, or a reference to a process owned by another diagram. */
export type FlowParticipantNode = EntityNode | ExternalProcessNode;

export type ProcessFlowDirection = 'to' | 'from';

/** A one-way flow between a process and an entity or process reference. */
export interface ParticipantFlow {
    edgeId: string;
    participantId: string;
    label: string;
}

/**
 * A process's use of one data store. The read and write flows are separate
 * edges sharing a `pairId`, which is what lets them be regrouped here.
 */
export interface DataStoreInteraction {
    interactionId: string;
    dataStoreId: string;
    /** Data store to process. Empty when the process only writes. */
    readLabel: string;
    /** Process to data store. Empty when the process only reads. */
    writeLabel: string;
    readEdgeId?: string;
    writeEdgeId?: string;
}

/** A flow between two processes on the same level. */
export interface ProcessFlow {
    edgeId: string;
    otherProcessId: string;
    direction: ProcessFlowDirection;
    label: string;
}

export interface ProcessAuthoringModel {
    process: ProcessNode;
    participantInputs: ParticipantFlow[];
    participantOutputs: ParticipantFlow[];
    dataStoreInteractions: DataStoreInteraction[];
    processFlows: ProcessFlow[];
    totalFlowCount: number;
}

function isFlowParticipant(nodeType: string): boolean {
    return nodeType === 'entity' || nodeType === 'process_ref';
}

export function selectFlowParticipants(
    diagram: DFDDiagram,
    level: DFDLevel
): FlowParticipantNode[] {
    return diagram.nodes.filter(
        (node): node is FlowParticipantNode => node.level === level && isFlowParticipant(node.type)
    );
}

export function selectDataStores(diagram: DFDDiagram, level: DFDLevel): DataStoreNode[] {
    return diagram.nodes.filter(
        (node): node is DataStoreNode => node.level === level && node.type === 'datastore'
    );
}

export function selectProcesses(diagram: DFDDiagram, level: DFDLevel): ProcessNode[] {
    return diagram.nodes.filter(
        (node): node is ProcessNode => node.level === level && node.type === 'process'
    );
}

/**
 * Groups a process's data store edges back into interactions.
 *
 * Edges written by the forms carry a `pairId`. Anything without one — a flow
 * loaded from an older saved diagram — becomes an interaction of its own rather
 * than being dropped.
 */
function deriveDataStoreInteractions(
    processId: string,
    dataStoreEdges: DFDEdge[]
): DataStoreInteraction[] {
    const interactionsByPairId = new Map<string, DataStoreInteraction>();

    dataStoreEdges.forEach((edge) => {
        const isWrite = edge.sourceNodeId === processId;
        const dataStoreId = isWrite ? edge.targetNodeId : edge.sourceNodeId;
        const interactionId = edge.pairId ?? edge.id;

        const existing = interactionsByPairId.get(interactionId) ?? {
            interactionId,
            dataStoreId,
            readLabel: '',
            writeLabel: '',
        };

        interactionsByPairId.set(interactionId, {
            ...existing,
            ...(isWrite
                ? { writeLabel: edge.label, writeEdgeId: edge.id }
                : { readLabel: edge.label, readEdgeId: edge.id }),
        });
    });

    return [...interactionsByPairId.values()];
}

/**
 * Builds one authoring model per process on `level`, in the order the processes
 * were added to the diagram.
 */
export function deriveProcessAuthoringModels(
    diagram: DFDDiagram,
    level: DFDLevel
): ProcessAuthoringModel[] {
    const nodeTypeById = new Map(
        diagram.nodes.filter((node) => node.level === level).map((node) => [node.id, node.type])
    );
    const edgesOnLevel = diagram.edges.filter((edge) => edge.level === level);

    return selectProcesses(diagram, level).map((process) => {
        const participantInputs: ParticipantFlow[] = [];
        const participantOutputs: ParticipantFlow[] = [];
        const processFlows: ProcessFlow[] = [];
        const dataStoreEdges: DFDEdge[] = [];

        edgesOnLevel.forEach((edge) => {
            const isOutgoing = edge.sourceNodeId === process.id;
            const isIncoming = edge.targetNodeId === process.id;
            if (!isOutgoing && !isIncoming) return;

            const otherNodeId = isOutgoing ? edge.targetNodeId : edge.sourceNodeId;
            const otherNodeType = nodeTypeById.get(otherNodeId);

            // A self-referencing flow has no "other" node to categorise it by.
            if (!otherNodeType || otherNodeId === process.id) return;

            if (otherNodeType === 'datastore') {
                dataStoreEdges.push(edge);
            } else if (isFlowParticipant(otherNodeType)) {
                const flow: ParticipantFlow = {
                    edgeId: edge.id,
                    participantId: otherNodeId,
                    label: edge.label,
                };
                (isOutgoing ? participantOutputs : participantInputs).push(flow);
            } else if (otherNodeType === 'process') {
                processFlows.push({
                    edgeId: edge.id,
                    otherProcessId: otherNodeId,
                    direction: isOutgoing ? 'to' : 'from',
                    label: edge.label,
                });
            }
        });

        const dataStoreInteractions = deriveDataStoreInteractions(process.id, dataStoreEdges);

        return {
            process,
            participantInputs,
            participantOutputs,
            dataStoreInteractions,
            processFlows,
            totalFlowCount:
                participantInputs.length +
                participantOutputs.length +
                dataStoreInteractions.length +
                processFlows.length,
        };
    });
}

/**
 * Allocates the next `D<n>` code from the highest number already in use rather
 * than from how many stores exist, so deleting D2 of three cannot hand out a
 * second D3.
 */
export function nextDataStoreCode(existingDataStores: DataStoreNode[]): string {
    const highestInUse = existingDataStores.reduce((highest, dataStore) => {
        const match = /^D(\d+)$/.exec(dataStore.storeCode ?? '');
        return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);

    return `D${highestInUse + 1}`;
}

/**
 * Allocates the next `X.0` process number the same way, so numbering stays
 * unique across deletions.
 */
export function nextProcessNumber(existingProcesses: ProcessNode[]): string {
    const highestInUse = existingProcesses.reduce((highest, process) => {
        const match = /^(\d+)\.0$/.exec(process.processNumber ?? '');
        return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);

    return `${highestInUse + 1}.0`;
}

/** Identifier shared by the two edges of one data store interaction. */
export function createInteractionPairId(): string {
    return `int-${crypto.randomUUID().slice(0, 8)}`;
}

export function createFlowEdgeId(): string {
    return `flow-${crypto.randomUUID().slice(0, 8)}`;
}
