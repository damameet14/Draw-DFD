import { useState, useEffect } from 'react';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import { useDiagramStore } from '../../store/useDiagramStore';
import { type EntityNode, type ProcessNode } from '../../core/types';
import styles from './Level0Form.module.css';

export const Level0Form = () => {
    const { diagram, addNode, updateNode, removeNode, addEdge, removeEdge, setDiagramName } = useDiagramStore();

    const [entityName, setEntityName] = useState('');
    const [inFlowName, setInFlowName] = useState('');
    const [outFlowName, setOutFlowName] = useState('');
    const [selectedEntityId, setSelectedEntityId] = useState<string>('');

    // Ensure Process 0.0 exists
    useEffect(() => {
        const process00 = diagram.nodes.find(n => n.type === 'process' && (n as ProcessNode).processNumber === '0.0');
        if (!process00) {
            const mainProcess: ProcessNode = {
                id: 'p-0.0',
                type: 'process',
                label: 'System',
                processNumber: '0.0',
                level: 0,
                position: { x: 450, y: 350 }
            };
            addNode(mainProcess);
        }
    }, [diagram.nodes, addNode]);

    const mainProcess = diagram.nodes.find(n => n.type === 'process' && (n as ProcessNode).processNumber === '0.0') as ProcessNode | undefined;
    const entities = diagram.nodes.filter(n => n.type === 'entity' && n.level === 0);
    const flows = diagram.edges.filter(e => e.level === 0);

    const handleSystemNameChange = (name: string) => {
        if (mainProcess) {
            updateNode(mainProcess.id, { label: name });
            setDiagramName(name);
        }
    };

    const handleAddEntity = () => {
        if (!entityName.trim()) return;

        // Process center on canvas
        const PROCESS_CENTER = { x: 450, y: 350 };
        const ENTITY_DISTANCE = 280; // Distance from process center to entity center
        const ENTITY_SIZE = 120;

        // Calculate the entity's index and which quadrant it belongs to
        const entityIndex = entities.length;
        const quadrantIndex = entityIndex % 4;
        const entitiesInQuadrantBefore = Math.floor(entityIndex / 4);

        // Count total entities that will be in each quadrant after this one is added
        const totalAfter = entityIndex + 1;
        const entitiesPerQuadrant: number[] = [0, 0, 0, 0];
        for (let i = 0; i < totalAfter; i++) {
            entitiesPerQuadrant[i % 4]++;
        }

        const entitiesInThisQuadrant = entitiesPerQuadrant[quadrantIndex];
        const sectionSize = 90 / entitiesInThisQuadrant;

        // Quadrant start angles (0° at 12 o'clock)
        // RIGHT: 0-90, BOTTOM: 90-180, LEFT: 180-270, TOP: 270-360
        const quadrantStarts = [270, 0, 90, 180]; // TOP, RIGHT, BOTTOM, LEFT
        const S_q = quadrantStarts[quadrantIndex];

        // k = index of this entity within its quadrant (0-based)
        const k = entitiesInQuadrantBefore;

        // Calculate section based on quadrant
        // TOP/BOTTOM: first entity at END of quadrant (near 360° and 180°)
        // RIGHT/LEFT: first entity at START of quadrant (near 0° and 180°)
        let sectionCenter: number;
        if (quadrantIndex === 0 || quadrantIndex === 2) {
            // TOP or BOTTOM: k=0 at end
            sectionCenter = S_q + 90 - (k + 0.5) * sectionSize;
        } else {
            // RIGHT or LEFT: k=0 at start
            sectionCenter = S_q + (k + 0.5) * sectionSize;
        }

        // Convert angle to canvas position
        // 0° at 12 o'clock, clockwise: angle 0 = top, 90 = right, 180 = bottom, 270 = left
        const angleRad = (sectionCenter - 90) * (Math.PI / 180);
        const x = PROCESS_CENTER.x + ENTITY_DISTANCE * Math.cos(angleRad) - ENTITY_SIZE / 2;
        const y = PROCESS_CENTER.y + ENTITY_DISTANCE * Math.sin(angleRad) - ENTITY_SIZE / 2;

        const position = { x: Math.round(x), y: Math.round(y) };

        const newNode: EntityNode = {
            id: `e-${crypto.randomUUID().slice(0, 4)}`,
            type: 'entity',
            label: entityName,
            level: 0,
            position: position
        };

        addNode(newNode);
        setEntityName('');
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
            </div>

            <div className={styles.content}>
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
                        {flows.map(flow => {
                            const source = diagram.nodes.find(n => n.id === flow.sourceNodeId);
                            const target = diagram.nodes.find(n => n.id === flow.targetNodeId);
                            const isInput = target?.id === mainProcess?.id;

                            return (
                                <div key={flow.id} className={styles.flowItem}>
                                    <div className={`${styles.flowBadge} ${isInput ? styles.flowBadgeIn : styles.flowBadgeOut}`}>
                                        {isInput ? 'IN' : 'OUT'}
                                    </div>
                                    <div className={styles.flowDetails}>
                                        <div className={styles.flowName}>{flow.label}</div>
                                        <div className={styles.flowSource}>
                                            {isInput ? `From: ${source?.label}` : `To: ${target?.label}`}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteFlowPair(flow.id)}
                                        className={styles.flowDeleteButton}
                                        title={flow.pairId ? "Delete flow pair" : "Delete flow"}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
};
