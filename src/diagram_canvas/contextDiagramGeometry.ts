/**
 * Geometry of the context (Level 0) diagram: where each entity sits around the
 * process circle, which arc of the circle its flows attach to, and how big the
 * circle and the entity boxes have to be to hold them.
 *
 * Pure functions with no React and no store access, so the canvas renderers and
 * the CSV import can lay a diagram out the same way — the import needs to size
 * the circle before anything is rendered.
 *
 * ## Why sections are allocated by flow count
 *
 * Entities are dealt round-robin into four quadrants. Each quadrant owns 90°.
 * The original implementation split those 90° *equally* between the entities in
 * the quadrant and then split each entity's slice in half, one half per
 * direction. That made the available arc depend on an entity's position in the
 * ring rather than on how many flows it actually had, and the only way to fit a
 * crowded slice was to inflate the radius until the arc was long enough.
 *
 * The effect was severe. For a five-entity diagram with 66 flows, two entities
 * with 12 flows each landed in the same quadrant and got 22.5° per direction,
 * which forced a 917px circle — while a 18-flow entity alone in its quadrant sat
 * in an under-used 45°. Allocating each entity a share of its quadrant in
 * proportion to its flow count, and splitting that share between the two
 * directions in proportion to theirs, makes the required radius depend on the
 * busiest *quadrant* instead of the unluckiest *entity*, and leaves no cramped
 * sections behind.
 */

export type Quadrant = 'top' | 'right' | 'bottom' | 'left';

/** 0° is at 12 o'clock and angles increase clockwise. */
const QUADRANT_START_ANGLES: Record<Quadrant, number> = {
    top: 270,
    right: 0,
    bottom: 90,
    left: 180,
};

export const QUADRANT_ORDER: Quadrant[] = ['top', 'right', 'bottom', 'left'];

const DEGREES_PER_QUADRANT = 90;

/**
 * Arc length reserved for each handle on the circle, and the matching spacing
 * along an entity's edge.
 *
 * A handle renders 10px across with a 2px border, so 18px leaves them clearly
 * separated. The previous 25px (plus a further 5px of padding in the capacity
 * check) bought no visible clarity and cost proportionally more radius.
 */
export const HANDLE_SPACING_PX = 18;

/**
 * Spacing between handles along an entity box's edge.
 *
 * Deliberately tighter than the spacing on the circle. Flows sitting close
 * together near a box's corners is acceptable, whereas growing the box to spread
 * them out pushes the whole ring outwards and shrinks everything in the export.
 *
 * A default 120px box holds eight flows a side at this spacing, and grows
 * gradually beyond that — nine flows needs 129px, where the previous rule
 * demanded 182px.
 */
export const ENTITY_HANDLE_SPACING_PX = 12;

/** Fraction of a box's edge available to handles, leaving the corners clear. */
export const ENTITY_EDGE_USABLE_FRACTION = 0.84;

export const DEFAULT_ENTITY_TEXT_SIZE_PX = 14;
export const DEFAULT_FLOW_LABEL_TEXT_SIZE_PX = 12;

/** Text may be set far larger than the default for big diagrams and printing. */
export const MIN_TEXT_SIZE_PX = 6;
export const MAX_TEXT_SIZE_PX = 500;

export const MIN_PROCESS_DIAMETER = 200;

/**
 * Ceiling on the auto-grown circle. Past this point a diagram is better fixed by
 * decomposing it than by growing the circle, and an unbounded diameter risks
 * exceeding what the export canvas can raster.
 */
export const MAX_PROCESS_DIAMETER = 900;

export const MIN_ENTITY_SIZE = 120;

/** Clear space between the circle's edge and the nearest corner of an entity box. */
const ENTITY_RING_MARGIN_PX = 60;

export interface EntityFlowCounts {
    /** Flows from the entity into the process. */
    inFlowCount: number;
    /** Flows from the process back to the entity. */
    outFlowCount: number;
}

