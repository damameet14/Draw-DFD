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

    it('puts every label on its own flow, clear of the shape it leaves', () => {
        const { nodes, edges } = buildBusyLevel();
        const layout = planDecomposedLevelLayout(nodes, edges);

        edges.forEach((edge) => {
            const route = layout.flows.get(edge.id)!;
            const [start, corner] = route.points;
            const sourceBox = layout.nodes.get(edge.sourceNodeId)!.box;

            // On the first segment, which runs out of the source shape.
            expect(route.labelPoint.y).toBeCloseTo(start.y, 5);
            expect(
                Math.min(start.x, corner.x) - TOLERANCE_PX <= route.labelPoint.x &&
                route.labelPoint.x <= Math.max(start.x, corner.x) + TOLERANCE_PX
            ).toBe(true);

            // And far enough out that a label of normal length cannot reach
            // back over that shape.
            const distanceFromShape = Math.min(
                Math.abs(route.labelPoint.x - sourceBox.x),
                Math.abs(route.labelPoint.x - (sourceBox.x + sourceBox.width))
            );
            expect(distanceFromShape).toBeGreaterThanOrEqual(100);
        });
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

    it('handles a level with nothing on it', () => {
        const layout = planDecomposedLevelLayout([], []);

        expect(layout.nodes.size).toBe(0);
        expect(layout.flows.size).toBe(0);
    });
});
