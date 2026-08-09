import { useState, useEffect } from 'react';
import { Plus, Trash2, ArrowRight, Download, Upload } from 'lucide-react';
import { useDiagramStore } from '../diagram_state/public_interface';
import { pickAndReadTextFile } from '../diagram_persistence/public_interface';
import { type EntityNode, type ProcessNode } from '../data_flow_diagram_model/public_interface';
import {
    calculateProcessNodePosition,
    DEFAULT_ENTITY_TEXT_SIZE_PX,
    DEFAULT_FLOW_LABEL_TEXT_SIZE_PX,
    MAX_TEXT_SIZE_PX,
    MIN_PROCESS_DIAMETER,
    MIN_TEXT_SIZE_PX,
    planContextDiagramLayout,
} from '../diagram_canvas/public_interface';
import { importContextDiagramFromCsv, type ContextCsvImportSummary } from './importContextDiagramFromCsv';
import styles from './ContextDiagramForm.module.css';

/** Ships in `public/`, so it follows the app's base path when deployed. */
const EXAMPLE_CSV_URL = `${import.meta.env.BASE_URL}examples/context-diagram-example.csv`;

interface TextSizeFieldProps {
    label: string;
    value: number;
    onChange: (sizeInPixels: number) => void;
}

/**
 * A typed font size in pixels.
 *
 * A number field rather than a slider: a diagram destined for a large print or a
 * high-resolution export may need type an order of magnitude bigger than the
 * on-screen default, which is an awkward range to drag through.
 *
 * The typed text is held locally while editing so that a half-typed or
 * temporarily out-of-range value does not get pushed onto every node; the diagram
 * is updated only once the value parses and fits the allowed range.
 */
function TextSizeField({ label, value, onChange }: TextSizeFieldProps) {
    const [draft, setDraft] = useState<string | null>(null);

    const commit = (text: string) => {
        const parsed = Number.parseInt(text, 10);
        if (Number.isNaN(parsed)) return;
        onChange(Math.min(MAX_TEXT_SIZE_PX, Math.max(MIN_TEXT_SIZE_PX, parsed)));
    };

    return (
        <label className={styles.textSizeField}>
            <span className={styles.textSizeLabel}>{label}</span>
            <span className={styles.textSizeInputWrapper}>
                <input
                    type="number"
                    min={MIN_TEXT_SIZE_PX}
                    max={MAX_TEXT_SIZE_PX}
                    step={1}
                    value={draft ?? value}
                    onChange={(e) => {
                        setDraft(e.target.value);
                        commit(e.target.value);
                    }}
                    onBlur={() => setDraft(null)}
                    className={styles.textSizeInput}
                />
                <span className={styles.textSizeUnit}>px</span>
            </span>
        </label>
    );
}

