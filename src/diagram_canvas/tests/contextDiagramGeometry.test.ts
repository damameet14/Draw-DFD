import { describe, it, expect } from 'vitest';
import {
    calculateEntityRingDistance,
    calculateRequiredEntitySize,
    computeContextDiagramLayout,
    CONTEXT_PROCESS_CENTER,
    ENTITY_EDGE_USABLE_FRACTION,
    ENTITY_HANDLE_SPACING_PX,
    HANDLE_SPACING_PX,
    MAX_PROCESS_DIAMETER,
    MIN_ENTITY_SIZE,
    MIN_PROCESS_DIAMETER,
    planContextDiagramLayout,
    quadrantForEntityIndex,
    type EntityFlowCounts,
} from '../contextDiagramGeometry';

/** Same number of flows in each direction, which is what a flow pair produces. */
function pairs(count: number): EntityFlowCounts {
    return { inFlowCount: count, outFlowCount: count };
}

/** Arc length per handle actually available in a range, at a given diameter. */
function handleSpacingInRange(
    diameter: number,
    range: { start: number; end: number },
    handleCount: number
): number {
    if (handleCount === 0) return Infinity;
    const radius = diameter / 2;
    const arcLength = radius * ((range.end - range.start) * (Math.PI / 180));
    return arcLength / handleCount;
}

describe('quadrantForEntityIndex', () => {
    it('deals entities round-robin into the four quadrants', () => {
        expect([0, 1, 2, 3, 4].map(quadrantForEntityIndex)).toEqual([
            'top', 'right', 'bottom', 'left', 'top',
        ]);
    });
});

describe('computeContextDiagramLayout — section allocation', () => {
    it('gives every entity a section inside its own quadrant', () => {
        const { entityLayouts } = computeContextDiagramLayout([pairs(2), pairs(2), pairs(2), pairs(2)]);

        const quadrantBounds = { top: [270, 360], right: [0, 90], bottom: [90, 180], left: [180, 270] };
        entityLayouts.forEach((layout) => {
            const [lower, upper] = quadrantBounds[layout.quadrant];
            expect(layout.processSection.start).toBeGreaterThanOrEqual(lower - 0.001);
            expect(layout.processSection.end).toBeLessThanOrEqual(upper + 0.001);
        });
    });

    it('splits a quadrant in proportion to flow counts, not equally', () => {
        // Two entities share the top quadrant; one has three times the flows.
        const { entityLayouts } = computeContextDiagramLayout([
            pairs(9), pairs(1), pairs(1), pairs(1), pairs(3),
        ]);

        const busy = entityLayouts[0];
        const quiet = entityLayouts[4];
        const busySpan = busy.processSection.end - busy.processSection.start;
        const quietSpan = quiet.processSection.end - quiet.processSection.start;

        expect(busySpan / quietSpan).toBeCloseTo(3, 1);
        expect(busySpan + quietSpan).toBeCloseTo(90, 5);
    });

    it('splits an entity\'s section between directions in proportion to their counts', () => {
        const { entityLayouts } = computeContextDiagramLayout([
            { inFlowCount: 9, outFlowCount: 3 },
        ]);

        const [layout] = entityLayouts;
        const inSpan = layout.inFlowRange.end - layout.inFlowRange.start;
        const outSpan = layout.outFlowRange.end - layout.outFlowRange.start;

        expect(inSpan / outSpan).toBeCloseTo(3, 1);
    });

    it('leaves no gap between the two direction ranges', () => {
        const { entityLayouts } = computeContextDiagramLayout([pairs(4), pairs(4)]);

        entityLayouts.forEach((layout) => {
            const ranges = [layout.inFlowRange, layout.outFlowRange].sort((a, b) => a.start - b.start);
            expect(ranges[0].end).toBeCloseTo(ranges[1].start, 6);
            expect(ranges[0].start).toBeCloseTo(layout.processSection.start, 6);
            expect(ranges[1].end).toBeCloseTo(layout.processSection.end, 6);
        });
    });

    it('puts outgoing flows at the lower angles on top and left, incoming on right and bottom', () => {
        const { entityLayouts } = computeContextDiagramLayout([pairs(2), pairs(2), pairs(2), pairs(2)]);

        const [top, right, bottom, left] = entityLayouts;
        expect(top.outFlowRange.start).toBeLessThan(top.inFlowRange.start);
        expect(left.outFlowRange.start).toBeLessThan(left.inFlowRange.start);
        expect(right.inFlowRange.start).toBeLessThan(right.outFlowRange.start);
        expect(bottom.inFlowRange.start).toBeLessThan(bottom.outFlowRange.start);
    });

    it('still gives a flowless entity a section to sit in', () => {
        const { entityLayouts } = computeContextDiagramLayout([pairs(0), pairs(5)]);

        const span = entityLayouts[0].processSection.end - entityLayouts[0].processSection.start;
        expect(span).toBeGreaterThan(0);
    });

    it('assigns the entity handle sides from the quadrant', () => {
        const { entityLayouts } = computeContextDiagramLayout([pairs(1), pairs(1), pairs(1), pairs(1)]);

        expect(entityLayouts.map(l => [l.entityInSide, l.entityOutSide])).toEqual([
            ['right', 'bottom'],
            ['left', 'bottom'],
            ['top', 'left'],
            ['top', 'right'],
        ]);
    });
});

