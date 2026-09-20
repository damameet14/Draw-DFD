import { describe, it, expect } from 'vitest';
import { type DFDEdge, type DFDNode } from '../../data_flow_diagram_model/public_interface';
import { planDecomposedLevelLayout, type FlowRoute } from '../decomposedLevelLayout';

/**
 * The layout's promises are geometric, so most of these tests state them
 * geometrically: pull every segment out of every route and assert that nothing
 * lies on anything else. A rule checked that way keeps holding when the layout
 * is tuned, which a test pinning exact coordinates would not.
 */

const TOLERANCE_PX = 0.5;

function entity(id: string): DFDNode {
    return { id, type: 'entity', label: id, level: 1, position: { x: 0, y: 0 } };
}

function process(id: string, processNumber: string): DFDNode {
    return { id, type: 'process', label: id, level: 1, position: { x: 0, y: 0 }, processNumber };
}

function dataStore(id: string, storeCode: string): DFDNode {
    return { id, type: 'datastore', label: id, level: 1, position: { x: 0, y: 0 }, storeCode };
}

function flow(id: string, sourceNodeId: string, targetNodeId: string, pairId?: string): DFDEdge {
    return { id, type: 'dataflow', label: id, level: 1, sourceNodeId, targetNodeId, pairId };
}

/** A pair of opposite flows between the same two shapes. */
function interaction(pairId: string, a: string, b: string): DFDEdge[] {
    return [flow(`${pairId}-in`, a, b, pairId), flow(`${pairId}-out`, b, a, pairId)];
}

/**
 * A level shaped like a real one: four entities talking to ten processes, and
 * those processes reading and writing six stores.
 */
function buildBusyLevel(): { nodes: DFDNode[]; edges: DFDEdge[] } {
    const entities = ['admin', 'farmer', 'expert', 'ngo'].map(entity);
    const processes = Array.from({ length: 10 }, (_, index) =>
        process(`p-${index + 1}`, `${index + 1}.0`)
    );
    const stores = Array.from({ length: 6 }, (_, index) =>
        dataStore(`d-${index + 1}`, `D${index + 1}`)
    );

    const edges: DFDEdge[] = [];

    entities.forEach((participant, entityIndex) => {
        // Each entity uses three processes, and both directions with each.
        [0, 1, 2].forEach((offset) => {
            const target = processes[(entityIndex * 2 + offset) % processes.length];
            edges.push(...interaction(`${participant.id}-${target.id}`, participant.id, target.id));
        });
    });

    processes.forEach((currentProcess, processIndex) => {
        const store = stores[processIndex % stores.length];
        edges.push(...interaction(`${currentProcess.id}-${store.id}`, currentProcess.id, store.id));
    });

    return { nodes: [...entities, ...processes, ...stores], edges };
}

