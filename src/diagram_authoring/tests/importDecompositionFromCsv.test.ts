import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    importDecompositionFromCsv,
    type DecompositionCsvImportResult,
} from '../importDecompositionFromCsv';
import {
    planDecomposedLevelLayout,
    type CanvasPosition,
    type DecomposedLevelLayout,
} from '../../diagram_canvas/public_interface';

const HEADER =
    'process_name,entity_name,in_flow,out_flow,data_store,data_store_inflow,data_store_outflow';

function importRows(...rows: string[]): DecompositionCsvImportResult {
    return importDecompositionFromCsv([HEADER, ...rows].join('\n'), 1);
}

/** Narrows to the success case, failing with the problems when it is not. */
function expectImported(result: DecompositionCsvImportResult) {
    if (!result.ok) {
        throw new Error(`expected a successful import, got: ${result.problems.join(' | ')}`);
    }
    return result;
}

/** Every pair of segments that lie along each other rather than merely crossing. */
function collectOverlaps(layout: DecomposedLevelLayout): string[] {
    const segments: { id: string; a: CanvasPosition; b: CanvasPosition }[] = [];
    layout.flows.forEach((route, id) => {
        for (let index = 0; index < route.points.length - 1; index++) {
            segments.push({ id, a: route.points[index], b: route.points[index + 1] });
        }
    });

    const overlap = (a1: number, a2: number, b1: number, b2: number) =>
        Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2));

    const clashes: string[] = [];
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const a = segments[i];
            const b = segments[j];
            if (a.id === b.id) continue;

            if (a.a.y === a.b.y && b.a.y === b.b.y && a.a.y === b.a.y) {
                if (overlap(a.a.x, a.b.x, b.a.x, b.b.x) > 0.5) clashes.push(`${a.id}|${b.id}`);
            }
            if (a.a.x === a.b.x && b.a.x === b.b.x && a.a.x === b.a.x) {
                if (overlap(a.a.y, a.b.y, b.a.y, b.b.y) > 0.5) clashes.push(`${a.id}|${b.id}`);
            }
        }
    }

    return clashes;
}

