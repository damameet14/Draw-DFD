import { describe, it, expect } from 'vitest';
import { type DFDEdge, type DFDNode } from '../../data_flow_diagram_model/public_interface';
import {
    serializeDrawIoDocument,
    type DrawIoFlowRoute,
    type DrawIoPage,
    type DrawIoShapePlacement,
} from '../drawIoDiagramExport';

const processNode: DFDNode = {
    id: 'p-0.0',
    type: 'process',
    label: 'Restaurant ERP',
    level: 0,
    position: { x: 350, y: 250 },
    processNumber: '0.0',
    diameter: 300,
};

const entityNode: DFDNode = {
    id: 'e-1',
    type: 'entity',
    label: 'Customer',
    level: 0,
    position: { x: 20, y: 40 },
};

const flow: DFDEdge = {
    id: 'f-1',
    type: 'dataflow',
    label: 'Order Request',
    sourceNodeId: 'e-1',
    targetNodeId: 'p-0.0',
    level: 0,
};

function place(node: DFDNode, box: Partial<DrawIoShapePlacement> = {}): DrawIoShapePlacement {
    const size = node.type === 'process' ? 300 : 120;
    return {
        node,
        x: node.position.x,
        y: node.position.y,
        width: size,
        height: size,
        ...box,
    };
}

/** The L-shaped path the canvas draws: out of the entity, along, into the circle. */
function buildPage(overrides: Partial<DrawIoPage> = {}): DrawIoPage {
    const route: DrawIoFlowRoute = {
        edge: flow,
        points: [
            { x: 140, y: 80 },
            { x: 420, y: 80 },
            { x: 420, y: 260 },
        ],
    };

    return {
        level: 0,
        shapes: [place(processNode), place(entityNode)],
        flows: [route],
        ...overrides,
    };
}

/**
 * Parses the export the way draw.io does. Anything malformed — an unescaped
 * label, a stray tag — fails here rather than silently producing a file that
 * will not open.
 */