interface Segment {
    edgeId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

function toSegments(flows: Map<string, FlowRoute>): Segment[] {
    const segments: Segment[] = [];

    flows.forEach((route, edgeId) => {
        for (let index = 0; index < route.points.length - 1; index++) {
            const from = route.points[index];
            const to = route.points[index + 1];
            if (from.x === to.x && from.y === to.y) continue;
            segments.push({ edgeId, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        }
    });

    return segments;
}

const isHorizontal = (segment: Segment) => Math.abs(segment.y1 - segment.y2) < TOLERANCE_PX;
const isVertical = (segment: Segment) => Math.abs(segment.x1 - segment.x2) < TOLERANCE_PX;

/** Overlap of two ranges, negative when they merely approach each other. */
function overlapLength(aFrom: number, aTo: number, bFrom: number, bTo: number): number {
    const [aLow, aHigh] = [Math.min(aFrom, aTo), Math.max(aFrom, aTo)];
    const [bLow, bHigh] = [Math.min(bFrom, bTo), Math.max(bFrom, bTo)];
    return Math.min(aHigh, bHigh) - Math.max(aLow, bLow);
}

describe('planDecomposedLevelLayout', () => {
    it('routes every flow it is given', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);

        expect(layout.flows.size).toBe(edges.length);
        layout.flows.forEach((route) => {
            expect(route.points).toHaveLength(4);
        });
    });

    it('draws every segment either horizontal or vertical', () => {
        const { nodes, edges } = buildBusyLevel();
        const segments = toSegments(planDecomposedLevelLayout(nodes, edges).flows);

        for (const segment of segments) {
            expect(isHorizontal(segment) || isVertical(segment)).toBe(true);
        }
    });

    it('never lays one flow along another', () => {
        const { nodes, edges } = buildBusyLevel();
        const segments = toSegments(planDecomposedLevelLayout(nodes, edges).flows);

        const overlaps: string[] = [];

        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const a = segments[i];
                const b = segments[j];
                if (a.edgeId === b.edgeId) continue;

                // Two parallel segments only lie on each other when they share
                // their fixed coordinate and their extents genuinely overlap.
                if (isHorizontal(a) && isHorizontal(b) && Math.abs(a.y1 - b.y1) < TOLERANCE_PX) {
                    if (overlapLength(a.x1, a.x2, b.x1, b.x2) > TOLERANCE_PX) {
                        overlaps.push(`${a.edgeId} and ${b.edgeId} share the row y=${a.y1}`);
                    }
                }

                if (isVertical(a) && isVertical(b) && Math.abs(a.x1 - b.x1) < TOLERANCE_PX) {
                    if (overlapLength(a.y1, a.y2, b.y1, b.y2) > TOLERANCE_PX) {
                        overlaps.push(`${a.edgeId} and ${b.edgeId} share the lane x=${a.x1}`);
                    }
                }
            }
        }

        expect(overlaps).toEqual([]);
    });

    it('never draws a line across a shape', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);
        const segments = toSegments(layout.flows);

        const intrusions: string[] = [];

        layout.nodes.forEach(({ box }, nodeId) => {
            const isCircle = nodes.find((node) => node.id === nodeId)?.type === 'process';
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            const radius = box.width / 2;

            for (const segment of segments) {
                // Walk the segment and check no interior point is inside the
                // shape. Endpoints sit exactly on the boundary, so the sampling
                // deliberately stops short of both ends.
                const steps = 64;
                for (let step = 1; step < steps; step++) {
                    const ratio = step / steps;
                    const x = segment.x1 + (segment.x2 - segment.x1) * ratio;
                    const y = segment.y1 + (segment.y2 - segment.y1) * ratio;

                    const isInside = isCircle
                        ? Math.hypot(x - centerX, y - centerY) < radius - TOLERANCE_PX
                        : x > box.x + TOLERANCE_PX &&
                        x < box.x + box.width - TOLERANCE_PX &&
                        y > box.y + TOLERANCE_PX &&
                        y < box.y + box.height - TOLERANCE_PX;

                    if (isInside) {
                        intrusions.push(`${segment.edgeId} crosses ${nodeId}`);
                        break;
                    }
                }
            }
        });

