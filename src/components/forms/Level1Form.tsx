import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useDiagramStore } from '../../store/useDiagramStore';
import { type EntityNode, type ProcessNode, type DataStoreNode } from '../../core/types';
import styles from './Level1Form.module.css';

interface FlowDefinition {
    id: string;
    entityId: string;
    label: string;
}

interface DatastoreInteraction {
    id: string;
    datastoreId: string;
    inLabel: string;
    outLabel: string;
}

interface ProcessFlow {
    id: string;
    targetProcessId: string;
    direction: 'to' | 'from';
    label: string;
}

interface ProcessDefinition {
    id: string;
    number: string;
    name: string;
    entityInputs: FlowDefinition[];
    entityOutputs: FlowDefinition[];
    datastoreInteractions: DatastoreInteraction[];
    processFlows: ProcessFlow[];
}

export const Level1Form = () => {
    const { diagram, addNode, removeNode, addEdge, removeEdge } = useDiagramStore();

    // Section A: Global elements
    const [entityName, setEntityName] = useState('');
    const [datastoreName, setDatastoreName] = useState('');

    // Section B: Process definitions
    const [processes, setProcesses] = useState<ProcessDefinition[]>([]);
    const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);

    // Get existing nodes from diagram
    const existingEntities = diagram.nodes.filter(n => n.type === 'entity' && n.level === 1) as EntityNode[];
    const existingDatastores = diagram.nodes.filter(n => n.type === 'datastore' && n.level === 1) as DataStoreNode[];
    const existingProcesses = diagram.nodes.filter(n => n.type === 'process' && n.level === 1) as ProcessNode[];

    // ===== SECTION A: GLOBAL DEFINITIONS =====

    const handleAddEntity = () => {
        if (!entityName.trim()) return;

        const yOffset = existingEntities.length * 120;
        const newNode: EntityNode = {
            id: `e1-${crypto.randomUUID().slice(0, 4)}`,
            type: 'entity',
            label: entityName,
            level: 1,
            position: { x: 100, y: 100 + yOffset }
        };

        addNode(newNode);
        setEntityName('');
    };

    const handleAddDatastore = () => {
        if (!datastoreName.trim()) return;

        const storeCode = `D${existingDatastores.length + 1}`;
        const yOffset = existingDatastores.length * 100;
        const newNode: DataStoreNode = {
            id: `ds1-${crypto.randomUUID().slice(0, 4)}`,
            type: 'datastore',
            label: datastoreName,
            storeCode: storeCode,
            level: 1,
            position: { x: 750, y: 100 + yOffset }
        };

        addNode(newNode);
        setDatastoreName('');
    };

    // ===== SECTION B: PROCESS DEFINITIONS =====

    const handleAddProcess = () => {
        const processNumber = `${processes.length + 1}.0`;
        const newProcess: ProcessDefinition = {
            id: `proc-${crypto.randomUUID().slice(0, 4)}`,
            number: processNumber,
            name: '',
            entityInputs: [],
            entityOutputs: [],
            datastoreInteractions: [],
            processFlows: []
        };

        setProcesses([...processes, newProcess]);

        // Create process node on canvas
        const yOffset = existingProcesses.length * 150;
        const newNode: ProcessNode = {
            id: newProcess.id,
            type: 'process',
            label: 'New Process',
            processNumber: processNumber,
            level: 1,
            position: { x: 450, y: 100 + yOffset }
        };
        addNode(newNode);

        // Auto-expand new process
        setExpandedProcessId(newProcess.id);
    };

    const handleUpdateProcessName = (processId: string, name: string) => {
        setProcesses(processes.map(p =>
            p.id === processId ? { ...p, name } : p
        ));

        // Update node on canvas
        const node = diagram.nodes.find(n => n.id === processId) as ProcessNode;
        if (node) {
            addNode({ ...node, label: name || 'New Process' });
        }
    };

    const handleDeleteProcess = (processId: string) => {
        // Remove all edges associated with this process
        const edgesToRemove = diagram.edges.filter(e =>
            e.sourceNodeId === processId || e.targetNodeId === processId
        );
        edgesToRemove.forEach(e => removeEdge(e.id));

        // Remove process node
        removeNode(processId);

        // Remove from state
        setProcesses(processes.filter(p => p.id !== processId));
    };

    // ===== ENTITY FLOWS =====

    const handleAddEntityInput = (processId: string, entityId: string, label: string) => {
        if (!entityId || !label.trim()) return;

        const flowId = `flow-${crypto.randomUUID().slice(0, 4)}`;

        // Update process definition
        setProcesses(processes.map(p =>
            p.id === processId
                ? { ...p, entityInputs: [...p.entityInputs, { id: flowId, entityId, label }] }
                : p
        ));

        // Create edge: Entity → Process
        addEdge({
            id: flowId,
            type: 'dataflow',
            label,
            sourceNodeId: entityId,
            targetNodeId: processId,
            level: 1
        });
    };

    const handleAddEntityOutput = (processId: string, entityId: string, label: string) => {
        if (!entityId || !label.trim()) return;

        const flowId = `flow-${crypto.randomUUID().slice(0, 4)}`;

        // Update process definition
        setProcesses(processes.map(p =>
            p.id === processId
                ? { ...p, entityOutputs: [...p.entityOutputs, { id: flowId, entityId, label }] }
                : p
        ));

        // Create edge: Process → Entity
        addEdge({
            id: flowId,
            type: 'dataflow',
            label,
            sourceNodeId: processId,
            targetNodeId: entityId,
            level: 1
        });
    };

    const handleDeleteEntityFlow = (processId: string, flowId: string, type: 'input' | 'output') => {
        // Remove edge
        removeEdge(flowId);

        // Update process definition
        setProcesses(processes.map(p =>
            p.id === processId
                ? {
                    ...p,
                    entityInputs: type === 'input' ? p.entityInputs.filter(f => f.id !== flowId) : p.entityInputs,
                    entityOutputs: type === 'output' ? p.entityOutputs.filter(f => f.id !== flowId) : p.entityOutputs
                }
                : p
        ));
    };

    // ===== DATASTORE INTERACTIONS (Bidirectional) =====

    const handleAddDatastoreInteraction = (processId: string, datastoreId: string, inLabel: string, outLabel: string) => {
        if (!datastoreId || !inLabel.trim() || !outLabel.trim()) return;

        const interactionId = `int-${crypto.randomUUID().slice(0, 4)}`;
        const inFlowId = `${interactionId}-in`;
        const outFlowId = `${interactionId}-out`;

        // Update process definition
        setProcesses(processes.map(p =>
            p.id === processId
                ? {
                    ...p,
                    datastoreInteractions: [...p.datastoreInteractions, {
                        id: interactionId,
                        datastoreId,
                        inLabel,
                        outLabel
                    }]
                }
                : p
        ));

        // Create TWO edges: Datastore → Process (IN) and Process → Datastore (OUT)
        addEdge({
            id: inFlowId,
            type: 'dataflow',
            label: inLabel,
            sourceNodeId: datastoreId,
            targetNodeId: processId,
            level: 1
        });

        addEdge({
            id: outFlowId,
            type: 'dataflow',
            label: outLabel,
            sourceNodeId: processId,
            targetNodeId: datastoreId,
            level: 1
        });
    };

    const handleDeleteDatastoreInteraction = (processId: string, interactionId: string) => {
        // Remove both edges
        removeEdge(`${interactionId}-in`);
        removeEdge(`${interactionId}-out`);

        // Update process definition
        setProcesses(processes.map(p =>
            p.id === processId
                ? { ...p, datastoreInteractions: p.datastoreInteractions.filter(i => i.id !== interactionId) }
                : p
        ));
    };

    // ===== PROCESS-TO-PROCESS FLOWS =====

    const handleAddProcessFlow = (processId: string, targetProcessId: string, direction: 'to' | 'from', label: string) => {
        if (!targetProcessId || !label.trim()) return;

        const flowId = `flow-${crypto.randomUUID().slice(0, 4)}`;

        // Update process definition
        setProcesses(processes.map(p =>
            p.id === processId
                ? { ...p, processFlows: [...p.processFlows, { id: flowId, targetProcessId, direction, label }] }
                : p
        ));

        // Create edge based on direction
        addEdge({
            id: flowId,
            type: 'dataflow',
            label,
            sourceNodeId: direction === 'to' ? processId : targetProcessId,
            targetNodeId: direction === 'to' ? targetProcessId : processId,
            level: 1
        });
    };

    const handleDeleteProcessFlow = (processId: string, flowId: string) => {
        removeEdge(flowId);
        setProcesses(processes.map(p =>
            p.id === processId
                ? { ...p, processFlows: p.processFlows.filter(f => f.id !== flowId) }
                : p
        ));
    };

    return (
        <div className={styles.sidebar}>
            <div className={styles.header}>
                <h2 className={styles.title}>Level 1 DFD</h2>
                <p className={styles.subtitle}>Process-Centric Design</p>
            </div>

            <div className={styles.content}>
                {/* SECTION A: GLOBAL DEFINITIONS */}
                <section className={styles.globalSection}>
                    <h3 className={styles.globalTitle}>Global Elements</h3>

                    {/* Entities */}
                    <div className={styles.globalSubsection}>
                        <label className={styles.label}>1. External Entities</label>
                        <div className={styles.inputRow}>
                            <input
                                type="text"
                                value={entityName}
                                onChange={(e) => setEntityName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddEntity()}
                                placeholder="Entity name (e.g., ADMIN)"
                                className={styles.inputFlex}
                            />
                            <button onClick={handleAddEntity} className={styles.addButton}>
                                <Plus size={18} />
                            </button>
                        </div>
                        <ul className={styles.list}>
                            {existingEntities.map(entity => (
                                <li key={entity.id} className={styles.listItem}>
                                    <span>{entity.label}</span>
                                    <button onClick={() => removeNode(entity.id)} className={styles.deleteButton}>
                                        <Trash2 size={16} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Data Stores */}
                    <div className={styles.globalSubsection}>
                        <label className={styles.label}>2. Data Stores</label>
                        <div className={styles.inputRow}>
                            <input
                                type="text"
                                value={datastoreName}
                                onChange={(e) => setDatastoreName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddDatastore()}
                                placeholder="Data store name (e.g., tbl_users_mst)"
                                className={styles.inputFlex}
                            />
                            <button onClick={handleAddDatastore} className={styles.addButton}>
                                <Plus size={18} />
                            </button>
                        </div>
                        <ul className={styles.list}>
                            {existingDatastores.map(store => (
                                <li key={store.id} className={styles.listItem}>
                                    <span>{store.storeCode} - {store.label}</span>
                                    <button onClick={() => removeNode(store.id)} className={styles.deleteButton}>
                                        <Trash2 size={16} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* SECTION B: PROCESS DEFINITIONS */}
                <section className={styles.processSection}>
                    <div className={styles.processSectionHeader}>
                        <h3 className={styles.globalTitle}>Processes</h3>
                        <button onClick={handleAddProcess} className={styles.addProcessButton}>
                            <Plus size={16} /> Add Process
                        </button>
                    </div>

                    {processes.map(process => (
                        <ProcessAccordion
                            key={process.id}
                            process={process}
                            isExpanded={expandedProcessId === process.id}
                            onToggle={() => setExpandedProcessId(expandedProcessId === process.id ? null : process.id)}
                            onUpdateName={(name) => handleUpdateProcessName(process.id, name)}
                            onDelete={() => handleDeleteProcess(process.id)}
                            entities={existingEntities}
                            datastores={existingDatastores}
                            otherProcesses={existingProcesses.filter(p => p.id !== process.id)}
                            onAddEntityInput={(entityId, label) => handleAddEntityInput(process.id, entityId, label)}
                            onAddEntityOutput={(entityId, label) => handleAddEntityOutput(process.id, entityId, label)}
                            onDeleteEntityFlow={(flowId, type) => handleDeleteEntityFlow(process.id, flowId, type)}
                            onAddDatastoreInteraction={(dsId, inLabel, outLabel) =>
                                handleAddDatastoreInteraction(process.id, dsId, inLabel, outLabel)}
                            onDeleteDatastoreInteraction={(intId) => handleDeleteDatastoreInteraction(process.id, intId)}
                            onAddProcessFlow={(targetId, direction, label) =>
                                handleAddProcessFlow(process.id, targetId, direction, label)}
                            onDeleteProcessFlow={(flowId) => handleDeleteProcessFlow(process.id, flowId)}
                        />
                    ))}

                    {processes.length === 0 && (
                        <p className={styles.emptyState}>No processes added yet. Click "+ Add Process" to begin.</p>
                    )}
                </section>
            </div>
        </div>
    );
};

// ===== PROCESS ACCORDION COMPONENT =====

interface ProcessAccordionProps {
    process: ProcessDefinition;
    isExpanded: boolean;
    onToggle: () => void;
    onUpdateName: (name: string) => void;
    onDelete: () => void;
    entities: EntityNode[];
    datastores: DataStoreNode[];
    otherProcesses: ProcessNode[];
    onAddEntityInput: (entityId: string, label: string) => void;
    onAddEntityOutput: (entityId: string, label: string) => void;
    onDeleteEntityFlow: (flowId: string, type: 'input' | 'output') => void;
    onAddDatastoreInteraction: (datastoreId: string, inLabel: string, outLabel: string) => void;
    onDeleteDatastoreInteraction: (interactionId: string) => void;
    onAddProcessFlow: (targetProcessId: string, direction: 'to' | 'from', label: string) => void;
    onDeleteProcessFlow: (flowId: string) => void;
}

const ProcessAccordion = ({
    process,
    isExpanded,
    onToggle,
    onUpdateName,
    onDelete,
    entities,
    datastores,
    otherProcesses,
    onAddEntityInput,
    onAddEntityOutput,
    onDeleteEntityFlow,
    onAddDatastoreInteraction,
    onDeleteDatastoreInteraction,
    onAddProcessFlow,
    onDeleteProcessFlow
}: ProcessAccordionProps) => {
    const [newEntityInput, setNewEntityInput] = useState({ entityId: '', label: '' });
    const [newEntityOutput, setNewEntityOutput] = useState({ entityId: '', label: '' });
    const [newDsInteraction, setNewDsInteraction] = useState({ datastoreId: '', inLabel: '', outLabel: '' });
    const [newProcessFlow, setNewProcessFlow] = useState({ targetProcessId: '', direction: 'to' as 'to' | 'from', label: '' });

    const handleAddEntityInput = () => {
        onAddEntityInput(newEntityInput.entityId, newEntityInput.label);
        setNewEntityInput({ entityId: '', label: '' });
    };

    const handleAddEntityOutput = () => {
        onAddEntityOutput(newEntityOutput.entityId, newEntityOutput.label);
        setNewEntityOutput({ entityId: '', label: '' });
    };

    const handleAddDsInteraction = () => {
        onAddDatastoreInteraction(newDsInteraction.datastoreId, newDsInteraction.inLabel, newDsInteraction.outLabel);
        setNewDsInteraction({ datastoreId: '', inLabel: '', outLabel: '' });
    };

    const handleAddProcessFlow = () => {
        onAddProcessFlow(newProcessFlow.targetProcessId, newProcessFlow.direction, newProcessFlow.label);
        setNewProcessFlow({ targetProcessId: '', direction: 'to', label: '' });
    };

    const totalFlows = process.entityInputs.length + process.entityOutputs.length +
        process.datastoreInteractions.length + process.processFlows.length;

    return (
        <div className={styles.accordion}>
            {/* Accordion Header */}
            <div className={styles.accordionHeader}>
                <button onClick={onToggle} className={styles.accordionToggle}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
                <div className={styles.accordionTitle}>
                    <span className={styles.processNumber}>{process.number}</span>
                    <input
                        type="text"
                        value={process.name}
                        onChange={(e) => onUpdateName(e.target.value)}
                        placeholder="Process name..."
                        className={styles.processNameInput}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
                <span className={styles.flowCount}>{totalFlows} flows</span>
                <button onClick={onDelete} className={styles.deleteButton}>
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Accordion Body */}
            {isExpanded && (
                <div className={styles.accordionBody}>
                    {/* Entity Inputs */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Entity Inputs</h4>
                        <div className={styles.flowForm}>
                            <select
                                value={newEntityInput.entityId}
                                onChange={(e) => setNewEntityInput({ ...newEntityInput, entityId: e.target.value })}
                                className={styles.flowSelect}
                            >
                                <option value="">Select entity...</option>
                                {entities.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                            </select>
                            <input
                                type="text"
                                value={newEntityInput.label}
                                onChange={(e) => setNewEntityInput({ ...newEntityInput, label: e.target.value })}
                                placeholder="Flow label"
                                className={styles.flowInput}
                            />
                            <button onClick={handleAddEntityInput} className={styles.addFlowButton}>
                                <Plus size={16} />
                            </button>
                        </div>
                        <ul className={styles.flowList}>
                            {process.entityInputs.map(flow => {
                                const entity = entities.find(e => e.id === flow.entityId);
                                return (
                                    <li key={flow.id} className={styles.flowItem}>
                                        <span>{entity?.label} → {flow.label}</span>
                                        <button onClick={() => onDeleteEntityFlow(flow.id, 'input')} className={styles.deleteButton}>
                                            <Trash2 size={14} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Entity Outputs */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Entity Outputs</h4>
                        <div className={styles.flowForm}>
                            <select
                                value={newEntityOutput.entityId}
                                onChange={(e) => setNewEntityOutput({ ...newEntityOutput, entityId: e.target.value })}
                                className={styles.flowSelect}
                            >
                                <option value="">Select entity...</option>
                                {entities.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                            </select>
                            <input
                                type="text"
                                value={newEntityOutput.label}
                                onChange={(e) => setNewEntityOutput({ ...newEntityOutput, label: e.target.value })}
                                placeholder="Flow label"
                                className={styles.flowInput}
                            />
                            <button onClick={handleAddEntityOutput} className={styles.addFlowButton}>
                                <Plus size={16} />
                            </button>
                        </div>
                        <ul className={styles.flowList}>
                            {process.entityOutputs.map(flow => {
                                const entity = entities.find(e => e.id === flow.entityId);
                                return (
                                    <li key={flow.id} className={styles.flowItem}>
                                        <span>{flow.label} → {entity?.label}</span>
                                        <button onClick={() => onDeleteEntityFlow(flow.id, 'output')} className={styles.deleteButton}>
                                            <Trash2 size={14} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Datastore Interactions */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Data Store Interactions</h4>
                        <div className={styles.dsForm}>
                            <select
                                value={newDsInteraction.datastoreId}
                                onChange={(e) => setNewDsInteraction({ ...newDsInteraction, datastoreId: e.target.value })}
                                className={styles.flowSelect}
                            >
                                <option value="">Select data store...</option>
                                {datastores.map(ds => <option key={ds.id} value={ds.id}>{ds.storeCode} - {ds.label}</option>)}
                            </select>
                            <input
                                type="text"
                                value={newDsInteraction.inLabel}
                                onChange={(e) => setNewDsInteraction({ ...newDsInteraction, inLabel: e.target.value })}
                                placeholder="IN label (from store)"
                                className={styles.flowInput}
                            />
                            <input
                                type="text"
                                value={newDsInteraction.outLabel}
                                onChange={(e) => setNewDsInteraction({ ...newDsInteraction, outLabel: e.target.value })}
                                placeholder="OUT label (to store)"
                                className={styles.flowInput}
                            />
                            <button onClick={handleAddDsInteraction} className={styles.addFlowButton}>
                                <Plus size={16} />
                            </button>
                        </div>
                        <ul className={styles.flowList}>
                            {process.datastoreInteractions.map(interaction => {
                                const ds = datastores.find(d => d.id === interaction.datastoreId);
                                return (
                                    <li key={interaction.id} className={styles.flowItem}>
                                        <span>⇄ {ds?.storeCode}: IN "{interaction.inLabel}" / OUT "{interaction.outLabel}"</span>
                                        <button onClick={() => onDeleteDatastoreInteraction(interaction.id)} className={styles.deleteButton}>
                                            <Trash2 size={14} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Process-to-Process Flows */}
                    {otherProcesses.length > 0 && (
                        <div className={styles.flowSection}>
                            <h4 className={styles.flowSectionTitle}>Process Flows</h4>
                            <div className={styles.flowForm}>
                                <select
                                    value={newProcessFlow.direction}
                                    onChange={(e) => setNewProcessFlow({ ...newProcessFlow, direction: e.target.value as 'to' | 'from' })}
                                    className={styles.flowSelectSmall}
                                >
                                    <option value="to">To</option>
                                    <option value="from">From</option>
                                </select>
                                <select
                                    value={newProcessFlow.targetProcessId}
                                    onChange={(e) => setNewProcessFlow({ ...newProcessFlow, targetProcessId: e.target.value })}
                                    className={styles.flowSelect}
                                >
                                    <option value="">Select process...</option>
                                    {otherProcesses.map(p => <option key={p.id} value={p.id}>{p.processNumber} - {p.label}</option>)}
                                </select>
                                <input
                                    type="text"
                                    value={newProcessFlow.label}
                                    onChange={(e) => setNewProcessFlow({ ...newProcessFlow, label: e.target.value })}
                                    placeholder="Flow label"
                                    className={styles.flowInput}
                                />
                                <button onClick={handleAddProcessFlow} className={styles.addFlowButton}>
                                    <Plus size={16} />
                                </button>
                            </div>
                            <ul className={styles.flowList}>
                                {process.processFlows.map(flow => {
                                    const targetProcess = otherProcesses.find(p => p.id === flow.targetProcessId);
                                    return (
                                        <li key={flow.id} className={styles.flowItem}>
                                            <span>
                                                {flow.direction === 'to' ? '→' : '←'} {targetProcess?.processNumber}: {flow.label}
                                            </span>
                                            <button onClick={() => onDeleteProcessFlow(flow.id)} className={styles.deleteButton}>
                                                <Trash2 size={14} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
