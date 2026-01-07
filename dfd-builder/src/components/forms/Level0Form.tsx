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
                position: { x: 400, y: 300 }
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

        // Corner positioning strategy (matching the reference image)
        const positions = [
            { x: 100, y: 100 },   // Top-left
            { x: 700, y: 100 },   // Top-right
            { x: 700, y: 500 },   // Bottom-right
            { x: 100, y: 500 },   // Bottom-left
        ];

        const currentIndex = entities.length % positions.length;
        const position = positions[currentIndex];

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
        if ((!inFlowName.trim() && !outFlowName.trim()) || !selectedEntityId || !mainProcess) return;

        // Add In Flow (Entity -> Process)
        if (inFlowName.trim()) {
            addEdge({
                id: `df-${crypto.randomUUID().slice(0, 4)}`,
                type: 'dataflow',
                label: inFlowName,
                sourceNodeId: selectedEntityId,
                targetNodeId: mainProcess.id,
                level: 0
            });
        }

        // Add Out Flow (Process -> Entity)
        if (outFlowName.trim()) {
            addEdge({
                id: `df-${crypto.randomUUID().slice(0, 4)}`,
                type: 'dataflow',
                label: outFlowName,
                sourceNodeId: mainProcess.id,
                targetNodeId: selectedEntityId,
                level: 0
            });
        }

        setInFlowName('');
        setOutFlowName('');
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
                            disabled={(!inFlowName && !outFlowName) || !selectedEntityId}
                            className={styles.flowAddButton}
                        >
                            Add Flow <ArrowRight size={16} />
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
                                    <button onClick={() => removeEdge(flow.id)} className={styles.flowDeleteButton}>
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
