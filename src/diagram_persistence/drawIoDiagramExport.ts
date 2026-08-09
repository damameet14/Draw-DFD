import { type DFDEdge, type DFDLevel, type DFDNode } from '../data_flow_diagram_model/public_interface';

/**
 * Writes a diagram out as a draw.io (`.drawio`) file.
 *
 * Unlike the PNG export this is a handover format: the result opens in draw.io
 * and every box, circle, store and flow is a real editable shape. The
 * `.dfd.json` file stays the round-trip format — nothing reads a `.drawio` file
 * back in.
 *
 * ## Why the caller supplies the geometry
 *
 * This module is given shapes and flow routes that have already been measured,
 * rather than working them out from the diagram itself. Where a flow attaches is
 * decided by the canvas: an angle around the process circle, a percentage along
 * a box edge, then a collision pass that nudges neighbours apart. A first
 * attempt left the endpoints off and let draw.io connect the shapes itself,
 * which looked reasonable in the abstract and was useless in practice — draw.io
 * picks one point per side, so the dozen flows between an entity and the process
 * collapsed onto a single line with their labels stacked on top of each other.
 *
 * Taking the routes from the canvas means the file reproduces the flow paths the
 * editor actually drew, and there is no second implementation of the handle
 * geometry to drift out of step with the renderers.
 *
 * The XML is written uncompressed. draw.io accepts both, and uncompressed files
 * can be diffed and inspected, which is worth more than the few bytes saved.
 */

const STROKE_COLOR = '#1e293b';
const FILL_COLOR = '#ffffff';
const FONT_FAMILY = 'Helvetica';

/** Border widths, matching what the canvas draws. */
const SHAPE_STROKE_WIDTH = 3;
const DATA_STORE_STROKE_WIDTH = 2;
const FLOW_STROKE_WIDTH = 2;

const DEFAULT_PROCESS_TEXT_SIZE_PX = 16;
const DEFAULT_PROCESS_DIVIDER_PERCENT = 15;

/**
 * Text sizes for a node or flow that carries none of its own. Stated here rather
 * than imported from `diagram_canvas`, which is what supplies the geometry: this
 * module must not depend on the canvas, or the two would import each other.
 */
const DEFAULT_ENTITY_TEXT_SIZE_PX = 14;
const DEFAULT_FLOW_LABEL_TEXT_SIZE_PX = 12;

/** Width of the store's code compartment on the context level. */
const DATA_STORE_CODE_COLUMN_PX = 32;

const PAGE_TITLES: Record<DFDLevel, string> = {
    0: 'Level 0 — Context Diagram',
    1: 'Level 1',
    2: 'Level 2',
};

export interface CanvasPoint {
    x: number;
    y: number;
}

