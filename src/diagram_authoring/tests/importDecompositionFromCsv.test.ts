import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    importDecompositionFromCsv,
    type DecompositionCsvImportResult,
} from '../importDecompositionFromCsv';
import { planDecomposedLevelLayout } from '../../diagram_canvas/public_interface';

const HEADER = 'process,type,name,in_flow,out_flow';

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

function labelsOf(result: DecompositionCsvImportResult) {
    return expectImported(result).edges.map((edge) => edge.label);
}

describe('importDecompositionFromCsv', () => {
    it('builds processes, entities, stores, and flows from a file', () => {
        const result = expectImported(
            importRows(
                'Registration,entity,Visitor,Registration Details,Registration Acknowledgement',
                'Registration,datastore,User_Tbl,,Registration Details'
            )
        );

        expect(result.processCount).toBe(1);
        expect(result.participantCount).toBe(1);
        expect(result.dataStoreCount).toBe(1);
        expect(result.flowCount).toBe(3);

        const kinds = result.nodes.map((node) => node.type).sort();
        expect(kinds).toEqual(['datastore', 'entity', 'process']);
        expect(result.nodes.every((node) => node.level === 1)).toBe(true);
    });

    it('reads in_flow and out_flow from the process\'s point of view', () => {
        const result = expectImported(
            importRows('Login,entity,Admin,Login Credentials,Login Acknowledgement')
        );

        const processId = result.nodes.find((node) => node.type === 'process')!.id;
        const entityId = result.nodes.find((node) => node.type === 'entity')!.id;

        const inFlow = result.edges.find((edge) => edge.label === 'Login Credentials')!;
        const outFlow = result.edges.find((edge) => edge.label === 'Login Acknowledgement')!;

        expect(inFlow.sourceNodeId).toBe(entityId);
        expect(inFlow.targetNodeId).toBe(processId);
        expect(outFlow.sourceNodeId).toBe(processId);
        expect(outFlow.targetNodeId).toBe(entityId);
    });

    it('pairs the two directions of a row so they stay side by side', () => {
        const result = expectImported(
            importRows('Manage farm,datastore,Farm_Tbl,Farm Details,Manage Farm Details')
        );

        const [first, second] = result.edges;
        expect(first.pairId).toBeDefined();
        expect(first.pairId).toBe(second.pairId);
    });

    it('leaves a one-way flow unpaired', () => {
        const result = expectImported(importRows('Registration,datastore,User_Tbl,,Saved Details'));

        expect(result.edges).toHaveLength(1);
        expect(result.edges[0].pairId).toBeUndefined();
    });

    it('numbers processes and codes stores in the order they appear', () => {
        const result = expectImported(
            importRows(
                'Login,datastore,User_Tbl,Details,',
                'Registration,datastore,Audit_Tbl,,Entry',
                'Login,datastore,Audit_Tbl,,Entry'
            )
        );

        const processes = result.nodes.filter((node) => node.type === 'process');
        expect(processes.map((process) => [process.label, process.processNumber])).toEqual([
            ['Login', '1.0'],
            ['Registration', '2.0'],
        ]);

        const stores = result.nodes.filter((node) => node.type === 'datastore');
        expect(stores.map((store) => [store.label, store.storeCode])).toEqual([
            ['User_Tbl', 'D1'],
            ['Audit_Tbl', 'D2'],
        ]);
    });

    it('connects two processes named in the same file', () => {
        const result = expectImported(
            importRows(
                'AI Diagnosis,process,Manage Recommendation,,Diagnosis Result',
                'Manage Recommendation,datastore,Advisory_Tbl,,Recommendation'
            )
        );

        expect(result.processCount).toBe(2);

        const diagnosis = result.nodes.find((node) => node.label === 'AI Diagnosis')!;
        const recommendation = result.nodes.find((node) => node.label === 'Manage Recommendation')!;
        const flow = result.edges.find((edge) => edge.label === 'Diagnosis Result')!;

        expect(flow.sourceNodeId).toBe(diagnosis.id);
        expect(flow.targetNodeId).toBe(recommendation.id);
    });

    it('accepts the column and type spellings a spreadsheet produces', () => {
        const result = importDecompositionFromCsv(
            ['Process,Kind,Connects To,In Flow,Out Flow', 'Login,External Entity,Admin,Creds,Ack'].join('\n'),
            1
        );

        expect(labelsOf(result)).toEqual(['Creds', 'Ack']);
    });

    it('imports onto whichever level it is given', () => {
        const result = expectImported(
            importDecompositionFromCsv([HEADER, 'Verify,entity,Admin,Query,Answer'].join('\n'), 2)
        );

        expect(result.nodes.every((node) => node.level === 2)).toBe(true);
        expect(result.edges.every((edge) => edge.level === 2)).toBe(true);
    });

    it('rejects a file with no usable header', () => {
        const result = importDecompositionFromCsv('a,b,c\n1,2,3', 1);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.problems[0]).toContain('process');
            expect(result.problems[0]).toContain('type');
        }
    });

    it('reports every bad row at once, with line numbers', () => {
        const result = importRows(
            ',entity,Admin,Query,Answer',
            'Login,pigeon,Admin,Query,Answer',
            'Login,entity,,Query,Answer',
            'Login,entity,Admin,,'
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;

        expect(result.problems).toHaveLength(4);
        expect(result.problems[0]).toContain('Line 2');
        expect(result.problems[1]).toContain('Line 3');
        expect(result.problems[1]).toContain('pigeon');
        expect(result.problems[2]).toContain('Line 4');
        expect(result.problems[3]).toContain('Line 5');
    });

    it('rejects a process flowing to itself', () => {
        const result = importRows('Login,process,Login,Query,Answer');

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.problems[0]).toContain('itself');
    });

    it('rejects an empty file and a header with no rows', () => {
        expect(importDecompositionFromCsv('', 1).ok).toBe(false);
        expect(importDecompositionFromCsv(HEADER, 1).ok).toBe(false);
    });

    it('lays the shipped example out without a single overlap', () => {
        const csvText = readFileSync('public/examples/level-1-example.csv', 'utf8');
        const result = expectImported(importDecompositionFromCsv(csvText, 1));

        expect(result.processCount).toBeGreaterThan(1);
        expect(result.flowCount).toBeGreaterThan(10);

        // The example is what a new user sees first, so it has to come out of
        // the layout as cleanly as anything built by hand.
        const layout = planDecomposedLevelLayout(result.nodes, result.edges);
        expect(layout.flows.size).toBe(result.edges.length);

        const segments: { id: string; a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
        layout.flows.forEach((route, id) => {
            for (let index = 0; index < route.points.length - 1; index++) {
                segments.push({ id, a: route.points[index], b: route.points[index + 1] });
            }
        });

        const overlap = (a1: number, a2: number, b1: number, b2: number) =>
            Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2));

        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const a = segments[i];
                const b = segments[j];
                if (a.id === b.id) continue;

                const bothHorizontal = a.a.y === a.b.y && b.a.y === b.b.y && a.a.y === b.a.y;
                const bothVertical = a.a.x === a.b.x && b.a.x === b.b.x && a.a.x === b.a.x;

                if (bothHorizontal) expect(overlap(a.a.x, a.b.x, b.a.x, b.b.x)).toBeLessThanOrEqual(0.5);
                if (bothVertical) expect(overlap(a.a.y, a.b.y, b.a.y, b.b.y)).toBeLessThanOrEqual(0.5);
            }
        }
    });
});
