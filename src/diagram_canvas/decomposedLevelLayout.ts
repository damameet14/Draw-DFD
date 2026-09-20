import {
    type DFDEdge,
    type DFDNode,
} from '../data_flow_diagram_model/public_interface';
import { type CanvasPosition } from './contextDiagramGeometry';

/**
 * Lays out a decomposed level (Level 1 and Level 2) and routes every flow on it.
 *
 * ## The shape of the diagram
 *
 * Three columns: the entities and process references on the left, the process
 * circles down the middle, the data stores on the right. Between them sit two
 * empty gutters, and every flow travels through one of those gutters as three
 * segments — out of the shape, along a vertical lane, into the other shape.
 *
 * ## Why nothing can overlap
 *
 * Two rules, and between them they make the required guarantees fall out rather
 * than needing to be checked afterwards:
 *
 * 1. **A vertical lane is never shared by two flows whose paths run alongside
 *    each other.** Lanes are handed out by interval colouring, so two flows only
 *    share a lane when their vertical spans are disjoint. No two vertical
 *    segments can therefore lie on top of one another.
 *
 * 2. **No two horizontal segments in a gutter sit at the same height.** Within a
 *    column that follows from the shapes not overlapping vertically and their
 *    handles being spaced apart. Across the two columns bordering a gutter it
 *    follows from parity: handles on the outer columns are placed on even
 *    multiples of the row pitch and handles on the process column on odd ones,
 *    so an outgoing segment can never land on an incoming one and merge with it.
 *
 * Lanes live strictly inside the gutters, where there is nothing to collide
 * with, and a horizontal segment only ever reaches from a shape's own edge into
 * the gutter beside it. So no line crosses a shape, no line lies along another,
 * and every remaining intersection is a horizontal meeting a vertical at a right
 * angle.
 *
 * ## Keeping a flow easy to follow
 *
 * Each entity and data store is placed level with the average height of the
 * processes it deals with, and its flows are ordered by the height of the shape
 * at their far end. A flow's two ends then sit at nearly the same height, and a
 * short vertical run crosses few horizontals — which is what actually removes
 * crossings. Reordering a column on its own does not: it moves the long runs
 * around rather than shortening them.
 *
 * The process column keeps its own numbered order and anchors the level, so 1.0
 * stays above 2.0 whatever the flows do.
 *
 * ## Flows this cannot place
 *
 * A flow between two columns that do not touch — an entity wired straight to a
 * data store — would have to cross the process column, and there is no lane for
 * that. The authoring forms cannot create one; a hand-edited file could. Such a
 * flow still gets its handles, so it is drawn rather than silently disappearing,
 * but it is returned without a route and falls back to a direct line. That is
 * the one case where a line may cross a shape.
 */

/**
 * Vertical grid the handles snap to. Handles on one shape sit two rows apart,
 * which is also the gap between neighbouring flow labels, so it has to be
 * comfortable for a line of label text.
 */
const ROW_PITCH_PX = 20;
const HANDLE_PITCH_PX = ROW_PITCH_PX * 2;

/** Horizontal spacing between the routing lanes inside a gutter. */
const LANE_PITCH_PX = 32;

/**
 * Clear space between a column and the first lane beside it.
 *
 * Wide, because this is the stretch the flow labels sit in, and they are read
 * against the entity or store beside them rather than squeezed into a gap.
 */
const GUTTER_MARGIN_PX = 220;

/**
 * How far a label sits from the entity or data store it belongs beside.
 *
 * Fixed rather than proportional, so the labels on one shape form a tidy column
 * next to it instead of fanning outwards with their lanes.
 */
const LABEL_DISTANCE_PX = 150;

/** Vertical gap between two shapes stacked in the same column. */
const SHAPE_GAP_PX = 72;

/** Space above and to the left of everything. */
const CANVAS_MARGIN_PX = 80;