/** A node together with the box the canvas measured for it. */
export interface DrawIoShapePlacement {
    node: DFDNode;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DrawIoFlowRoute {
    edge: DFDEdge;
    /**
     * The flow's path in canvas coordinates: the first point sits on the source
     * shape, the last on the target, and any points between are the corners.
     */
    points: CanvasPoint[];
    /** Where the label sits, in canvas coordinates. Expected to be on the path. */
    labelPoint?: CanvasPoint;
}

export interface DrawIoPage {
    level: DFDLevel;
    shapes: DrawIoShapePlacement[];
    flows: DrawIoFlowRoute[];
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function clamp(value: number, lowest: number, highest: number): number {
    return Math.min(highest, Math.max(lowest, value));
}

/** Rounded to two places: draw.io keeps the precision, and files stay readable. */
function toCoordinate(value: number): string {
    return String(Math.round(value * 100) / 100);
}

function vertexCell(
    id: string,
    value: string,
    style: string,
    geometry: { x: number; y: number; width: number; height: number },
    parentId: string
): string {
    return (
        `        <mxCell id="${escapeXml(id)}" value="${escapeXml(value)}" style="${style}" ` +
        `vertex="1" parent="${escapeXml(parentId)}">\n` +
        `          <mxGeometry x="${toCoordinate(geometry.x)}" y="${toCoordinate(geometry.y)}" ` +
        `width="${toCoordinate(geometry.width)}" height="${toCoordinate(geometry.height)}" as="geometry" />\n` +
        `        </mxCell>\n`
    );
}

function entityStyle(textSizePx: number): string {
    return (
        'rounded=0;whiteSpace=wrap;html=1;' +
        `fillColor=${FILL_COLOR};strokeColor=${STROKE_COLOR};strokeWidth=${SHAPE_STROKE_WIDTH};` +
        `fontFamily=${FONT_FAMILY};fontSize=${textSizePx};fontStyle=1;fontColor=${STROKE_COLOR};`
    );
}

/**
 * The circle, its dividing rule, the process number above it and the name below.
 *
 * draw.io has no shape that draws a divided circle, so the rule and the two
 * pieces of text are separate cells parented to the ellipse. They move with it
 * and can be edited individually, which is what someone opening the file wants.
 */
function renderProcessNode(
    cellId: string,
    node: DFDNode & { type: 'process' },
    placement: DrawIoShapePlacement
): string {
    const diameter = placement.width;
    const radius = diameter / 2;
    const textSizePx = node.textSize ?? DEFAULT_PROCESS_TEXT_SIZE_PX;

    // The header's `padding-top` is a percentage of the node's width, and the
    // number sits on top of a further 0.5rem of padding, so the rule lands below
    // both. Clamped so an extreme divider setting cannot push it off the circle.
    const dividerPercent = node.dividerPosition ?? DEFAULT_PROCESS_DIVIDER_PERCENT;
    const dividerOffsetY = clamp(
        diameter * (dividerPercent / 100) + textSizePx * 1.3 + 8,
        placement.height * 0.2,
        placement.height * 0.8
    );

    // Half the chord at that height, so the rule spans the circle rather than
    // its bounding box.
    const distanceFromCenter = Math.abs(dividerOffsetY - radius);
    const chordHalfWidth = Math.sqrt(
        Math.max(0, radius * radius - distanceFromCenter * distanceFromCenter)
    );

    const circleStyle =
        'ellipse;whiteSpace=wrap;html=1;' +
        `fillColor=${FILL_COLOR};strokeColor=${STROKE_COLOR};strokeWidth=${SHAPE_STROKE_WIDTH};` +
        `fontFamily=${FONT_FAMILY};fontSize=${textSizePx};fontColor=${STROKE_COLOR};`;

    const textStyle =
        'text;html=1;align=center;verticalAlign=middle;overflow=hidden;whiteSpace=wrap;' +
        `fontFamily=${FONT_FAMILY};fontSize=${textSizePx};fontStyle=1;fontColor=${STROKE_COLOR};`;

    // Line cells are drawn down the vertical middle of their box, so the box is
    // given a nominal height and centred on the divider.
    const ruleStyle = `line;strokeWidth=1;html=1;fillColor=none;strokeColor=${STROKE_COLOR};`;
    const RULE_CELL_HEIGHT = 10;

    return (
        vertexCell(cellId, '', circleStyle, placement, '1') +
        vertexCell(`${cellId}-number`, node.processNumber, textStyle, {
            x: 0,
            y: 0,
            width: diameter,
            height: dividerOffsetY,
        }, cellId) +
        vertexCell(`${cellId}-divider`, '', ruleStyle, {
            x: radius - chordHalfWidth,
            y: dividerOffsetY - RULE_CELL_HEIGHT / 2,
            width: chordHalfWidth * 2,
            height: RULE_CELL_HEIGHT,
        }, cellId) +
        vertexCell(`${cellId}-name`, node.label, textStyle, {
            x: 0,
            y: dividerOffsetY,
            width: diameter,
            height: placement.height - dividerOffsetY,
        }, cellId)
    );
}

/**
 * The open-ended store: a rule above and below and nothing at the ends.
 *
 * On the context level the canvas also draws a vertical rule marking off the
 * code compartment, so that gets a cell of its own.
 */
function renderDataStoreNode(
    cellId: string,
    node: DFDNode & { type: 'datastore' },
    placement: DrawIoShapePlacement
): string {
    const label = node.storeCode ? `${node.storeCode} ${node.label}` : node.label;

    const storeStyle =
        'shape=partialRectangle;whiteSpace=wrap;html=1;top=1;bottom=1;left=0;right=0;' +
        `fillColor=${FILL_COLOR};strokeColor=${STROKE_COLOR};strokeWidth=${DATA_STORE_STROKE_WIDTH};` +
        `fontFamily=${FONT_FAMILY};fontSize=14;fontColor=${STROKE_COLOR};`;

    const storeCell = vertexCell(cellId, label, storeStyle, placement, '1');

    if (node.level !== 0) return storeCell;

    const compartmentRuleStyle =
        'shape=partialRectangle;html=1;top=0;bottom=0;left=0;right=1;fillColor=none;' +
        `strokeColor=${STROKE_COLOR};strokeWidth=${DATA_STORE_STROKE_WIDTH};`;

    return (
        storeCell +
        vertexCell(`${cellId}-compartment`, '', compartmentRuleStyle, {
            x: 0,
            y: 0,
            width: DATA_STORE_CODE_COLUMN_PX,
            height: placement.height,
        }, cellId)
    );
}

function renderShape(cellId: string, placement: DrawIoShapePlacement): string {
    const { node } = placement;

    switch (node.type) {
        case 'process':
            return renderProcessNode(cellId, node, placement);
        case 'datastore':
            return renderDataStoreNode(cellId, node, placement);
        case 'entity':
        case 'process_ref':
            return vertexCell(
                cellId,
                node.label,
                entityStyle(
                    node.type === 'entity'
                        ? node.textSize ?? DEFAULT_ENTITY_TEXT_SIZE_PX
                        : DEFAULT_ENTITY_TEXT_SIZE_PX
                ),
                placement,
                '1'
            );
    }
}

/** Where a point sits inside a shape's box, as the 0–1 fractions draw.io wants. */
function toRelativePoint(point: CanvasPoint, placement: DrawIoShapePlacement): CanvasPoint {
    return {
        x: placement.width === 0 ? 0.5 : clamp((point.x - placement.x) / placement.width, 0, 1),
        y: placement.height === 0 ? 0.5 : clamp((point.y - placement.y) / placement.height, 0, 1),
    };
}

function distanceBetween(from: CanvasPoint, to: CanvasPoint): number {
    return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * How far along the path a point lies, as the -1 to 1 draw.io uses for labels.
 *
 * The label always sits on one of the path's own segments, so a plain distance
 * along the path puts it back where the canvas had it without needing an offset.
 */
function toRelativeLabelPosition(points: CanvasPoint[], labelPoint: CanvasPoint): number {
    let totalLength = 0;
    for (let index = 0; index < points.length - 1; index++) {
        totalLength += distanceBetween(points[index], points[index + 1]);
    }
    if (totalLength === 0) return 0;

    let travelled = 0;
    for (let index = 0; index < points.length - 1; index++) {
        const start = points[index];
        const end = points[index + 1];
        const segmentLength = distanceBetween(start, end);

        // Is the label on this segment? Both are axis-aligned, so it is enough
        // to check it lies within the segment's extent.
        const isOnSegment =
            labelPoint.x >= Math.min(start.x, end.x) - 1 &&
            labelPoint.x <= Math.max(start.x, end.x) + 1 &&
            labelPoint.y >= Math.min(start.y, end.y) - 1 &&
            labelPoint.y <= Math.max(start.y, end.y) + 1;

        if (isOnSegment) {
            return ((travelled + distanceBetween(start, labelPoint)) / totalLength) * 2 - 1;
        }

        travelled += segmentLength;
    }

    return 0;
}

/**
 * A flow, drawn along the exact path the canvas gave it.
 *
 * `edgeStyle` is deliberately left off: with the corners supplied as waypoints,
 * draw.io's default connector joins them with straight segments and reproduces
 * the path, whereas an orthogonal router would add jogs of its own. The ends are
 * pinned with `exitPerimeter=0` / `entryPerimeter=0` so they stay on the handle
 * points instead of snapping to the middle of a side — which is what made every
 * flow between two shapes fall onto the same line.
 */
function renderFlow(
    cellId: string,
    route: DrawIoFlowRoute,
    source: DrawIoShapePlacement | undefined,
    target: DrawIoShapePlacement | undefined,
    sourceCellId: string,
    targetCellId: string
): string {
    const { edge, points } = route;
    const labelTextSize = edge.labelTextSize ?? DEFAULT_FLOW_LABEL_TEXT_SIZE_PX;

    let style =
        'rounded=0;html=1;' +
        `strokeColor=${STROKE_COLOR};strokeWidth=${FLOW_STROKE_WIDTH};endArrow=blockThin;endFill=1;` +
        `fontFamily=${FONT_FAMILY};fontSize=${labelTextSize};fontColor=${STROKE_COLOR};` +
        `labelBackgroundColor=${FILL_COLOR};`;

    if (points.length >= 2 && source) {
        const exit = toRelativePoint(points[0], source);
        style += `exitX=${toCoordinate(exit.x)};exitY=${toCoordinate(exit.y)};exitDx=0;exitDy=0;exitPerimeter=0;`;
    }
    if (points.length >= 2 && target) {
        const entry = toRelativePoint(points[points.length - 1], target);
        style += `entryX=${toCoordinate(entry.x)};entryY=${toCoordinate(entry.y)};entryDx=0;entryDy=0;entryPerimeter=0;`;
    }

    const labelPosition = route.labelPoint
        ? toRelativeLabelPosition(points, route.labelPoint)
        : ((edge.labelOffset ?? 0.5) - 0.5) * 2;

    // The corners only. draw.io works out the ends from the exit and entry
    // points above, and repeating them here would double the first segment.
    const corners = points.slice(1, -1);
    const waypoints = corners.length
        ? '            <Array as="points">\n' +
        corners
            .map(
                (point) =>
                    `              <mxPoint x="${toCoordinate(point.x)}" y="${toCoordinate(point.y)}" />\n`
            )
            .join('') +
        '            </Array>\n'
        : '';

    return (
        `        <mxCell id="${escapeXml(cellId)}" value="${escapeXml(edge.label)}" style="${style}" ` +
        `edge="1" parent="1" source="${escapeXml(sourceCellId)}" target="${escapeXml(targetCellId)}">\n` +
        `          <mxGeometry x="${toCoordinate(labelPosition)}" relative="1" as="geometry">\n` +
        waypoints +
        '          </mxGeometry>\n' +
        '        </mxCell>\n'
    );
}

function renderPage(page: DrawIoPage): string {
    // draw.io identifies cells by these ids and they have to be unique within a
    // page, so they are generated rather than taken from the diagram: a node id
    // is free-form text here and could contain anything.
    const cellIdsByNodeId = new Map<string, string>();
    const placementsByNodeId = new Map<string, DrawIoShapePlacement>();

    page.shapes.forEach((placement, index) => {
        cellIdsByNodeId.set(placement.node.id, `node-${index}`);
        placementsByNodeId.set(placement.node.id, placement);
    });

    const shapeCells = page.shapes
        .map((placement) => renderShape(cellIdsByNodeId.get(placement.node.id)!, placement))
        .join('');

    const flowCells = page.flows
        .map((route, index) => {
            const sourceCellId = cellIdsByNodeId.get(route.edge.sourceNodeId);
            const targetCellId = cellIdsByNodeId.get(route.edge.targetNodeId);

            // A flow whose endpoints are not both on this page would become an
            // edge attached to nothing. The rule set already reports that as a
            // finding; dropping it here keeps the file openable.
            if (!sourceCellId || !targetCellId) return '';

            return renderFlow(
                `flow-${index}`,
                route,
                placementsByNodeId.get(route.edge.sourceNodeId),
                placementsByNodeId.get(route.edge.targetNodeId),
                sourceCellId,
                targetCellId
            );
        })
        .join('');

    return (
        `  <diagram id="level-${page.level}" name="${escapeXml(PAGE_TITLES[page.level])}">\n` +
        '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" ' +
        'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" ' +
        'math="0" shadow="0">\n' +
        '      <root>\n' +
        '        <mxCell id="0" />\n' +
        '        <mxCell id="1" parent="0" />\n' +
        shapeCells +
        flowCells +
        '      </root>\n' +
        '    </mxGraphModel>\n' +
        '  </diagram>\n'
    );
}

/** Serialises measured pages into the text written to a `.drawio` file. */
export function serializeDrawIoDocument(pages: DrawIoPage[]): string {
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<mxfile host="Draw-DFD" agent="Draw-DFD" type="device" version="1">\n' +
        pages.map(renderPage).join('') +
        '</mxfile>\n'
    );
}