describe('computeContextDiagramLayout — required diameter', () => {
    it('never returns less than the minimum', () => {
        expect(computeContextDiagramLayout([]).requiredProcessDiameter).toBe(MIN_PROCESS_DIAMETER);
        expect(computeContextDiagramLayout([pairs(1)]).requiredProcessDiameter).toBe(MIN_PROCESS_DIAMETER);
    });

    it('leaves at least the target spacing between handles in every section', () => {
        const counts = [pairs(6), pairs(8), pairs(9), pairs(4), pairs(6)];
        const { entityLayouts, requiredProcessDiameter } = computeContextDiagramLayout(counts);

        entityLayouts.forEach((layout, index) => {
            expect(
                handleSpacingInRange(requiredProcessDiameter, layout.inFlowRange, counts[index].inFlowCount)
            ).toBeGreaterThanOrEqual(HANDLE_SPACING_PX - 0.01);
            expect(
                handleSpacingInRange(requiredProcessDiameter, layout.outFlowRange, counts[index].outFlowCount)
            ).toBeGreaterThanOrEqual(HANDLE_SPACING_PX - 0.01);
        });
    });

    it('is driven by the busiest quadrant, not by an unlucky entity placement', () => {
        // Same five entities, reordered so the two heaviest share a quadrant in
        // one arrangement and are spread apart in the other. The old per-quadrant
        // equal split made the diameter swing wildly with this ordering.
        const spread = computeContextDiagramLayout([pairs(9), pairs(8), pairs(6), pairs(6), pairs(4)]);
        const clustered = computeContextDiagramLayout([pairs(9), pairs(6), pairs(6), pairs(4), pairs(8)]);

        // Clustering 9 and 8 into one quadrant costs some radius, but nothing like
        // the 1.6x the equal split produced.
        const ratio = clustered.requiredProcessDiameter / spread.requiredProcessDiameter;
        expect(ratio).toBeLessThan(1.35);
    });

    it('keeps a heavy diagram far below the size the equal split produced', () => {
        // The diagram from the reported issue: 66 flows over five entities, which
        // the equal-split allocation inflated to a 917px circle.
        const { requiredProcessDiameter } = computeContextDiagramLayout([
            pairs(6), pairs(8), pairs(9), pairs(4), pairs(6),
        ]);

        expect(requiredProcessDiameter).toBeLessThan(600);
    });

    it('clamps a pathological diagram to the maximum diameter', () => {
        const { requiredProcessDiameter } = computeContextDiagramLayout([pairs(200), pairs(200)]);
        expect(requiredProcessDiameter).toBe(MAX_PROCESS_DIAMETER);
    });
});

describe('calculateRequiredEntitySize', () => {
    it('never goes below the minimum', () => {
        expect(calculateRequiredEntitySize(pairs(0))).toBe(MIN_ENTITY_SIZE);
        expect(calculateRequiredEntitySize(pairs(1))).toBe(MIN_ENTITY_SIZE);
    });

    it('grows with the busier of the two sides', () => {
        const lopsided = calculateRequiredEntitySize({ inFlowCount: 10, outFlowCount: 1 });
        const balanced = calculateRequiredEntitySize({ inFlowCount: 10, outFlowCount: 10 });
        expect(lopsided).toBe(balanced);
    });

    it('keeps the default box size for up to eight flows a side', () => {
        // Flows sitting close to a box's corners is acceptable; growing the box
        // pushes the whole ring outwards and shrinks everything in the export.
        expect(calculateRequiredEntitySize(pairs(8))).toBe(MIN_ENTITY_SIZE);
    });

    it('grows only gradually past that, far less than the old rule did', () => {
        // The previous rule (18px spacing plus 20px padding) wanted 182px here.
        expect(calculateRequiredEntitySize(pairs(9))).toBeLessThan(140);
        expect(calculateRequiredEntitySize(pairs(12))).toBeLessThan(180);
    });

    it('does grow once the handles genuinely would not fit', () => {
        const size = calculateRequiredEntitySize(pairs(20));
        const usableEdge = size * ENTITY_EDGE_USABLE_FRACTION;
        expect(usableEdge / 20).toBeGreaterThanOrEqual(ENTITY_HANDLE_SPACING_PX - 0.01);
    });

    it('grows to fit a large text size', () => {
        expect(calculateRequiredEntitySize(pairs(1), 500)).toBeGreaterThan(500);
        expect(calculateRequiredEntitySize(pairs(1), 14)).toBe(MIN_ENTITY_SIZE);
    });
});