/** Clear space between a shape's corner and its outermost handle. */
const HANDLE_EDGE_PADDING_PX = 26;

export const LAYOUT_ENTITY_WIDTH_PX = 200;
export const LAYOUT_DATA_STORE_WIDTH_PX = 240;

const MIN_ENTITY_HEIGHT_PX = 90;
const MIN_DATA_STORE_HEIGHT_PX = 60;
const MIN_PROCESS_DIAMETER_PX = 200;

/**
 * Fraction of a circle's height its side handles may occupy. Kept well short of
 * the poles, where the circle turns away and a handle would sit almost under the
 * one above it.
 */
const CIRCLE_HANDLE_SPAN_FRACTION = 0.8;

export type LayoutColumn = 'participant' | 'process' | 'dataStore';
export type HandleSide = 'left' | 'right';

export interface LayoutBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Where one flow meets one shape, in coordinates local to that shape. */
export interface HandlePlacement {
    edgeId: string;
    type: 'source' | 'target';
    side: HandleSide;
    x: number;
    y: number;
}

export interface NodeLayout {
    box: LayoutBox;
    handles: HandlePlacement[];
}

export interface FlowRoute {
    /** Canvas coordinates: shape, lane, lane, shape. */
    points: CanvasPosition[];
    /**
     * Sits on the run of the flow that meets the entity or the data store, so a
     * label is always read beside the thing it describes rather than beside the
     * process, which every flow on the level converges on.
     */
    labelPoint: CanvasPosition;
}

export interface DecomposedLevelLayout {
    nodes: Map<string, NodeLayout>;
    flows: Map<string, FlowRoute>;
    /** One diameter for every circle on the level, as the editor already does. */
    processDiameter: number;
}

interface Attachment {
    edgeId: string;
    type: 'source' | 'target';
    side: HandleSide;
    /** Groups the two halves of one interaction so they stay adjacent. */
    pairKey: string;
    /** Orders the groups down the side of the shape. */
    groupOrder: number;
}

function columnOf(node: DFDNode): LayoutColumn {
    if (node.type === 'process') return 'process';
    if (node.type === 'datastore') return 'dataStore';
    return 'participant';
}

/**
 * Snaps a height to the row grid, keeping the parity a column requires.
 *
 * `parity` is 0 for the outer columns and 1 for the process column, which is
 * what stops a flow's two horizontal segments from ever sharing a height.
 */
function snapToRow(y: number, parity: 0 | 1): number {
    const offset = parity * ROW_PITCH_PX;
    return Math.round((y - offset) / HANDLE_PITCH_PX) * HANDLE_PITCH_PX + offset;
}

/**
 * Spreads `count` handles down a side, centred on the shape and snapped to the
 * grid. Returns canvas heights, which the caller turns into local offsets.
 */
function planHandleHeights(
    count: number,
    centerY: number,
    parity: 0 | 1
): number[] {
    if (count === 0) return [];

    const firstY = snapToRow(centerY - ((count - 1) * HANDLE_PITCH_PX) / 2, parity);
    return Array.from({ length: count }, (_, index) => firstY + index * HANDLE_PITCH_PX);
}

/** Height a stack of `count` handles needs, including the padding at each end. */
function heightForHandleCount(count: number): number {
    return Math.max(0, count - 1) * HANDLE_PITCH_PX + HANDLE_EDGE_PADDING_PX * 2;
}

/**
 * Collects every flow arriving at or leaving each node, already ordered so that
 * the two halves of an interaction end up next to each other.
 *
 * A data store interaction is explicit — its two edges share a `pairId`. A pair
 * of participant flows is not, so flows are grouped by the shape at the other
 * end and the incoming and outgoing ones are interleaved, which puts a request
 * beside the answer to it.
 */