export const ContextDiagramForm = () => {
    const diagram = useDiagramStore((state) => state.diagram);
    const addNode = useDiagramStore((state) => state.addNode);
    const updateNode = useDiagramStore((state) => state.updateNode);
    const removeNode = useDiagramStore((state) => state.removeNode);
    const addEdge = useDiagramStore((state) => state.addEdge);
    const removeEdge = useDiagramStore((state) => state.removeEdge);
    const setDiagramName = useDiagramStore((state) => state.setDiagramName);
    const replaceLevel = useDiagramStore((state) => state.replaceLevel);
    const setEntityTextSizeForLevel = useDiagramStore((state) => state.setEntityTextSizeForLevel);
    const setFlowLabelTextSizeForLevel = useDiagramStore((state) => state.setFlowLabelTextSizeForLevel);

    const [entityName, setEntityName] = useState('');
    const [inFlowName, setInFlowName] = useState('');
    const [outFlowName, setOutFlowName] = useState('');
    const [selectedEntityId, setSelectedEntityId] = useState<string>('');
    const [importProblems, setImportProblems] = useState<string[]>([]);
    const [importSummary, setImportSummary] = useState<ContextCsvImportSummary | null>(null);

    // Ensure Process 0.0 exists.
    //
    // The existence check reads the store directly rather than the `diagram`
    // captured by this render: StrictMode runs an effect twice against the same
    // closure, which with a stale snapshot would add a second node under the
    // same `p-0.0` id.
    useEffect(() => {
        const currentNodes = useDiagramStore.getState().diagram.nodes;
        const contextProcessExists = currentNodes.some(
            n => n.type === 'process' && n.level === 0 && n.processNumber === '0.0'
        );
        if (contextProcessExists) return;

        const mainProcess: ProcessNode = {
            id: 'p-0.0',
            type: 'process',
            label: 'System',
            processNumber: '0.0',
            level: 0,
            // Derived from the diameter so the circle is centred on the point the
            // entity ring is built around.
            position: calculateProcessNodePosition(MIN_PROCESS_DIAMETER),
        };
        addNode(mainProcess);
    }, [diagram.nodes, addNode]);

    const mainProcess = diagram.nodes.find(
        (n): n is ProcessNode => n.type === 'process' && n.level === 0 && n.processNumber === '0.0'
    );
    const entities = diagram.nodes.filter(
        (n): n is EntityNode => n.type === 'entity' && n.level === 0
    );
    const flows = diagram.edges.filter(e => e.level === 0);

    // Text sizes are applied across the level, so the first element's value is
    // representative; it falls back to the default on an empty diagram.
    const entityTextSize = entities[0]?.textSize ?? DEFAULT_ENTITY_TEXT_SIZE_PX;
    const flowLabelTextSize = flows[0]?.labelTextSize ?? DEFAULT_FLOW_LABEL_TEXT_SIZE_PX;

    const handleSystemNameChange = (name: string) => {
        if (mainProcess) {
            updateNode(mainProcess.id, { label: name });
            setDiagramName(name);
        }
    };

    const handleAddEntity = () => {
        if (!entityName.trim()) return;

        // Plan the ring as it will be once this entity joins it, then take the
        // slot that was made for it. The existing entities keep their current
        // positions — re-laying them out would move boxes the user has dragged.
        const flowCountsIncludingNewEntity = [
            ...entities.map((entity) => ({
                inFlowCount: flows.filter((flow) => flow.sourceNodeId === entity.id).length,
                outFlowCount: flows.filter((flow) => flow.targetNodeId === entity.id).length,
            })),
            { inFlowCount: 0, outFlowCount: 0 },
        ];

        // Ring the circle where it actually is, which is not the default centre if
        // it has been dragged or has grown.
        const currentProcessDiameter = mainProcess?.diameter ?? MIN_PROCESS_DIAMETER;
        const placement = planContextDiagramLayout(flowCountsIncludingNewEntity, {
            processCenter: mainProcess
                ? {
                    x: mainProcess.position.x + currentProcessDiameter / 2,
                    y: mainProcess.position.y + currentProcessDiameter / 2,
                }
                : undefined,
        });
        const newEntityPlacement = placement.entities[placement.entities.length - 1];

        const newNode: EntityNode = {
            id: `e-${crypto.randomUUID().slice(0, 4)}`,
            type: 'entity',
            label: entityName,
            level: 0,
            position: newEntityPlacement.position,
            width: newEntityPlacement.size,
            height: newEntityPlacement.size,
        };

        addNode(newNode);
        setEntityName('');
    };

    /**
     * Replaces Level 0 with the contents of a CSV file.
     *
     * Import replaces rather than merges: a spreadsheet describes the whole
     * context diagram, and appending to what is already there would silently
     * produce duplicate entities. Levels 1 and 2 are left alone.
     */
    const handleImportCsv = async () => {
        setImportProblems([]);
        setImportSummary(null);

        let picked;
        try {
            picked = await pickAndReadTextFile('.csv,text/csv');
        } catch {
            setImportProblems(['That file could not be read.']);
            return;
        }
        if (!picked) return;

        const result = importContextDiagramFromCsv(picked.text, {
            existingContextProcess: mainProcess,
        });

        if (!result.ok) {
            setImportProblems(result.problems);
            return;
        }

        const hasExistingWork = entities.length > 0 || flows.length > 0;
        if (hasExistingWork) {
            const isConfirmed = window.confirm(
                `Import ${result.entityCount} entities and ${result.flowPairCount} flow pairs from ` +
                `"${picked.fileName}"?\n\nThis replaces everything on Level 0. Levels 1 and 2 are not affected.`
            );
            if (!isConfirmed) return;
        }

        replaceLevel(0, result.nodes, result.edges);
        if (result.systemName) setDiagramName(result.systemName);

        setImportSummary({
            systemName: result.systemName,
            entityCount: result.entityCount,
            flowPairCount: result.flowPairCount,
        });
    };

    const handleAddFlow = () => {
        // MANDATORY: Both IN-flow and OUT-flow names are required (FlowPair rule)
        if (!inFlowName.trim() || !outFlowName.trim() || !selectedEntityId || !mainProcess) return;

        // Generate shared pairId to link the two flows
        const pairId = `pair-${crypto.randomUUID().slice(0, 6)}`;

        // Add In Flow (Entity -> Process)
        const inEdgeId = `df-${crypto.randomUUID().slice(0, 4)}`;
        addEdge({
            id: inEdgeId,
            type: 'dataflow',
            label: inFlowName,
            sourceNodeId: selectedEntityId,
            targetNodeId: mainProcess.id,
            sourceHandle: inEdgeId,
            targetHandle: inEdgeId,
            level: 0,
            pairId: pairId
        });

        // Add Out Flow (Process -> Entity)
        const outEdgeId = `df-${crypto.randomUUID().slice(0, 4)}`;
        addEdge({
            id: outEdgeId,
            type: 'dataflow',
            label: outFlowName,
            sourceNodeId: mainProcess.id,
            targetNodeId: selectedEntityId,
            sourceHandle: outEdgeId,
            targetHandle: outEdgeId,
            level: 0,
            pairId: pairId
        });

        setInFlowName('');
        setOutFlowName('');
    };

    // Delete both flows in a pair (no orphan flows allowed)
    const handleDeleteFlowPair = (flowId: string) => {
        const flow = diagram.edges.find(e => e.id === flowId);
        if (!flow) return;

        // If flow has a pairId, delete both flows in the pair
        if (flow.pairId) {
            const pairedFlows = diagram.edges.filter(e => e.pairId === flow.pairId);
            pairedFlows.forEach(f => removeEdge(f.id));
        } else {
            // Legacy orphan flow - just delete it
            removeEdge(flowId);
        }
    };

    return (
        <div className={styles.sidebar}>
            <div className={styles.header}>
                <h2 className={styles.title}>Level 0: Context</h2>
                <p className={styles.subtitle}>Define the system boundary and external interactions.</p>

                <div className={styles.formGroup}>
                    <label className={styles.label}>System Name</label>
                    <input
                        type="text"
                        className={styles.input}
                        value={mainProcess?.label || ''}
                        onChange={(e) => handleSystemNameChange(e.target.value)}
                        placeholder="e.g. Restaurant ERP"
                    />
                </div>

                {/* Text sizing. Typed rather than dragged, because a diagram being
                    exported at a large size may need type far bigger than a
                    slider's range would offer. */}
                <div className={styles.textSizeGrid}>
                    <TextSizeField
                        label="Process text"
                        value={mainProcess?.textSize ?? 16}
                        onChange={(size) => mainProcess && updateNode(mainProcess.id, { textSize: size })}
                    />
                    <TextSizeField
                        label="Entity text"
                        value={entityTextSize}
                        onChange={(size) => setEntityTextSizeForLevel(0, size)}
                    />
                    <TextSizeField
                        label="Flow labels"
                        value={flowLabelTextSize}
                        onChange={(size) => setFlowLabelTextSizeForLevel(0, size)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>Divider Position: {mainProcess?.dividerPosition ?? 15}%</label>
                    <input
                        type="range"
                        min="10"
                        max="40"
                        value={mainProcess?.dividerPosition ?? 15}
                        onChange={(e) => mainProcess && updateNode(mainProcess.id, { dividerPosition: parseInt(e.target.value) })}
                        className={styles.slider}
                    />
                </div>
            </div>

            <div className={styles.content}>
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>
                        <span className={`${styles.badge} ${styles.badgePurple}`}></span>
                        Import from CSV
                    </h3>

                    <p className={styles.importHint}>
                        One row per flow pair, with the columns <code>entity</code>,{' '}
                        <code>in_flow</code>, and <code>out_flow</code>. Both flow names are
                        required — a context flow always names what the entity sends and what it
                        gets back. An optional <code>system</code> column names the system.
                    </p>

                    <div className={styles.importActions}>
                        <button onClick={handleImportCsv} className={styles.importButton}>
                            <Upload size={16} /> Choose CSV file
                        </button>
                        <a
                            href={EXAMPLE_CSV_URL}
                            download="context-diagram-example.csv"
                            className={styles.exampleLink}
                        >
                            <Download size={14} /> Example file
                        </a>
                    </div>

                    {importProblems.length > 0 && (
                        <ul className={styles.importProblemList}>
                            {importProblems.map((problem) => (
                                <li key={problem} className={styles.importProblem}>{problem}</li>
                            ))}
                        </ul>
                    )}

                    {importSummary && (
                        <p className={styles.importSuccess}>
                            Imported {importSummary.entityCount} entit
                            {importSummary.entityCount === 1 ? 'y' : 'ies'} and{' '}
                            {importSummary.flowPairCount} flow pair
                            {importSummary.flowPairCount === 1 ? '' : 's'}.
                        </p>
                    )}
                </section>

                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>
                        <span className={`${styles.badge} ${styles.badgeGreen}`}></span>
                        1. External Entities
                    </h3>
                    <div className={styles.inputRow}>
                        <input
                            type="text"
                            value={entityName}
                            onChange={(e) => setEntityName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddEntity()}
                            placeholder="Entity Name (e.g. User)"
                            className={styles.inputFlex}
                        />
                        <button onClick={handleAddEntity} className={styles.addButton}>
                            <Plus size={18} />
                        </button>
                    </div>

                    <ul className={styles.list}>
                        {entities.map(entity => (
                            <li key={entity.id} className={styles.listItem}>
                                <span>{entity.label}</span>
                                <button onClick={() => removeNode(entity.id)} className={styles.deleteButton}>
                                    <Trash2 size={16} />
                                </button>
                            </li>
                        ))}
                        {entities.length === 0 && <p className={styles.emptyState}>No entities added yet.</p>}
                    </ul>
                </section>

                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>
                        <span className={`${styles.badge} ${styles.badgeBlue}`}></span>
                        2. Data Flows
                    </h3>

                    <div className={styles.flowBox}>
                        <div className={styles.flowSelects}>
                            <select
                                value={selectedEntityId}
                                onChange={(e) => setSelectedEntityId(e.target.value)}
                                className={styles.flowSelectLarge}
                                style={{ width: '100%', marginBottom: '10px' }}
                            >
                                <option value="">Select Entity...</option>
                                {entities.map(e => (
                                    <option key={e.id} value={e.id}>{e.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* IN FLOW INPUT */}
                        <div className={styles.flowInputGroup}>
                            <label className={styles.flowLabel}>In Flow (From Entity)</label>
                            <input
                                type="text"
                                value={inFlowName}
                                onChange={(e) => setInFlowName(e.target.value)}
                                placeholder="e.g. Request"
                                className={styles.flowInput}
                            />
                        </div>

                        {/* OUT FLOW INPUT */}
                        <div className={styles.flowInputGroup}>
                            <label className={styles.flowLabel}>Out Flow (To Entity)</label>
                            <input
                                type="text"
                                value={outFlowName}
                                onChange={(e) => setOutFlowName(e.target.value)}
                                placeholder="e.g. Response"
                                className={styles.flowInput}
                            />
                        </div>

                        <button
                            onClick={handleAddFlow}
                            disabled={!inFlowName.trim() || !outFlowName.trim() || !selectedEntityId}
                            className={styles.flowAddButton}
                        >
                            Add Flow Pair <ArrowRight size={16} />
                        </button>
                    </div>

                    <div className={styles.flowList}>
                        {entities.map(entity => {
                            // Get all flows for this entity
                            const entityFlows = flows.filter(f =>
                                f.sourceNodeId === entity.id || f.targetNodeId === entity.id
                            );

                            if (entityFlows.length === 0) return null;

                            // Group by pair to avoid showing duplicates
                            const pairIds = new Set<string>();
                            const uniquePairs: { inFlow?: typeof entityFlows[0]; outFlow?: typeof entityFlows[0] }[] = [];

                            entityFlows.forEach(flow => {
                                if (flow.pairId && pairIds.has(flow.pairId)) return;
                                if (flow.pairId) pairIds.add(flow.pairId);

                                const pairedFlow = flow.pairId
                                    ? entityFlows.find(f => f.pairId === flow.pairId && f.id !== flow.id)
                                    : undefined;

                                const isInput = flow.targetNodeId === mainProcess?.id;
                                uniquePairs.push({
                                    inFlow: isInput ? flow : pairedFlow,
                                    outFlow: isInput ? pairedFlow : flow
                                });
                            });

                            return (
                                <div key={entity.id} className={styles.entityFlowGroup}>
                                    <div className={styles.entityGroupHeader}>
                                        <span className={styles.entityGroupName}>{entity.label}</span>
                                        <span className={styles.entityFlowCount}>{uniquePairs.length} pair{uniquePairs.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className={styles.entityFlowItems}>
                                        {uniquePairs.map((pair, idx) => (
                                            <div key={pair.inFlow?.id || pair.outFlow?.id || idx} className={styles.flowPairItem}>
                                                <div className={styles.flowPairRow}>
                                                    {pair.inFlow && (
                                                        <div className={styles.flowItemCompact}>
                                                            <span className={`${styles.flowBadge} ${styles.flowBadgeIn}`}>IN</span>
                                                            <span className={styles.flowName}>{pair.inFlow.label}</span>
                                                        </div>
                                                    )}
                                                    {pair.outFlow && (
                                                        <div className={styles.flowItemCompact}>
                                                            <span className={`${styles.flowBadge} ${styles.flowBadgeOut}`}>OUT</span>
                                                            <span className={styles.flowName}>{pair.outFlow.label}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteFlowPair(pair.inFlow?.id || pair.outFlow?.id || '')}
                                                    className={styles.flowDeleteButton}
                                                    title="Delete flow pair"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
};