describe('calculateEntityRingDistance', () => {
    it('keeps an entity box clear of the circle', () => {
        const processDiameter = 550;
        const entitySize = 182;
        const distance = calculateEntityRingDistance(processDiameter, entitySize);

        // Nearest corner of the box must sit outside the circle's edge.
        const nearestCorner = distance - (entitySize * Math.SQRT2) / 2;
        expect(nearestCorner).toBeGreaterThan(processDiameter / 2);
    });

    it('grows as the circle grows, so entities are never swallowed', () => {
        const small = calculateEntityRingDistance(MIN_PROCESS_DIAMETER, MIN_ENTITY_SIZE);
        const large = calculateEntityRingDistance(MAX_PROCESS_DIAMETER, MIN_ENTITY_SIZE);
        expect(large - small).toBeCloseTo((MAX_PROCESS_DIAMETER - MIN_PROCESS_DIAMETER) / 2, 0);
    });
});

describe('planContextDiagramLayout', () => {
    it('centres each entity on the arc its flows attach to', () => {
        const counts = [pairs(3), pairs(3), pairs(3), pairs(3)];
        const { entities, processDiameter } = planContextDiagramLayout(counts);
        const { entityLayouts } = computeContextDiagramLayout(counts);

        entities.forEach((placement, index) => {
            const layout = entityLayouts[index];
            const sectionCenter = (layout.processSection.start + layout.processSection.end) / 2;
            const expectedAngle = (sectionCenter - 90) * (Math.PI / 180);

            const centerX = placement.position.x + placement.size / 2;
            const centerY = placement.position.y + placement.size / 2;
            const actualAngle = Math.atan2(
                centerY - CONTEXT_PROCESS_CENTER.y,
                centerX - CONTEXT_PROCESS_CENTER.x
            );

            expect(Math.cos(actualAngle)).toBeCloseTo(Math.cos(expectedAngle), 1);
            expect(Math.sin(actualAngle)).toBeCloseTo(Math.sin(expectedAngle), 1);
        });

        expect(processDiameter).toBeGreaterThanOrEqual(MIN_PROCESS_DIAMETER);
    });

    it('reports a process position that centres the circle on the ring centre', () => {
        const { processPosition, processDiameter, processCenter } = planContextDiagramLayout([pairs(6)]);

        // React Flow positions a node by its top-left corner, so the centre has to
        // be half a diameter in from it. Treating the two as the same thing put
        // entities inside the circle once it grew past the default size.
        //
        // Positions are whole pixels, so an odd diameter cannot be centred exactly;
        // half a pixel is the tightest this can be.
        expect(Math.abs(processPosition.x + processDiameter / 2 - processCenter.x)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(processPosition.y + processDiameter / 2 - processCenter.y)).toBeLessThanOrEqual(0.5);
    });

    it('places every entity outside the circle', () => {
        const { entities, processDiameter, processCenter } = planContextDiagramLayout([
            pairs(6), pairs(8), pairs(9), pairs(4), pairs(6),
        ]);

        entities.forEach((placement) => {
            const centerX = placement.position.x + placement.size / 2;
            const centerY = placement.position.y + placement.size / 2;
            const distance = Math.hypot(centerX - processCenter.x, centerY - processCenter.y);
            const nearestCorner = distance - (placement.size * Math.SQRT2) / 2;

            expect(nearestCorner).toBeGreaterThan(processDiameter / 2);
        });
    });

    it('rings the circle wherever it actually sits', () => {
        const movedCenter = { x: 2000, y: 1200 };
        const { entities, processPosition, processDiameter } = planContextDiagramLayout(
            [pairs(3), pairs(3), pairs(3), pairs(3)],
            { processCenter: movedCenter }
        );

        expect(processPosition.x + processDiameter / 2).toBeCloseTo(movedCenter.x, 0);

        entities.forEach((placement) => {
            const centerX = placement.position.x + placement.size / 2;
            const centerY = placement.position.y + placement.size / 2;
            const distance = Math.hypot(centerX - movedCenter.x, centerY - movedCenter.y);
            expect(distance - (placement.size * Math.SQRT2) / 2).toBeGreaterThan(processDiameter / 2);
        });
    });

    it('does not overlap neighbouring entity boxes', () => {
        const { entities } = planContextDiagramLayout([pairs(4), pairs(4), pairs(4), pairs(4)]);

        for (let i = 0; i < entities.length; i += 1) {
            for (let j = i + 1; j < entities.length; j += 1) {
                const a = entities[i];
                const b = entities[j];
                const overlapsHorizontally =
                    a.position.x < b.position.x + b.size && b.position.x < a.position.x + a.size;
                const overlapsVertically =
                    a.position.y < b.position.y + b.size && b.position.y < a.position.y + a.size;

                expect(overlapsHorizontally && overlapsVertically).toBe(false);
            }
        }
    });

    it('returns one placement per entity and handles an empty diagram', () => {
        expect(planContextDiagramLayout([]).entities).toEqual([]);
        expect(planContextDiagramLayout([pairs(1), pairs(1)]).entities).toHaveLength(2);
    });
});