function parseExport(xmlText: string): Document {
    const parsed = new DOMParser().parseFromString(xmlText, 'application/xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    return parsed;
}

function cellById(document: Document, id: string): Element {
    const cell = document.querySelector(`mxCell[id="${id}"]`);
    expect(cell, `no cell with id "${id}"`).not.toBeNull();
    return cell!;
}

/** Reads one `key=value` out of a cell's style string. */
function styleValue(cell: Element, key: string): string | undefined {
    const match = cell.getAttribute('style')?.match(new RegExp(`(?:^|;)${key}=([^;]*)`));
    return match?.[1];
}

describe('serializeDrawIoDocument', () => {
    it('produces a well-formed mxfile with the standard root cells', () => {
        const document = parseExport(serializeDrawIoDocument([buildPage()]));

        expect(document.documentElement.tagName).toBe('mxfile');
        expect(cellById(document, '0').getAttribute('parent')).toBeNull();
        expect(cellById(document, '1').getAttribute('parent')).toBe('0');
    });

    it('names the page after the level it holds', () => {
        const document = parseExport(serializeDrawIoDocument([buildPage({ level: 1 })]));
        const page = document.querySelector('diagram')!;

        expect(page.getAttribute('id')).toBe('level-1');
        expect(page.getAttribute('name')).toContain('Level 1');
    });

    it('writes a page per level when given several', () => {
        const document = parseExport(
            serializeDrawIoDocument([buildPage(), buildPage({ level: 1 })])
        );

        expect([...document.querySelectorAll('diagram')].map((page) => page.getAttribute('id')))
            .toEqual(['level-0', 'level-1']);
    });

    it('places each shape at the box it was measured at', () => {
        const document = parseExport(serializeDrawIoDocument([buildPage()]));

        const circle = cellById(document, 'node-0');
        expect(circle.getAttribute('style')).toContain('ellipse');
        expect(circle.querySelector('mxGeometry')!.getAttribute('x')).toBe('350');
        expect(circle.querySelector('mxGeometry')!.getAttribute('width')).toBe('300');

        const box = cellById(document, 'node-1');
        expect(box.getAttribute('value')).toBe('Customer');
        expect(box.querySelector('mxGeometry')!.getAttribute('x')).toBe('20');
        expect(box.querySelector('mxGeometry')!.getAttribute('width')).toBe('120');
    });

    it('splits a process circle into its number, rule, and name', () => {
        const document = parseExport(serializeDrawIoDocument([buildPage()]));

        expect(cellById(document, 'node-0-number').getAttribute('value')).toBe('0.0');
        expect(cellById(document, 'node-0-name').getAttribute('value')).toBe('Restaurant ERP');
        expect(cellById(document, 'node-0-divider').getAttribute('style')).toContain('line;');

        // The three parts belong to the circle, so they move with it.
        for (const suffix of ['number', 'divider', 'name']) {
            expect(cellById(document, `node-0-${suffix}`).getAttribute('parent')).toBe('node-0');
        }
    });

    it('keeps the divider rule inside the circle', () => {
        const document = parseExport(serializeDrawIoDocument([buildPage()]));
        const rule = cellById(document, 'node-0-divider').querySelector('mxGeometry')!;

        const left = Number(rule.getAttribute('x'));
        const width = Number(rule.getAttribute('width'));
        const centerY = Number(rule.getAttribute('y')) + Number(rule.getAttribute('height')) / 2;

        expect(left).toBeGreaterThan(0);
        expect(left + width).toBeLessThan(300);
        // Symmetrical about the circle's vertical axis, to within the rounding
        // applied to each coordinate.
        expect(left + width / 2).toBeCloseTo(150, 1);
        expect(centerY).toBeGreaterThan(0);
        expect(centerY).toBeLessThan(300);
    });

    it('draws a data store open-ended and prefixes its code', () => {
        const store: DFDNode = {
            id: 'd-1',
            type: 'datastore',
            label: 'Orders',
            level: 0,
            position: { x: 0, y: 0 },
            storeCode: 'D1',
        };
        const document = parseExport(
            serializeDrawIoDocument([buildPage({ shapes: [place(store)], flows: [] })])
        );

        const style = cellById(document, 'node-0').getAttribute('style')!;
        expect(style).toContain('shape=partialRectangle');
        expect(style).toContain('left=0;right=0');
        expect(cellById(document, 'node-0').getAttribute('value')).toBe('D1 Orders');
    });

    it('connects a flow to the cells of its endpoints', () => {
        const document = parseExport(serializeDrawIoDocument([buildPage()]));
        const cell = cellById(document, 'flow-0');

        expect(cell.getAttribute('edge')).toBe('1');
        expect(cell.getAttribute('source')).toBe('node-1'); // the entity
        expect(cell.getAttribute('target')).toBe('node-0'); // the process
        expect(cell.getAttribute('value')).toBe('Order Request');
    });

    it('pins both ends of a flow to the point the canvas drew it from', () => {
        const document = parseExport(serializeDrawIoDocument([buildPage()]));
        const cell = cellById(document, 'flow-0');

        // The path leaves the entity box (20,40 120x120) at (140,80): its right
        // edge, halfway down.
        expect(styleValue(cell, 'exitX')).toBe('1');
        expect(styleValue(cell, 'exitY')).toBe('0.33');
        expect(styleValue(cell, 'exitPerimeter')).toBe('0');

        // And meets the circle (350,250 300x300) at (420,260).
        expect(styleValue(cell, 'entryX')).toBe('0.23');
        expect(styleValue(cell, 'entryY')).toBe('0.03');
        expect(styleValue(cell, 'entryPerimeter')).toBe('0');
    });

    it('carries the corners over as waypoints, without repeating the ends', () => {
        const document = parseExport(serializeDrawIoDocument([buildPage()]));
        const waypoints = [...cellById(document, 'flow-0').querySelectorAll('Array[as="points"] mxPoint')];

        expect(waypoints).toHaveLength(1);
        expect(waypoints[0].getAttribute('x')).toBe('420');
        expect(waypoints[0].getAttribute('y')).toBe('80');
    });

    it('leaves a flow floating when no route was measured for it', () => {
        const document = parseExport(
            serializeDrawIoDocument([buildPage({ flows: [{ edge: flow, points: [] }] })])
        );
        const cell = cellById(document, 'flow-0');

        expect(styleValue(cell, 'exitX')).toBeUndefined();
        expect(cell.querySelectorAll('mxPoint')).toHaveLength(0);
        // Still connected, so draw.io routes it itself rather than dropping it.
        expect(cell.getAttribute('source')).toBe('node-1');
    });

    it('positions the label at the same point along the path', () => {
        // The path is 280 across then 180 down; a label two thirds along the
        // first segment is 186.67 of 460, so just short of the middle.
        const page = buildPage();
        page.flows[0].labelPoint = { x: 326.67, y: 80 };

        const document = parseExport(serializeDrawIoDocument([page]));
        const labelPosition = Number(
            cellById(document, 'flow-0').querySelector('mxGeometry')!.getAttribute('x')
        );

        expect(labelPosition).toBeCloseTo(-0.19, 2);
    });

    it('falls back to the stored label offset when the label was not measured', () => {
        const page = buildPage();
        page.flows[0].edge = { ...flow, labelOffset: 0.25 };

        const document = parseExport(serializeDrawIoDocument([page]));

        expect(cellById(document, 'flow-0').querySelector('mxGeometry')!.getAttribute('x')).toBe('-0.5');
    });

    it('drops a flow whose endpoints are not both on the page', () => {
        const page = buildPage();
        page.flows[0].edge = { ...flow, targetNodeId: 'missing-node' };

        const document = parseExport(serializeDrawIoDocument([page]));

        expect(document.querySelectorAll('mxCell[edge="1"]')).toHaveLength(0);
    });

    it('escapes characters that would otherwise break the XML', () => {
        const page = buildPage({
            shapes: [place({ ...entityNode, label: 'R&D <"lead">' })],
            flows: [],
        });

        const xmlText = serializeDrawIoDocument([page]);
        expect(xmlText).toContain('R&amp;D &lt;&quot;lead&quot;&gt;');

        expect(cellById(parseExport(xmlText), 'node-0').getAttribute('value')).toBe('R&D <"lead">');
    });
});