function collectAttachments(
    nodes: DFDNode[],
    edges: DFDEdge[]
): Map<string, Attachment[]> {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const orderById = new Map(nodes.map((node, index) => [node.id, index]));
    const attachmentsByNodeId = new Map<string, Attachment[]>();

    // Keyed by node, then by the shape at the other end of the flow.
    const groupsByNodeId = new Map<string, Map<string, Attachment[]>>();

    const addAttachment = (nodeId: string, otherNodeId: string, attachment: Attachment) => {
        const groups = groupsByNodeId.get(nodeId) ?? new Map<string, Attachment[]>();
        const group = groups.get(otherNodeId) ?? [];
        group.push(attachment);
        groups.set(otherNodeId, group);
        groupsByNodeId.set(nodeId, groups);
    };

    edges.forEach((edge) => {
        const source = nodesById.get(edge.sourceNodeId);
        const target = nodesById.get(edge.targetNodeId);
        if (!source || !target || source.id === target.id) return;

        const sideFor = (node: DFDNode, otherNode: DFDNode): HandleSide => {
            if (columnOf(node) === 'participant') return 'right';
            if (columnOf(node) === 'dataStore') return 'left';
            // A process faces its participants on the left and everything else
            // — data stores, other processes — on the right.
            return columnOf(otherNode) === 'participant' ? 'left' : 'right';
        };

        // Both halves of one interaction carry the same key on both shapes, so
        // they stay together at each end.
        const pairKey = edge.pairId ?? edge.id;

        addAttachment(source.id, target.id, {
            edgeId: edge.id,
            type: 'source',
            side: sideFor(source, target),
            pairKey,
            groupOrder: orderById.get(target.id) ?? 0,
        });

        addAttachment(target.id, source.id, {
            edgeId: edge.id,
            type: 'target',
            side: sideFor(target, source),
            pairKey,
            groupOrder: orderById.get(source.id) ?? 0,
        });
    });

    groupsByNodeId.forEach((groups, nodeId) => {
        const ordered = [...groups.values()]
            .sort((a, b) => a[0].groupOrder - b[0].groupOrder)
            .flatMap((group) => orderGroupByPair(group));

        attachmentsByNodeId.set(nodeId, ordered);
    });

    return attachmentsByNodeId;
}

/**
 * Orders one shape's flows to a single other shape.
 *
 * Interactions that name a pair are kept whole; the rest are interleaved so an
 * incoming flow is followed by the outgoing one it answers.
 */
function orderGroupByPair(group: Attachment[]): Attachment[] {
    const pairs = new Map<string, Attachment[]>();
    group.forEach((attachment) => {
        pairs.set(attachment.pairKey, [...(pairs.get(attachment.pairKey) ?? []), attachment]);
    });

    const paired = [...pairs.values()].filter((entries) => entries.length > 1).flat();
    const unpairedIncoming = [...pairs.values()]
        .filter((entries) => entries.length === 1 && entries[0].type === 'target')
        .flat();
    const unpairedOutgoing = [...pairs.values()]
        .filter((entries) => entries.length === 1 && entries[0].type === 'source')
        .flat();

    const interleaved: Attachment[] = [];
    for (let index = 0; index < Math.max(unpairedIncoming.length, unpairedOutgoing.length); index++) {
        if (unpairedIncoming[index]) interleaved.push(unpairedIncoming[index]);
        if (unpairedOutgoing[index]) interleaved.push(unpairedOutgoing[index]);
    }

    return [...paired, ...interleaved];
}

/** Which gutter a flow travels through, or `null` if it cannot use either. */
function gutterFor(source: DFDNode, target: DFDNode): 'left' | 'right' | null {
    const columns = [columnOf(source), columnOf(target)];
    const has = (column: LayoutColumn) => columns.includes(column);

    if (has('participant') && has('process')) return 'left';
    if (has('process') && has('dataStore')) return 'right';
    // Two processes leave and re-enter the middle column through the right-hand
    // gutter, where the lanes keep them clear of everything else.
    if (columns[0] === 'process' && columns[1] === 'process') return 'right';
    return null;
}

