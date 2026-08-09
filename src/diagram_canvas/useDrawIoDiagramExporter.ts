import { useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import { type DFDEdge, type DFDNode } from '../data_flow_diagram_model/public_interface';
import {
    serializeDrawIoDocument,
    type CanvasPoint,
    type DrawIoFlowRoute,
    type DrawIoShapePlacement,
} from '../diagram_persistence/public_interface';
import { MIN_ENTITY_SIZE, MIN_PROCESS_DIAMETER } from './contextDiagramGeometry';

/**
 * Exports the level currently on the canvas as draw.io XML.
 *
 * Like the image export this reads the live canvas rather than the stored
 * diagram, and for the same reason: where a flow attaches and the path it takes
 * are decided while rendering. A flow leaves the process circle at an angle
 * worked out from how many flows share that arc, then a collision pass nudges
 * crowded handles apart — none of which survives a translation into draw.io's
 * model, and reimplementing it here would be a second copy of the layout waiting
 * to drift from the renderers.
 *
 * So the routes are taken from what was drawn. Each flow's rendered path is read
 * off the canvas and written out as a fixed pair of endpoints plus the corners
 * between them, which is what makes a dozen parallel flows stay a dozen
 * distinguishable lines in the exported file instead of collapsing onto one.
 *
 * The consequence is that this exports one level, the one on screen, exactly as
 * the PNG export does. The other levels are not rendered, so there is nothing to
 * measure for them.
 *
 * Must be called from inside `DiagramCanvasProvider`.
 */
export function useDrawIoDiagramExporter(): () => string {
    const { getNodes, getEdges, screenToFlowPosition } = useReactFlow();

    return useCallback(() => {
        const nodes = getNodes();
        if (nodes.length === 0) {
            throw new Error('There is nothing on this level to export yet.');
        }

        const shapes: DrawIoShapePlacement[] = nodes.map((reactFlowNode) => {
            const node = reactFlowNode.data as DFDNode;
            const fallbackSize = fallbackSizeFor(node);

            return {
                node,
                x: reactFlowNode.positionAbsolute?.x ?? reactFlowNode.position.x,
                y: reactFlowNode.positionAbsolute?.y ?? reactFlowNode.position.y,
                // Measured sizes, so a store that widened to fit its name is the
                // width it actually took.
                width: reactFlowNode.width ?? fallbackSize.width,
                height: reactFlowNode.height ?? fallbackSize.height,
            };
        });

        const pathsByFlowId = readRenderedFlowPaths();
        const labelElementsByFlowId = readFlowLabelElements();

        const flows: DrawIoFlowRoute[] = getEdges().map((reactFlowEdge) => {
            const edge = reactFlowEdge.data as DFDEdge;
            const points = pathsByFlowId.get(reactFlowEdge.id) ?? [];
            const labelElement = labelElementsByFlowId.get(reactFlowEdge.id);

            return {
                edge,
                points,
                // The label wrapper is centred on the point the edge renderer put
                // it at, so its middle is that point whatever it contains.
                labelPoint: labelElement
                    ? toCanvasPoint(labelElement.getBoundingClientRect(), screenToFlowPosition)
                    : undefined,
            };
        });

        return serializeDrawIoDocument([
            { level: (nodes[0].data as DFDNode).level, shapes, flows },
        ]);
    }, [getNodes, getEdges, screenToFlowPosition]);
}

function fallbackSizeFor(node: DFDNode): { width: number; height: number } {
    switch (node.type) {
        case 'process': {
            const diameter = node.diameter || MIN_PROCESS_DIAMETER;
            return { width: diameter, height: diameter };
        }
        case 'datastore':
            return { width: 160, height: 50 };
        default:
            return {
                width: node.width || MIN_ENTITY_SIZE,
                height: node.height || MIN_ENTITY_SIZE,
            };
    }
}

function toCanvasPoint(
    rect: DOMRect,
    screenToFlowPosition: (position: CanvasPoint) => CanvasPoint
): CanvasPoint {
    return screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    });
}

/**
 * Every command's final coordinate pair. The flow paths are polylines, so this
 * is exact for them; were a curve ever introduced it would degrade to that
 * curve's end point rather than failing.
 */
function parsePathPoints(pathData: string): CanvasPoint[] {
    const points: CanvasPoint[] = [];

    for (const command of pathData.match(/[A-Za-z][^A-Za-z]*/g) ?? []) {
        const numbers = command
            .slice(1)
            .trim()
            .split(/[\s,]+/)
            .map(Number)
            .filter((value) => Number.isFinite(value));

        if (numbers.length < 2) continue;

        const point = { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] };
        const previous = points[points.length - 1];

        // A path can repeat a point where two segments meet; a repeated waypoint
        // would just be noise in the exported file.
        if (previous && previous.x === point.x && previous.y === point.y) continue;

        points.push(point);
    }

    return points;
}

/**
 * The path React Flow drew for each flow, in canvas coordinates.
 *
 * Read by walking the rendered edges rather than by selector, so a flow whose id
 * contains characters with meaning in a selector cannot break the export.
 */
function readRenderedFlowPaths(): Map<string, CanvasPoint[]> {
    const pathsByFlowId = new Map<string, CanvasPoint[]>();

    for (const group of document.querySelectorAll('.react-flow__edge')) {
        const testId = group.getAttribute('data-testid');
        if (!testId?.startsWith('rf__edge-')) continue;

        const pathData = group
            .querySelector('.react-flow__edge-path')
            ?.getAttribute('d');
        if (!pathData) continue;

        const points = parsePathPoints(pathData);
        if (points.length >= 2) {
            pathsByFlowId.set(testId.slice('rf__edge-'.length), points);
        }
    }

    return pathsByFlowId;
}

function readFlowLabelElements(): Map<string, Element> {
    const labelsByFlowId = new Map<string, Element>();

    for (const label of document.querySelectorAll('[data-flow-label-for]')) {
        const flowId = label.getAttribute('data-flow-label-for');
        if (flowId) labelsByFlowId.set(flowId, label);
    }

    return labelsByFlowId;
}