export interface AngleRange {
    start: number;
    end: number;
}

export interface EntityLayoutInfo {
    quadrant: Quadrant;
    /** The whole arc of the circle allotted to this entity. */
    processSection: AngleRange;
    /** Arc carrying this entity's flows into the process. */
    inFlowRange: AngleRange;
    /** Arc carrying the process's flows back to this entity. */
    outFlowRange: AngleRange;
    entityInSide: Quadrant;
    entityOutSide: Quadrant;
}

export interface ContextDiagramLayout {
    /** One entry per entity, in the order the entities were given. */
    entityLayouts: EntityLayoutInfo[];
    /** Diameter the circle needs so no section is crowded, already clamped. */
    requiredProcessDiameter: number;
}

/**
 * Which side of an entity box each direction attaches to, fixed per quadrant so
 * flows leave the box facing the process.
 */
export const ENTITY_SIDES_BY_QUADRANT: Record<Quadrant, { inSide: Quadrant; outSide: Quadrant }> = {
    top: { inSide: 'right', outSide: 'bottom' },
    right: { inSide: 'left', outSide: 'bottom' },
    bottom: { inSide: 'top', outSide: 'left' },
    left: { inSide: 'top', outSide: 'right' },
};

export function quadrantForEntityIndex(entityIndex: number): Quadrant {
    return QUADRANT_ORDER[entityIndex % 4];
}

function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Diameter at which `handleCount` handles fit across `spanDegrees` of arc with
 * `HANDLE_SPACING_PX` between them.
 */
function diameterNeededForArc(handleCount: number, spanDegrees: number): number {
    if (handleCount <= 1 || spanDegrees <= 0) return 0;
    const requiredArcLength = handleCount * HANDLE_SPACING_PX;
    return (requiredArcLength / toRadians(spanDegrees)) * 2;
}

/**
 * Splits one entity's arc between its two directions in proportion to how many
 * flows each carries, keeping the ordering the nested-rectangle routing expects:
 * for top and left the outgoing flows take the lower angles, for right and
 * bottom the incoming ones do.
 */
function splitSectionByDirection(
    section: AngleRange,
    quadrant: Quadrant,
    counts: EntityFlowCounts
): { inFlowRange: AngleRange; outFlowRange: AngleRange } {
    const { inFlowCount, outFlowCount } = counts;
    const totalFlows = inFlowCount + outFlowCount;
    const sectionSpan = section.end - section.start;

    // With flows in only one direction the whole section goes to it; with none at
    // all the halves are arbitrary, so fall back to an even split.
    const inFlowShare = totalFlows === 0 ? 0.5 : inFlowCount / totalFlows;

    const lowerAngleShare = quadrant === 'top' || quadrant === 'left'
        ? 1 - inFlowShare // outgoing first
        : inFlowShare;    // incoming first

    const boundary = section.start + sectionSpan * lowerAngleShare;

    const lowerRange: AngleRange = { start: section.start, end: boundary };
    const upperRange: AngleRange = { start: boundary, end: section.end };

    return quadrant === 'top' || quadrant === 'left'
        ? { outFlowRange: lowerRange, inFlowRange: upperRange }
        : { inFlowRange: lowerRange, outFlowRange: upperRange };
}

/**
 * Lays out every entity around the circle and reports the diameter the result
 * needs.
 *
 * `entityFlowCounts` must be in the same order the entities are drawn in, since
 * an entity's index is what decides its quadrant.
 */