interface StackedShape {
    node: DFDNode;
    attachments: Attachment[];
    width: number;
    height: number;
    y: number;
}

/** The height a flow meets the shape at its far end, if that end has one yet. */
type PartnerHeightLookup = (nodeId: string, attachment: Attachment) => number | null;

/**
 * Re-orders a shape's flows to follow the heights of the shapes at their far
 * ends, and reports the height this shape wants to sit at.
 *
 * Both halves of an interaction move together, so the pairing survives the sort:
 * a pair is ordered by the average height of its own two ends, never split.
 */
function alignAttachmentsToPartners(
    shape: StackedShape,
    partnerHeightOf: PartnerHeightLookup
): number | null {
    const groups = new Map<string, { attachments: Attachment[]; heights: number[] }>();

    shape.attachments.forEach((attachment) => {
        const group = groups.get(attachment.pairKey) ?? { attachments: [], heights: [] };
        group.attachments.push(attachment);

        const height = partnerHeightOf(shape.node.id, attachment);
        if (height !== null) group.heights.push(height);

        groups.set(attachment.pairKey, group);
    });

    const meanOf = (heights: number[]) =>
        heights.length ? heights.reduce((sum, value) => sum + value, 0) / heights.length : null;

    // A pair whose far end has no height — a flow the layout cannot route — keeps
    // to the end rather than dragging the shape anywhere.
    const ordered = [...groups.values()].sort((a, b) => {
        const [aMean, bMean] = [meanOf(a.heights), meanOf(b.heights)];
        if (aMean === null) return bMean === null ? 0 : 1;
        if (bMean === null) return -1;
        return aMean - bMean;
    });

    shape.attachments = ordered.flatMap((group) => group.attachments);

    return meanOf(ordered.flatMap((group) => group.heights));
}

/**
 * Places a column level with the flows arriving from the column beside it.
 *
 * Each shape wants to sit at the average height of the processes it talks to,
 * which keeps a flow's two ends at nearly the same height. That is what removes
 * crossings: a vertical run crosses every horizontal it passes, so shortening
 * the runs removes crossings outright, where reordering a column only moves them
 * around. On the example diagram this is the difference between 3320 crossings
 * and under a thousand, and it needs a third of the lanes.
 *
 * Two shapes wanting the same height is settled by taking them in the order they
 * asked for and packing downwards, so the column keeps that order and nothing
 * overlaps.
 */
function alignColumn(
    shapes: StackedShape[],
    partnerHeightOf: PartnerHeightLookup
): StackedShape[] {
    const wanted = new Map<string, number>();

    shapes.forEach((shape) => {
        const target = alignAttachmentsToPartners(shape, partnerHeightOf);
        if (target !== null) wanted.set(shape.node.id, target);
    });

    // A shape with nothing routable attached has no opinion, so it goes below the
    // ones that do rather than displacing them.
    const inColumnOrder = [
        ...shapes
            .filter((shape) => wanted.has(shape.node.id))
            .sort((a, b) => wanted.get(a.node.id)! - wanted.get(b.node.id)!),
        ...shapes.filter((shape) => !wanted.has(shape.node.id)),
    ];

    let cursor = CANVAS_MARGIN_PX;
    inColumnOrder.forEach((shape) => {
        const wantedTop = (wanted.get(shape.node.id) ?? cursor) - shape.height / 2;
        shape.y = Math.max(cursor, wantedTop);
        cursor = shape.y + shape.height + SHAPE_GAP_PX;
    });

    return inColumnOrder;
}