        expect([...new Set(intrusions)]).toEqual([]);
    });

    it('starts and ends each flow on its own handles', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);

        edges.forEach((edge) => {
            const route = layout.flows.get(edge.id)!;
            const source = layout.nodes.get(edge.sourceNodeId)!;
            const target = layout.nodes.get(edge.targetNodeId)!;

            const sourceHandle = source.handles.find((handle) => handle.edgeId === edge.id)!;
            const targetHandle = target.handles.find((handle) => handle.edgeId === edge.id)!;

            expect(route.points[0].x).toBeCloseTo(source.box.x + sourceHandle.x, 5);
            expect(route.points[0].y).toBeCloseTo(source.box.y + sourceHandle.y, 5);
            expect(route.points[3].x).toBeCloseTo(target.box.x + targetHandle.x, 5);
            expect(route.points[3].y).toBeCloseTo(target.box.y + targetHandle.y, 5);
        });
    });

    it('keeps the two halves of an interaction next to each other', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);

        const pairIds = [...new Set(edges.map((edge) => edge.pairId).filter(Boolean))] as string[];
        expect(pairIds.length).toBeGreaterThan(0);

        pairIds.forEach((pairId) => {
            const pairEdgeIds = edges
                .filter((edge) => edge.pairId === pairId)
                .map((edge) => edge.id);

            layout.nodes.forEach(({ handles }, nodeId) => {
                const onThisShape = handles
                    .map((handle, index) => ({ handle, index }))
                    .filter(({ handle }) => pairEdgeIds.includes(handle.edgeId));

                if (onThisShape.length !== 2) return;

                const [first, second] = onThisShape;
                expect(
                    Math.abs(first.index - second.index),
                    `${pairId} is split apart on ${nodeId}`
                ).toBe(1);
                // And adjacent in position, not just in the list.
                expect(Math.abs(first.handle.y - second.handle.y)).toBeCloseTo(40, 5);
            });
        });
    });

    it('puts every label beside the entity or the store, never the process', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);
        const typeById = new Map(nodes.map((node) => [node.id, node.type]));

        edges.forEach((edge) => {
            const route = layout.flows.get(edge.id)!;

            // Whichever end is not the process circle is the one to read the
            // label against, however the flow happens to point.
            const outerNodeId =
                typeById.get(edge.sourceNodeId) === 'process' ? edge.targetNodeId : edge.sourceNodeId;
            const outerBox = layout.nodes.get(outerNodeId)!.box;
            const outerHandle = layout.nodes
                .get(outerNodeId)!
                .handles.find((handle) => handle.edgeId === edge.id)!;

            // On that shape's own run, at its own height.
            expect(route.labelPoint.y).toBeCloseTo(outerBox.y + outerHandle.y, 5);

            // Beside the shape rather than out with the lanes.
            const nearEdge = Math.min(
                Math.abs(route.labelPoint.x - outerBox.x),
                Math.abs(route.labelPoint.x - (outerBox.x + outerBox.width))
            );
            expect(nearEdge).toBeCloseTo(150, 5);
        });
    });

    it('lines the labels of one shape up in a column beside it', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);

        // Every flow touching one entity, whichever way it points and whichever
        // lane it takes, puts its label at the same distance from the box.
        const entityFlows = edges.filter(
            (edge) => edge.sourceNodeId === 'admin' || edge.targetNodeId === 'admin'
        );
        expect(entityFlows.length).toBeGreaterThan(2);

        const labelXs = new Set(
            entityFlows.map((edge) => Math.round(layout.flows.get(edge.id)!.labelPoint.x))
        );
        expect(labelXs.size).toBe(1);
    });

    it('keeps neighbouring labels a readable distance apart', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);

        const labelPoints = [...layout.flows.values()].map((route) => route.labelPoint);

        // Two labels may share a height only if they are far apart across the
        // page; otherwise they must be on different rows.
        for (let i = 0; i < labelPoints.length; i++) {
            for (let j = i + 1; j < labelPoints.length; j++) {
                const sameRow = Math.abs(labelPoints[i].y - labelPoints[j].y) < 40 - TOLERANCE_PX;
                if (sameRow) {
                    expect(Math.abs(labelPoints[i].x - labelPoints[j].x)).toBeGreaterThan(200);
                }
            }
        }
    });

    it('puts the columns in order with clear gutters between them', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);

        const rightEdgeOf = (nodeId: string) => {
            const { box } = layout.nodes.get(nodeId)!;
            return box.x + box.width;
        };
        const leftEdgeOf = (nodeId: string) => layout.nodes.get(nodeId)!.box.x;

        expect(rightEdgeOf('admin')).toBeLessThan(leftEdgeOf('p-1'));
        expect(rightEdgeOf('p-1')).toBeLessThan(leftEdgeOf('d-1'));

        // Every entity shares a left edge, and so does every store.
        expect(leftEdgeOf('admin')).toBe(leftEdgeOf('ngo'));
        expect(leftEdgeOf('d-1')).toBe(leftEdgeOf('d-6'));
    });

    it('stacks a column without overlapping its shapes', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);

        const column = nodes
            .filter((node) => node.type === 'process')
            .map((node) => layout.nodes.get(node.id)!.box)
            .sort((a, b) => a.y - b.y);

        for (let index = 0; index < column.length - 1; index++) {
            expect(column[index].y + column[index].height).toBeLessThan(column[index + 1].y);
        }
    });

    it('grows a shape so its flows fit down the side', () => {
        const store = dataStore('d-1', 'D1');
        const busyProcess = process('p-1', '1.0');
        const edges = Array.from({ length: 8 }, (_, index) =>
            flow(`f-${index}`, busyProcess.id, store.id)
        );

        const layout = planDecomposedLevelLayout([busyProcess, store], edges);
        const storeBox = layout.nodes.get('d-1')!.box;

        // Eight handles at a 40px pitch, plus the padding at each end.
        expect(storeBox.height).toBeGreaterThanOrEqual(7 * 40);
        expect(layout.processDiameter).toBeGreaterThan(200);
    });

    it('leaves a flow unrouted when no gutter can carry it, but still places its handles', () => {
        // An entity wired straight to a store would have to cross the process
        // column, which has no lane for it. It keeps its handles so the canvas
        // draws it directly rather than dropping it without a word.
        const nodes = [entity('e-1'), dataStore('d-1', 'D1')];
        const edges = [flow('f-1', 'e-1', 'd-1')];

        const layout = planDecomposedLevelLayout(nodes, edges);

        expect(layout.flows.has('f-1')).toBe(false);
        expect(layout.nodes.get('e-1')!.handles).toHaveLength(1);
        expect(layout.nodes.get('d-1')!.handles).toHaveLength(1);
    });

    it('sits an entity level with the process it talks to', () => {
        // The entity only deals with the last of five processes, so it belongs
        // down beside that one rather than at the top of its column.
        const processes = Array.from({ length: 5 }, (_, index) =>
            process(`p-${index + 1}`, `${index + 1}.0`)
        );
        const participant = entity('lonely');
        const edges = interaction('pair', 'lonely', 'p-5');

        const layout = planDecomposedLevelLayout([participant, ...processes], edges);

        const entityBox = layout.nodes.get('lonely')!.box;
        const processBox = layout.nodes.get('p-5')!.box;

        expect(entityBox.y + entityBox.height / 2).toBeCloseTo(
            processBox.y + processBox.height / 2,
            -1.5
        );
    });

    it('orders the flows of a shape by the height of the shape at the far end', () => {
        // Written bottom process first, so the ordering cannot come from the
        // order the flows were declared in.
        const processes = [process('p-1', '1.0'), process('p-2', '2.0'), process('p-3', '3.0')];
        const participant = entity('customer');
        const edges = [
            flow('to-third', 'customer', 'p-3'),
            flow('to-first', 'customer', 'p-1'),
            flow('to-second', 'customer', 'p-2'),
        ];

        const layout = planDecomposedLevelLayout([participant, ...processes], edges);
        const handles = layout.nodes.get('customer')!.handles;

        const heightOf = (edgeId: string) =>
            handles.find((handle) => handle.edgeId === edgeId)!.y;

        expect(heightOf('to-first')).toBeLessThan(heightOf('to-second'));
        expect(heightOf('to-second')).toBeLessThan(heightOf('to-third'));
    });

    it('keeps the flows short enough that few of them cross', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);

        // Crossings are horizontal-meets-vertical only, so counting them is a
        // fair measure of how hard a diagram is to follow. Stacking each column
        // from the top, as this used to, gives 266 on this fixture against 132
        // for levelling each column against its neighbours; the shipped Level 1
        // example goes from 3320 to 978. The bound sits between the two, so a
        // return to the old behaviour fails while there is room to tune.
        let crossings = 0;
        const routes = [...layout.flows.values()];
        for (const a of routes) {
            for (const b of routes) {
                if (a === b) continue;
                const vertical = { x: b.points[1].x, lo: Math.min(b.points[1].y, b.points[2].y), hi: Math.max(b.points[1].y, b.points[2].y) };
                for (const run of [[a.points[0], a.points[1]], [a.points[2], a.points[3]]]) {
                    const [from, to] = run;
                    const [low, high] = [Math.min(from.x, to.x), Math.max(from.x, to.x)];
                    if (
                        vertical.x > low + TOLERANCE_PX &&
                        vertical.x < high - TOLERANCE_PX &&
                        from.y > vertical.lo + TOLERANCE_PX &&
                        from.y < vertical.hi - TOLERANCE_PX
                    ) {
                        crossings++;
                    }
                }
            }
        }

        expect(crossings).toBeLessThan(edges.length * 4);
    });

    it('handles a level with nothing on it', () => {
        const layout = planDecomposedLevelLayout([], []);

        expect(layout.nodes.size).toBe(0);
        expect(layout.flows.size).toBe(0);
    });
});