export function computeContextDiagramLayout(
    entityFlowCounts: EntityFlowCounts[]
): ContextDiagramLayout {
    const entityLayouts = new Array<EntityLayoutInfo>(entityFlowCounts.length);
    let requiredProcessDiameter = MIN_PROCESS_DIAMETER;

    QUADRANT_ORDER.forEach((quadrant, quadrantIndex) => {
        const entityIndices = entityFlowCounts
            .map((_, index) => index)
            .filter((index) => index % 4 === quadrantIndex);

        if (entityIndices.length === 0) return;

        // An entity with no flows yet still needs somewhere to sit, so it counts
        // as one unit rather than collapsing to a zero-width section.
        const weights = entityIndices.map((index) => {
            const { inFlowCount, outFlowCount } = entityFlowCounts[index];
            return Math.max(1, inFlowCount + outFlowCount);
        });
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

        const quadrantStart = QUADRANT_START_ANGLES[quadrant];

        // Top and bottom fill from the end of their quadrant so the ring reads
        // outward from 12 and 6 o'clock; right and left fill from the start.
        const fillsFromEnd = quadrant === 'top' || quadrant === 'bottom';
        let cursor = fillsFromEnd ? quadrantStart + DEGREES_PER_QUADRANT : quadrantStart;

        entityIndices.forEach((entityIndex, positionInQuadrant) => {
            const span = (DEGREES_PER_QUADRANT * weights[positionInQuadrant]) / totalWeight;

            const processSection: AngleRange = fillsFromEnd
                ? { start: cursor - span, end: cursor }
                : { start: cursor, end: cursor + span };

            cursor = fillsFromEnd ? processSection.start : processSection.end;

            const counts = entityFlowCounts[entityIndex];
            const { inFlowRange, outFlowRange } = splitSectionByDirection(
                processSection,
                quadrant,
                counts
            );

            entityLayouts[entityIndex] = {
                quadrant,
                processSection,
                inFlowRange,
                outFlowRange,
                entityInSide: ENTITY_SIDES_BY_QUADRANT[quadrant].inSide,
                entityOutSide: ENTITY_SIDES_BY_QUADRANT[quadrant].outSide,
            };

            requiredProcessDiameter = Math.max(
                requiredProcessDiameter,
                diameterNeededForArc(counts.inFlowCount, inFlowRange.end - inFlowRange.start),
                diameterNeededForArc(counts.outFlowCount, outFlowRange.end - outFlowRange.start)
            );
        });
    });

    return {
        entityLayouts,
        requiredProcessDiameter: Math.min(
            Math.round(requiredProcessDiameter),
            MAX_PROCESS_DIAMETER
        ),
    };
}

/**
 * Smallest an entity box can be and still hold its handles and its name.
 *
 * The box is square and each direction attaches to one side, so the binding
 * constraint is whichever direction has more flows. Handles are allowed right out
 * towards the corners, so a box only grows once they would genuinely overlap.
 *
 * A large text size also forces the box up, since the name is drawn inside it.
 */
export function calculateRequiredEntitySize(
    counts: EntityFlowCounts,
    labelTextSizePx: number = DEFAULT_ENTITY_TEXT_SIZE_PX
): number {
    const busiestSide = Math.max(counts.inFlowCount, counts.outFlowCount);
    const sizeForHandles = (busiestSide * ENTITY_HANDLE_SPACING_PX) / ENTITY_EDGE_USABLE_FRACTION;

    // Roughly two lines of text plus breathing room.
    const sizeForLabel = labelTextSizePx * 2.4;

    return Math.ceil(Math.max(MIN_ENTITY_SIZE, sizeForHandles, sizeForLabel));
}

/**
 * Distance from the process centre to an entity's centre.
 *
 * Derived from the circle and the boxes rather than fixed, because the circle
 * grows with the flow count: at a constant distance a grown circle would swallow
 * the entities that ring it.
 */
export function calculateEntityRingDistance(
    processDiameter: number,
    largestEntitySize: number
): number {
    // Half the box's diagonal, so a corner clears the circle rather than just
    // the midpoint of an edge.
    const entityCornerReach = (largestEntitySize * Math.SQRT2) / 2;
    return Math.round(processDiameter / 2 + entityCornerReach + ENTITY_RING_MARGIN_PX);
}

export interface CanvasPosition {
    x: number;
    y: number;
}