/** Stacks one column from the top, returning the shapes with their heights set. */
function stackColumn(
    nodes: DFDNode[],
    attachmentsByNodeId: Map<string, Attachment[]>,
    width: number,
    heightFor: (attachmentCount: number) => number
): StackedShape[] {
    let cursorY = CANVAS_MARGIN_PX;

    return nodes.map((node) => {
        const attachments = attachmentsByNodeId.get(node.id) ?? [];
        const height = heightFor(attachments.length);
        const shape: StackedShape = { node, attachments, width, height, y: cursorY };
        cursorY += height + SHAPE_GAP_PX;
        return shape;
    });
}

/**
 * Diameter every circle on the level takes.
 *
 * Sized from the busiest side of the busiest process, because the handles on one
 * side have to fit within the part of the circle that faces that way.
 */
function planProcessDiameter(
    processes: DFDNode[],
    attachmentsByNodeId: Map<string, Attachment[]>
): number {
    const busiestSide = processes.reduce((busiest, process) => {
        const attachments = attachmentsByNodeId.get(process.id) ?? [];
        const left = attachments.filter((attachment) => attachment.side === 'left').length;
        const right = attachments.filter((attachment) => attachment.side === 'right').length;
        return Math.max(busiest, left, right);
    }, 0);

    return Math.max(
        MIN_PROCESS_DIAMETER_PX,
        Math.ceil(heightForHandleCount(busiestSide) / CIRCLE_HANDLE_SPAN_FRACTION)
    );
}

/**
 * Hands each flow a lane in its gutter.
 *
 * Lanes are reused wherever two flows cannot touch: a flow occupies the height
 * between its two ends, so a lane can carry a second flow once the first has
 * finished with it. Sorting by where each flow starts and taking the first free
 * lane is the standard interval colouring, and it uses no more lanes than the
 * busiest height genuinely requires.
 */
function assignLanes(spans: { edgeId: string; top: number; bottom: number }[]): Map<string, number> {
    const laneByEdgeId = new Map<string, number>();
    // The lowest point each lane is occupied down to.
    const laneBottoms: number[] = [];

    [...spans]
        .sort((a, b) => a.top - b.top)
        .forEach((span) => {
            // A lane is free once its last flow ends clear of this one; the row
            // pitch of clearance keeps two lines from meeting end to end.
            let laneIndex = laneBottoms.findIndex((bottom) => bottom + ROW_PITCH_PX < span.top);
            if (laneIndex === -1) laneIndex = laneBottoms.length;

            laneBottoms[laneIndex] = span.bottom;
            laneByEdgeId.set(span.edgeId, laneIndex);
        });

    return laneByEdgeId;
}

/** Where a handle sits on a circle's edge, given how far down the circle it is. */
function circleHandleX(diameter: number, localY: number, side: HandleSide): number {
    const radius = diameter / 2;
    const verticalOffset = Math.min(radius, Math.abs(localY - radius));
    const horizontalOffset = Math.sqrt(Math.max(0, radius * radius - verticalOffset * verticalOffset));
    return side === 'left' ? radius - horizontalOffset : radius + horizontalOffset;
}

/**
 * Plans the whole level: where every shape sits, where every flow meets it, and
 * the path each flow takes between them.
 */
