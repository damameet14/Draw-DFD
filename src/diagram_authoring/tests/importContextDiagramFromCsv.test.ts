import { describe, it, expect } from 'vitest';
import { type ProcessNode } from '../../data_flow_diagram_model/public_interface';
import { importContextDiagramFromCsv } from '../importContextDiagramFromCsv';
import { parseDelimitedText, normalizeColumnName } from '../parseDelimitedText';

const HEADER = 'entity,in_flow,out_flow';

function existingContextProcess(): ProcessNode {
    return {
        id: 'p-0.0',
        type: 'process',
        label: 'Old Name',
        processNumber: '0.0',
        level: 0,
        position: { x: 450, y: 350 },
    };
}

describe('parseDelimitedText', () => {
    it('reads a simple table', () => {
        expect(parseDelimitedText('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('keeps commas inside quoted cells', () => {
        expect(parseDelimitedText('a,b\n"one, two",3')).toEqual([['a', 'b'], ['one, two', '3']]);
    });

    it('unescapes doubled quotes', () => {
        expect(parseDelimitedText('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
    });

    it('keeps newlines inside quoted cells', () => {
        expect(parseDelimitedText('a,b\n"line1\nline2",x')).toEqual([['a', 'b'], ['line1\nline2', 'x']]);
    });

    it('treats CRLF as one row break', () => {
        expect(parseDelimitedText('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('ignores a trailing newline', () => {
        expect(parseDelimitedText('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('strips a byte-order mark from a spreadsheet export', () => {
        expect(parseDelimitedText('﻿entity,in_flow')).toEqual([['entity', 'in_flow']]);
    });
});

describe('normalizeColumnName', () => {
    it('makes heading spellings comparable', () => {
        expect(normalizeColumnName(' In Flow ')).toBe('in_flow');
        expect(normalizeColumnName('IN-FLOW')).toBe('in_flow');
        expect(normalizeColumnName('in_flow')).toBe('in_flow');
    });
});

describe('importContextDiagramFromCsv — successful imports', () => {
    it('creates one entity and a paired pair of flows per row', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\nCustomer,Order,Confirmation`);

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.entityCount).toBe(1);
        expect(result.flowPairCount).toBe(1);

        const entity = result.nodes.find(node => node.type === 'entity')!;
        const process = result.nodes.find(node => node.type === 'process')!;

        const inFlow = result.edges.find(edge => edge.label === 'Order')!;
        const outFlow = result.edges.find(edge => edge.label === 'Confirmation')!;

        expect(inFlow.sourceNodeId).toBe(entity.id);
        expect(inFlow.targetNodeId).toBe(process.id);
        expect(outFlow.sourceNodeId).toBe(process.id);
        expect(outFlow.targetNodeId).toBe(entity.id);
    });

    it('links the two flows of a pair with a shared pairId', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\nCustomer,Order,Confirmation`);

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const [first, second] = result.edges;
        expect(first.pairId).toBeTruthy();
        expect(first.pairId).toBe(second.pairId);
    });

    it('gives each pair its own pairId', () => {
        const result = importContextDiagramFromCsv(
            `${HEADER}\nCustomer,Order,Confirmation\nCustomer,Payment,Receipt`
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const pairIds = new Set(result.edges.map(edge => edge.pairId));
        expect(pairIds.size).toBe(2);
    });

    it('sets both handles to the edge id, as the canvas expects', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\nCustomer,Order,Confirmation`);

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        result.edges.forEach(edge => {
            expect(edge.sourceHandle).toBe(edge.id);
            expect(edge.targetHandle).toBe(edge.id);
        });
    });

    it('reuses one entity across its rows', () => {
        const result = importContextDiagramFromCsv(
            `${HEADER}\nCustomer,Order,Confirmation\nCustomer,Payment,Receipt\nSupplier,Delivery,Purchase Order`
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.entityCount).toBe(2);
        expect(result.flowPairCount).toBe(3);
        expect(result.edges).toHaveLength(6);
    });

    it('puts everything on level 0 and creates exactly one process', () => {
        const result = importContextDiagramFromCsv(
            `${HEADER}\nCustomer,Order,Confirmation\nSupplier,Delivery,Purchase Order`
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.nodes.every(node => node.level === 0)).toBe(true);
        expect(result.edges.every(edge => edge.level === 0)).toBe(true);
        expect(result.nodes.filter(node => node.type === 'process')).toHaveLength(1);
        expect(result.nodes.some(node => node.type === 'datastore')).toBe(false);
    });

    it('numbers the created context process 0.0', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\nCustomer,Order,Confirmation`);

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const process = result.nodes.find(node => node.type === 'process');
        expect(process).toMatchObject({ type: 'process', processNumber: '0.0' });
    });

    it('reuses the existing context process so other levels keep referencing it', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\nCustomer,Order,Confirmation`, {
            existingContextProcess: existingContextProcess(),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const process = result.nodes.find(node => node.type === 'process')!;
        expect(process.id).toBe('p-0.0');
    });

    it('takes the system name from the system column and applies it to the process', () => {
        const result = importContextDiagramFromCsv(
            `system,${HEADER}\nRestaurant ERP,Customer,Order,Confirmation\n,Supplier,Delivery,PO`
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.systemName).toBe('Restaurant ERP');
        const process = result.nodes.find(node => node.type === 'process')!;
        expect(process.label).toBe('Restaurant ERP');
    });

    it('leaves the system name null when the column is absent', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\nCustomer,Order,Confirmation`);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.systemName).toBe(null);
    });

    it('accepts alternative header spellings', () => {
        const result = importContextDiagramFromCsv(
            'External Entity,In Flow,Out Flow\nCustomer,Order,Confirmation'
        );
        expect(result.ok).toBe(true);
    });

    it('ignores blank lines between rows', () => {
        const result = importContextDiagramFromCsv(
            `${HEADER}\nCustomer,Order,Confirmation\n\n\nSupplier,Delivery,PO\n`
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.flowPairCount).toBe(2);
    });

    it('trims surrounding whitespace from every field', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\n  Customer  ,  Order  ,  Confirmation  `);

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.nodes.find(node => node.type === 'entity')!.label).toBe('Customer');
        expect(result.edges.map(edge => edge.label)).toEqual(['Order', 'Confirmation']);
    });

    it('spreads entities around the process rather than stacking them', () => {
        const rows = ['A', 'B', 'C', 'D']
            .map(name => `${name},in,out`)
            .join('\n');
        const result = importContextDiagramFromCsv(`${HEADER}\n${rows}`);

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const positions = result.nodes
            .filter(node => node.type === 'entity')
            .map(node => `${node.position.x},${node.position.y}`);

        expect(new Set(positions).size).toBe(4);
    });

    it('gives every node and edge a distinct id', () => {
        const result = importContextDiagramFromCsv(
            `${HEADER}\nCustomer,Order,Confirmation\nSupplier,Delivery,PO\nManager,Request,Report`
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const ids = [...result.nodes.map(n => n.id), ...result.edges.map(e => e.id)];
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('importContextDiagramFromCsv — the FlowPair rule', () => {
    it('rejects a row with no out_flow', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\nCustomer,Order,`);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems[0]).toMatch(/Line 2 \("Customer"\): out_flow is empty/);
    });

    it('rejects a row with no in_flow', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\nCustomer,,Confirmation`);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems[0]).toMatch(/in_flow is empty/);
    });

    it('names both directions when both are missing', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\nCustomer,,`);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems[0]).toMatch(/in_flow and out_flow are empty/);
    });

    it('imports nothing at all when any row is invalid', () => {
        const result = importContextDiagramFromCsv(
            `${HEADER}\nCustomer,Order,Confirmation\nSupplier,Delivery,`
        );
        expect(result.ok).toBe(false);
    });

    it('reports every bad row, not just the first', () => {
        const result = importContextDiagramFromCsv(
            `${HEADER}\nCustomer,Order,\nSupplier,,PO\nManager,,`
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems).toHaveLength(3);
        expect(result.problems[1]).toMatch(/Line 3/);
        expect(result.problems[2]).toMatch(/Line 4/);
    });

    it('caps a very long problem list and says how many were left out', () => {
        const badRows = Array.from({ length: 20 }, (_, i) => `Entity ${i},,`).join('\n');
        const result = importContextDiagramFromCsv(`${HEADER}\n${badRows}`);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems).toHaveLength(13);
        expect(result.problems.at(-1)).toMatch(/and 8 more/);
    });
});

describe('importContextDiagramFromCsv — malformed files', () => {
    it('rejects an empty file', () => {
        const result = importContextDiagramFromCsv('');
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems[0]).toMatch(/empty/);
    });

    it('rejects a file with a header but no rows', () => {
        const result = importContextDiagramFromCsv(HEADER);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems[0]).toMatch(/no data rows/);
    });

    it('names the columns it could not find', () => {
        const result = importContextDiagramFromCsv('entity,description\nCustomer,something');

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems[0]).toMatch(/in_flow, out_flow/);
    });

    it('rejects a row with an empty entity name', () => {
        const result = importContextDiagramFromCsv(`${HEADER}\n,Order,Confirmation`);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems[0]).toMatch(/Line 2: the entity name is empty/);
    });
});