describe('importDecompositionFromCsv', () => {
    it('builds the whole chain a row describes', () => {
        const result = expectImported(
            importRows(
                '1.0 Registration,Visitor,Registration Details,Registration Acknowledgement,' +
                'User_Tbl,Registration Details,Registration Acknowledgement'
            )
        );

        expect(result.processCount).toBe(1);
        expect(result.participantCount).toBe(1);
        expect(result.dataStoreCount).toBe(1);
        expect(result.flowCount).toBe(4);
    });

    it('points the four flows along entity, process, store, and back', () => {
        const result = expectImported(
            importRows('1.0 Login,Admin,Sent To Process,Sent To Entity,User_Tbl,Sent To Store,Sent From Store')
        );

        const idOf = (label: string) => result.nodes.find((node) => node.label === label)!.id;
        const entityId = idOf('Admin');
        const processId = idOf('Login');
        const storeId = idOf('User_Tbl');

        const endsOf = (flowLabel: string) => {
            const edge = result.edges.find((candidate) => candidate.label === flowLabel)!;
            return [edge.sourceNodeId, edge.targetNodeId];
        };

        expect(endsOf('Sent To Process')).toEqual([entityId, processId]);
        expect(endsOf('Sent To Entity')).toEqual([processId, entityId]);
        expect(endsOf('Sent To Store')).toEqual([processId, storeId]);
        expect(endsOf('Sent From Store')).toEqual([storeId, processId]);
    });

    it('pairs each exchange separately so both stay side by side', () => {
        const result = expectImported(
            importRows('1.0 Login,Admin,Credentials,Acknowledgement,User_Tbl,Lookup,Record')
        );

        const pairIdOf = (label: string) =>
            result.edges.find((edge) => edge.label === label)!.pairId;

        expect(pairIdOf('Credentials')).toBe(pairIdOf('Acknowledgement'));
        expect(pairIdOf('Lookup')).toBe(pairIdOf('Record'));
        // The entity's exchange and the store's are two different pairs.
        expect(pairIdOf('Credentials')).not.toBe(pairIdOf('Lookup'));
    });

    it('takes the number off the process name', () => {
        const result = expectImported(
            importRows('6.0 Order & Return Management,Customer,Manage Order,Order Details,,,')
        );

        const process = result.nodes.find((node) => node.type === 'process')!;
        expect(process.label).toBe('Order & Return Management');
        expect(process.processNumber).toBe('6.0');
    });

    it('orders the processes by their number, not by where they appear', () => {
        const result = expectImported(
            importRows(
                '10.0 Reporting,Admin,Request,Report,,,',
                '2.0 Login,Admin,Credentials,Acknowledgement,,,',
                '1.0 Registration,Visitor,Details,Acknowledgement,,,'
            )
        );

        const processes = result.nodes.filter((node) => node.type === 'process');
        expect(processes.map((process) => process.processNumber)).toEqual(['1.0', '2.0', '10.0']);
    });

    it('numbers a process the file did not number', () => {
        const result = expectImported(
            importRows(
                '3.0 Profile Management,Admin,Manage,Details,,,',
                'Reporting,Admin,Request,Report,,,'
            )
        );

        const reporting = result.nodes.find(
            (node) => node.type === 'process' && node.label === 'Reporting'
        );
        expect(reporting?.type === 'process' && reporting.processNumber).toBe('4.0');
    });

    it('gathers rows naming the same process onto one circle', () => {
        const result = expectImported(
            importRows(
                '2.0 Login,Admin,Credentials,Acknowledgement,,,',
                '2.0 Login,Customer,Credentials,Acknowledgement,,,'
            )
        );

        expect(result.processCount).toBe(1);
        expect(result.participantCount).toBe(2);
        expect(result.flowCount).toBe(4);
    });

    it('keeps a repeated store exchange as its own pair of flows', () => {
        // Four entities logging in through one process each get their own
        // exchange with the table, which is what the file says.
        const result = expectImported(
            importRows(
                '2.0 Login,Admin,Details,Ack,User_Tbl,Details,Ack',
                '2.0 Login,Employee,Details,Ack,User_Tbl,Details,Ack',
                '2.0 Login,Customer,Details,Ack,User_Tbl,Details,Ack'
            )
        );

        expect(result.dataStoreCount).toBe(1);
        expect(result.flowCount).toBe(12);
    });

    it('accepts a row with only an entity, or only a store', () => {
        const entityOnly = expectImported(importRows('1.0 Login,Admin,Credentials,Acknowledgement,,,'));
        expect(entityOnly.dataStoreCount).toBe(0);
        expect(entityOnly.flowCount).toBe(2);

        const storeOnly = expectImported(importRows('1.0 Login,,,,User_Tbl,Lookup,Record'));
        expect(storeOnly.participantCount).toBe(0);
        expect(storeOnly.flowCount).toBe(2);
    });

    it('accepts a one-way exchange and leaves it unpaired', () => {
        const result = expectImported(importRows('1.0 Archive,,,,Audit_Tbl,Entry,'));

        expect(result.edges).toHaveLength(1);
        expect(result.edges[0].pairId).toBeUndefined();
    });

    it('codes the stores in the order they appear', () => {
        const result = expectImported(
            importRows(
                '1.0 Login,,,,User_Tbl,Lookup,Record',
                '2.0 Orders,,,,Order_Tbl,Save,Order',
                '3.0 Audit,,,,User_Tbl,Note,Entry'
            )
        );

        const stores = result.nodes.filter((node) => node.type === 'datastore');
        expect(stores.map((store) => [store.label, store.storeCode])).toEqual([
            ['User_Tbl', 'D1'],
            ['Order_Tbl', 'D2'],
        ]);
    });

    it('accepts the column spellings a spreadsheet produces', () => {
        const result = importDecompositionFromCsv(
            [
                'Process Name,Entity Name,In Flow,Out Flow,Data Store,Data Store Inflow,Data Store Outflow',
                '1.0 Login,Admin,Creds,Ack,User_Tbl,Lookup,Record',
            ].join('\n'),
            1
        );

        expect(expectImported(result).flowCount).toBe(4);
    });

    it('imports onto whichever level it is given', () => {
        const result = expectImported(
            importDecompositionFromCsv([HEADER, '1.0 Verify,Admin,Query,Answer,,,'].join('\n'), 2)
        );

        expect(result.nodes.every((node) => node.level === 2)).toBe(true);
        expect(result.edges.every((edge) => edge.level === 2)).toBe(true);
    });

    it('rejects a file with no usable header', () => {
        const result = importDecompositionFromCsv('a,b,c\n1,2,3', 1);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.problems[0]).toContain('process_name');
    });

    it('reports every bad row at once, with line numbers', () => {
        const result = importRows(
            ',Admin,Query,Answer,,,',
            '1.0 Login,Admin,,,,,',
            '1.0 Login,,Query,Answer,,,',
            '1.0 Login,,,,User_Tbl,,',
            '1.0 Login,,,,,Lookup,Record',
            '1.0 Login,,,,,,'
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;

        expect(result.problems).toHaveLength(6);
        result.problems.forEach((problem, index) => {
            expect(problem).toContain(`Line ${index + 2}`);
        });
    });

    it('rejects a process numbered two different ways', () => {
        const result = importRows(
            '2.0 Login,Admin,Query,Answer,,,',
            '3.0 Login,Customer,Query,Answer,,,'
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.problems[0]).toContain('numbered 3.0');
            expect(result.problems[0]).toContain('2.0');
        }
    });

    it('gives two imports different flow ids', () => {
        // Level 1 and Level 2 are saved in one document, so ids that repeat
        // across two imports make the saved file unreadable.
        const one = expectImported(importRows('1.0 Login,Admin,Credentials,Acknowledgement,,,'));
        const two = expectImported(
            importDecompositionFromCsv(
                [HEADER, '6.1 Cart Management,Customer,Manage Cart,Cart Details,,,'].join('\n'),
                2
            )
        );

        const shared = one.edges
            .map((edge) => edge.id)
            .filter((id) => two.edges.some((other) => other.id === id));

        expect(shared).toEqual([]);
    });

    it('rejects an empty file and a header with no rows', () => {
        expect(importDecompositionFromCsv('', 1).ok).toBe(false);
        expect(importDecompositionFromCsv(HEADER, 1).ok).toBe(false);
    });

    describe('level 2', () => {
        function importLevel2(...rows: string[]): DecompositionCsvImportResult {
            return importDecompositionFromCsv([HEADER, ...rows].join('\n'), 2);
        }

        it('works out the parent from the sub-process numbers', () => {
            const result = expectImported(
                importLevel2(
                    '6.1 Cart Management,Customer,Manage Cart,Cart Details,,,',
                    '6.2 Order Processing,Customer,Manage Order,Order Details,,,'
                )
            );

            expect(result.parentProcessNumber).toBe('6.0');
            expect(result.processCount).toBe(2);
        });

        it('refuses a file covering more than one process', () => {
            const result = importLevel2(
                '6.1 Cart Management,Customer,Manage Cart,Cart Details,,,',
                '7.1 Payment Capture,Customer,Pay,Receipt,,,'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.problems[0]).toContain('6.0');
                expect(result.problems[0]).toContain('7.0');
                expect(result.problems[0]).toContain('one file per process');
            }
        });

        it('insists the sub-processes are numbered', () => {
            const result = importLevel2('Cart Management,Customer,Manage Cart,Cart Details,,,');

            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.problems[0]).toContain('6.1 Cart Handling');
        });

        it('joins a numbered participant to that sub-process when the file defines it', () => {
            const result = expectImported(
                importLevel2(
                    '6.1 Cart Management,Customer,Manage Cart,Cart Details,,,',
                    '6.2 Order Processing,6.1 Cart Management,Confirmed Cart,Cart Cleared,,,'
                )
            );

            // No extra box: the flow runs between the two circles.
            expect(result.processCount).toBe(2);
            expect(result.participantCount).toBe(1);
            expect(result.nodes.some((node) => node.type === 'process_ref')).toBe(false);

            const cart = result.nodes.find(
                (node) => node.type === 'process' && node.label === 'Cart Management'
            )!;
            const orders = result.nodes.find(
                (node) => node.type === 'process' && node.label === 'Order Processing'
            )!;
            const movement = result.edges.find((edge) => edge.label === 'Confirmed Cart')!;

            expect(movement.sourceNodeId).toBe(cart.id);
            expect(movement.targetNodeId).toBe(orders.id);
        });

        it('draws a process the file does not define as a reference box', () => {
            const result = expectImported(
                importLevel2('6.1 Cart Management,7.0 Payment Management,Confirmation,Request,,,')
            );

            const reference = result.nodes.find((node) => node.type === 'process_ref')!;
            expect(reference).toBeDefined();
            // Keeps its number, which is how such a reference is read.
            expect(reference.label).toBe('7.0 Payment Management');
        });

        it('still treats an ordinary name as an entity', () => {
            const result = expectImported(
                importLevel2('6.1 Cart Management,Customer,Manage Cart,Cart Details,,,')
            );

            expect(result.nodes.some((node) => node.type === 'entity')).toBe(true);
            expect(result.nodes.some((node) => node.type === 'process_ref')).toBe(false);
        });

        it('lays the shipped Level 2 example out without a single overlap', () => {
            const csvText = readFileSync('public/examples/level-2-example.csv', 'utf8');
            const result = expectImported(importDecompositionFromCsv(csvText, 2));

            expect(result.parentProcessNumber).toBe('6.0');
            expect(result.processCount).toBe(3);

            const layout = planDecomposedLevelLayout(result.nodes, result.edges);
            expect(layout.flows.size).toBe(result.edges.length);
            expect(collectOverlaps(layout)).toEqual([]);
        });
    });

    it('lays the shipped example out without a single overlap', () => {
        const csvText = readFileSync('public/examples/level-1-example.csv', 'utf8');
        const result = expectImported(importDecompositionFromCsv(csvText, 1));

        expect(result.processCount).toBe(9);
        expect(result.participantCount).toBe(5);
        expect(result.dataStoreCount).toBe(9);

        // The example is what a new user sees first, so it has to come out of
        // the layout as cleanly as anything built by hand.
        const layout = planDecomposedLevelLayout(result.nodes, result.edges);
        expect(layout.flows.size).toBe(result.edges.length);
        expect(collectOverlaps(layout)).toEqual([]);
    });
});