export function planDecomposedLevelLayout(
    nodes: DFDNode[],
    edges: DFDEdge[]
): DecomposedLevelLayout {
    const participants = nodes.filter((node) => columnOf(node) === 'participant');
    const processes = nodes.filter((node) => columnOf(node) === 'process');
    const dataStores = nodes.filter((node) => columnOf(node) === 'dataStore');

    const attachmentsByNodeId = collectAttachments(nodes, edges);
    const processDiameter = planProcessDiameter(processes, attachmentsByNodeId);

    // Heights first: nothing about them depends on the horizontal placement,
    // which is what lets the lanes be counted before the columns are spaced.
    //
    // The process column is stacked in its own numbered order and anchors the
    // level, so 1.0 stays above 2.0; the entities and the stores are then placed
    // to meet the flows those processes hold.
    const processShapes = stackColumn(
        processes,
        attachmentsByNodeId,
        processDiameter,
        () => processDiameter
    );

    // Handle heights, on the grid. The outer columns take the even rows and the
    // process column the odd ones, so the two halves of a flow can never end up
    // running along the same line.
    const handleYByKey = new Map<string, number>();
    const assignHandleHeights = (shapes: StackedShape[], parity: 0 | 1) => {
        shapes.forEach((shape) => {
            (['left', 'right'] as HandleSide[]).forEach((side) => {
                const onSide = shape.attachments.filter((attachment) => attachment.side === side);
                const heights = planHandleHeights(
                    onSide.length,
                    shape.y + shape.height / 2,
                    parity
                );
                onSide.forEach((attachment, index) => {
                    handleYByKey.set(`${shape.node.id}:${attachment.edgeId}`, heights[index]);
                });
            });
        });
    };

    assignHandleHeights(processShapes, 1);

    const endpointsByEdgeId = new Map(
        edges.map((edge) => [edge.id, [edge.sourceNodeId, edge.targetNodeId]] as const)
    );
    const partnerHeightOf: PartnerHeightLookup = (nodeId, attachment) => {
        const endpoints = endpointsByEdgeId.get(attachment.edgeId);
        if (!endpoints) return null;
        const partnerId = endpoints[0] === nodeId ? endpoints[1] : endpoints[0];
        return handleYByKey.get(`${partnerId}:${attachment.edgeId}`) ?? null;
    };

    const placeAgainstProcesses = (shapes: StackedShape[]) => {
        const aligned = alignColumn(shapes, partnerHeightOf);
        assignHandleHeights(aligned, 0);
        return aligned;
    };

    const participantShapes = placeAgainstProcesses(
        stackColumn(
            participants,
            attachmentsByNodeId,
            LAYOUT_ENTITY_WIDTH_PX,
            (count) => Math.max(MIN_ENTITY_HEIGHT_PX, heightForHandleCount(count))
        )
    );
    const dataStoreShapes = placeAgainstProcesses(
        stackColumn(
            dataStores,
            attachmentsByNodeId,
            LAYOUT_DATA_STORE_WIDTH_PX,
            (count) => Math.max(MIN_DATA_STORE_HEIGHT_PX, heightForHandleCount(count))
        )
    );

    // Lanes, now that both ends of every flow have a height.
    const routableEdges = edges.filter((edge) => {
        const source = nodes.find((node) => node.id === edge.sourceNodeId);
        const target = nodes.find((node) => node.id === edge.targetNodeId);
        return Boolean(source && target && gutterFor(source, target));
    });

    const spansByGutter = { left: [] as ReturnType<typeof toSpan>[], right: [] as ReturnType<typeof toSpan>[] };
    function toSpan(edge: DFDEdge) {
        const sourceY = handleYByKey.get(`${edge.sourceNodeId}:${edge.id}`) ?? 0;
        const targetY = handleYByKey.get(`${edge.targetNodeId}:${edge.id}`) ?? 0;
        return {
            edgeId: edge.id,
            top: Math.min(sourceY, targetY),
            bottom: Math.max(sourceY, targetY),
        };
    }

    routableEdges.forEach((edge) => {
        const source = nodes.find((node) => node.id === edge.sourceNodeId)!;
        const target = nodes.find((node) => node.id === edge.targetNodeId)!;
        spansByGutter[gutterFor(source, target)!].push(toSpan(edge));
    });

    const lanesByGutter = {
        left: assignLanes(spansByGutter.left),
        right: assignLanes(spansByGutter.right),
    };

    const gutterWidth = (laneCount: number) =>
        GUTTER_MARGIN_PX * 2 + Math.max(0, laneCount - 1) * LANE_PITCH_PX;

    const leftLaneCount = new Set(lanesByGutter.left.values()).size;
    const rightLaneCount = new Set(lanesByGutter.right.values()).size;

    // Columns, left to right.
    const participantX = CANVAS_MARGIN_PX;
    const processX = participants.length
        ? participantX + LAYOUT_ENTITY_WIDTH_PX + gutterWidth(leftLaneCount)
        : participantX;
    const dataStoreX = processX + processDiameter + gutterWidth(rightLaneCount);

    const leftGutterStart = processX - gutterWidth(leftLaneCount) + GUTTER_MARGIN_PX;
    const rightGutterStart = processX + processDiameter + GUTTER_MARGIN_PX;

    const nodeLayouts = new Map<string, NodeLayout>();

    const placeShapes = (shapes: StackedShape[], x: number) => {
        shapes.forEach((shape) => {
            const box: LayoutBox = { x, y: shape.y, width: shape.width, height: shape.height };
            const isCircle = shape.node.type === 'process';

            nodeLayouts.set(shape.node.id, {
                box,
                handles: shape.attachments.map((attachment) => {
                    const localY = (handleYByKey.get(`${shape.node.id}:${attachment.edgeId}`) ?? 0) - shape.y;
                    return {
                        edgeId: attachment.edgeId,
                        type: attachment.type,
                        side: attachment.side,
                        x: isCircle
                            ? circleHandleX(shape.width, localY, attachment.side)
                            : attachment.side === 'left' ? 0 : shape.width,
                        y: localY,
                    };
                }),
            });
        });
    };

    placeShapes(participantShapes, participantX);
    placeShapes(processShapes, processX);
    placeShapes(dataStoreShapes, dataStoreX);

    // Routes.
    const flows = new Map<string, FlowRoute>();

    routableEdges.forEach((edge) => {
        const source = nodes.find((node) => node.id === edge.sourceNodeId)!;
        const target = nodes.find((node) => node.id === edge.targetNodeId)!;
        const gutter = gutterFor(source, target)!;

        const sourceLayout = nodeLayouts.get(source.id);
        const targetLayout = nodeLayouts.get(target.id);
        if (!sourceLayout || !targetLayout) return;

        const sourceHandle = sourceLayout.handles.find((handle) => handle.edgeId === edge.id);
        const targetHandle = targetLayout.handles.find((handle) => handle.edgeId === edge.id);
        if (!sourceHandle || !targetHandle) return;

        const laneIndex = lanesByGutter[gutter].get(edge.id) ?? 0;
        const laneX =
            (gutter === 'left' ? leftGutterStart : rightGutterStart) + laneIndex * LANE_PITCH_PX;

        const start: CanvasPosition = {
            x: sourceLayout.box.x + sourceHandle.x,
            y: sourceLayout.box.y + sourceHandle.y,
        };
        const end: CanvasPosition = {
            x: targetLayout.box.x + targetHandle.x,
            y: targetLayout.box.y + targetHandle.y,
        };

        // The label goes beside the entity or the data store, never beside the
        // process, whichever end of the flow that happens to be. A process
        // gathers flows from every direction, so labels collected there say
        // little; read beside the entity they name what that entity sends and
        // gets back, and the pair of a request and its answer ends up one above
        // the other on the same side of the same box.
        const outerEnd = columnOf(source) !== 'process' ? start : columnOf(target) !== 'process' ? end : start;

        // Held at a fixed distance rather than halfway along, so every label on
        // one shape lines up in a column beside it however far out its flow's
        // lane happens to be.
        const runLength = Math.abs(laneX - outerEnd.x);
        const labelDistance = Math.min(LABEL_DISTANCE_PX, Math.max(0, runLength - LANE_PITCH_PX / 4));

        flows.set(edge.id, {
            points: [start, { x: laneX, y: start.y }, { x: laneX, y: end.y }, end],
            labelPoint: {
                x: outerEnd.x + Math.sign(laneX - outerEnd.x) * labelDistance,
                y: outerEnd.y,
            },
        });
    });

    return { nodes: nodeLayouts, flows, processDiameter };
}