/**
 * Centre of the context process on the canvas.
 *
 * This is the circle's centre, not the node's `position`: React Flow positions a
 * node by its top-left corner, so the two differ by half the diameter. Conflating
 * them put the entity ring half a diameter off centre, which was harmless at the
 * old 200px default and pushed entities inside the circle once it grew.
 * `calculateProcessNodePosition` converts between the two.
 */
export const CONTEXT_PROCESS_CENTER: CanvasPosition = { x: 450, y: 350 };

/** Top-left `position` that centres a circle of `diameter` on the process centre. */
export function calculateProcessNodePosition(diameter: number): CanvasPosition {
    return {
        x: Math.round(CONTEXT_PROCESS_CENTER.x - diameter / 2),
        y: Math.round(CONTEXT_PROCESS_CENTER.y - diameter / 2),
    };
}

export interface ContextEntityPlacement {
    /** Top-left corner, which is what a node's `position` holds. */
    position: CanvasPosition;
    /** Square box size that fits this entity's handles. */
    size: number;
}

export interface ContextDiagramPlacement {
    processDiameter: number;
    /** Top-left corner for the process node, ready to store as its `position`. */
    processPosition: CanvasPosition;
    /** The circle's centre, which the entity ring is built around. */
    processCenter: CanvasPosition;
    /** One entry per entity, in the order given. */
    entities: ContextEntityPlacement[];
}

export interface PlanContextLayoutOptions {
    /**
     * Centre to build the ring around. Defaults to `CONTEXT_PROCESS_CENTER`.
     *
     * Adding a single entity to a diagram whose process has already been dragged
     * somewhere passes that circle's real centre, so the new box lands on the
     * ring that is actually on screen.
     */
    processCenter?: CanvasPosition;

    /** Entity name font size, which sets a floor on how small a box can be. */
    entityTextSizePx?: number;
}

/**
 * Plans a whole context diagram: how big the circle is, how big each entity box
 * is, and where each box goes.
 *
 * Each entity is centred on the arc it owns, so a box lines up with the flows
 * that attach to it. Every box sits on one ring, sized from the largest box, so
 * the diagram stays symmetrical rather than having boxes at varying distances.
 *
 * The CSV import calls this to lay a diagram out in one pass, before anything is
 * rendered and before the auto-sizing effects could run.
 */
export function planContextDiagramLayout(
    entityFlowCounts: EntityFlowCounts[],
    options: PlanContextLayoutOptions = {}
): ContextDiagramPlacement {
    const { entityLayouts, requiredProcessDiameter } = computeContextDiagramLayout(entityFlowCounts);
    const processCenter = options.processCenter ?? CONTEXT_PROCESS_CENTER;

    const sizes = entityFlowCounts.map((counts) =>
        calculateRequiredEntitySize(counts, options.entityTextSizePx)
    );
    const largestSize = sizes.length > 0 ? Math.max(...sizes) : MIN_ENTITY_SIZE;
    const ringDistance = calculateEntityRingDistance(requiredProcessDiameter, largestSize);

    const entities = entityLayouts.map((layout, index) => {
        const sectionCenter = (layout.processSection.start + layout.processSection.end) / 2;
        // 0° is at 12 o'clock, so shift by a quarter turn for screen coordinates.
        const angleRadians = toRadians(sectionCenter - 90);
        const size = sizes[index];

        return {
            size,
            // Offset by half the box so the ring positions the box's centre.
            position: {
                x: Math.round(processCenter.x + ringDistance * Math.cos(angleRadians) - size / 2),
                y: Math.round(processCenter.y + ringDistance * Math.sin(angleRadians) - size / 2),
            },
        };
    });

    return {
        processDiameter: requiredProcessDiameter,
        processPosition: {
            x: Math.round(processCenter.x - requiredProcessDiameter / 2),
            y: Math.round(processCenter.y - requiredProcessDiameter / 2),
        },
        processCenter,
        entities,
    };
}
