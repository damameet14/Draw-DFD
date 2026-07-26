import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useDiagramStore } from '../diagram_state/public_interface';
import {
    type DataStoreNode,
    type EntityNode,
    type ProcessNode,
} from '../data_flow_diagram_model/public_interface';
import {
    createFlowEdgeId,
    createInteractionPairId,
    deriveProcessAuthoringModels,
    nextDataStoreCode,
    nextProcessNumber,
    selectDataStores,
    selectFlowParticipants,
    type ProcessAuthoringModel,
    type ProcessFlowDirection,
} from './deriveProcessAuthoringModel';
import styles from './DecompositionForm.module.css';

const LEVEL = 1;

/**
 * Level 1 authoring: the processes that decompose the context process, the data
 * stores they use, and every flow between them.
 *
 * The list of processes and their flows is derived from the store on each
 * render — this component's own state is only the text sitting in its inputs.
 */
export const ProcessDecompositionForm = () => {
    const diagram = useDiagramStore((state) => state.diagram);
    const addNode = useDiagramStore((state) => state.addNode);
    const updateNode = useDiagramStore((state) => state.updateNode);
    const removeNode = useDiagramStore((state) => state.removeNode);
    const addEdge = useDiagramStore((state) => state.addEdge);
    const removeEdge = useDiagramStore((state) => state.removeEdge);

    const [entityName, setEntityName] = useState('');
    const [datastoreName, setDatastoreName] = useState('');
    const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);

    const existingEntities = selectFlowParticipants(diagram, LEVEL);
    const existingDatastores = selectDataStores(diagram, LEVEL);
    const processModels = deriveProcessAuthoringModels(diagram, LEVEL);

    // ===== SECTION A: GLOBAL DEFINITIONS =====

    const handleAddEntity = () => {
        if (!entityName.trim()) return;

        const newNode: EntityNode = {
            id: `e1-${crypto.randomUUID().slice(0, 4)}`,
            type: 'entity',
            label: entityName,
            level: LEVEL,
            position: { x: 100, y: 100 + existingEntities.length * 180 },
        };

        addNode(newNode);
        setEntityName('');
    };

    const handleAddDatastore = () => {
        if (!datastoreName.trim()) return;

        const newNode: DataStoreNode = {
            id: `ds1-${crypto.randomUUID().slice(0, 4)}`,
            type: 'datastore',
            label: datastoreName,
            storeCode: nextDataStoreCode(existingDatastores),
            level: LEVEL,
            position: { x: 1100, y: 100 + existingDatastores.length * 150 },
        };

        addNode(newNode);
        setDatastoreName('');
    };

    // ===== SECTION B: PROCESS DEFINITIONS =====

    const handleAddProcess = () => {
        const newProcess: ProcessNode = {
            id: `proc-${crypto.randomUUID().slice(0, 4)}`,
            type: 'process',
            label: 'New Process',
            processNumber: nextProcessNumber(processModels.map((model) => model.process)),
            level: LEVEL,
            position: { x: 600, y: 100 + processModels.length * 300 },
        };

        addNode(newProcess);
        setExpandedProcessId(newProcess.id);
    };

    // `removeNode` already drops every flow that touched the process.
    const handleDeleteProcess = (processId: string) => removeNode(processId);

    // ===== ENTITY FLOWS =====

    const handleAddParticipantFlow = (
        processId: string,
        entityId: string,
        label: string,
        direction: 'input' | 'output'
    ) => {
        if (!entityId || !label.trim()) return;

        addEdge({
            id: createFlowEdgeId(),
            type: 'dataflow',
            label,
            sourceNodeId: direction === 'input' ? entityId : processId,
            targetNodeId: direction === 'input' ? processId : entityId,
            level: LEVEL,
        });
    };

    // ===== DATASTORE INTERACTIONS (Bidirectional) =====

    const handleAddDatastoreInteraction = (
        processId: string,
        datastoreId: string,
        readLabel: string,
        writeLabel: string
    ) => {
        if (!datastoreId || !readLabel.trim() || !writeLabel.trim()) return;

        // The two edges share a pairId so they can be regrouped into one
        // interaction when the form is rebuilt from the store.
        const pairId = createInteractionPairId();

        addEdge({
            id: `${pairId}-in`,
            type: 'dataflow',
            label: readLabel,
            sourceNodeId: datastoreId,
            targetNodeId: processId,
            level: LEVEL,
            pairId,
        });

        addEdge({
            id: `${pairId}-out`,
            type: 'dataflow',
            label: writeLabel,
            sourceNodeId: processId,
            targetNodeId: datastoreId,
            level: LEVEL,
            pairId,
        });
    };

    const handleDeleteDatastoreInteraction = (interaction: ProcessAuthoringModel['dataStoreInteractions'][number]) => {
        if (interaction.readEdgeId) removeEdge(interaction.readEdgeId);
        if (interaction.writeEdgeId) removeEdge(interaction.writeEdgeId);
    };

    // ===== PROCESS-TO-PROCESS FLOWS =====

    const handleAddProcessFlow = (
        processId: string,
        targetProcessId: string,
        direction: ProcessFlowDirection,
        label: string
    ) => {
        if (!targetProcessId || !label.trim()) return;

        addEdge({
            id: createFlowEdgeId(),
            type: 'dataflow',
            label,
            sourceNodeId: direction === 'to' ? processId : targetProcessId,
            targetNodeId: direction === 'to' ? targetProcessId : processId,
            level: LEVEL,
        });
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

                    {processModels.map(model => (
                        <ProcessAccordion
                            key={model.process.id}
                            model={model}
                            isExpanded={expandedProcessId === model.process.id}
                            onToggle={() => setExpandedProcessId(
                                expandedProcessId === model.process.id ? null : model.process.id
                            )}
                            onUpdateName={(name) => updateNode(model.process.id, { label: name })}
                            onDelete={() => handleDeleteProcess(model.process.id)}
                            entities={existingEntities}
                            datastores={existingDatastores}
                            otherProcesses={processModels
                                .map(other => other.process)
                                .filter(other => other.id !== model.process.id)}
                            onAddEntityInput={(entityId, label) =>
                                handleAddParticipantFlow(model.process.id, entityId, label, 'input')}
                            onAddEntityOutput={(entityId, label) =>
                                handleAddParticipantFlow(model.process.id, entityId, label, 'output')}
                            onDeleteFlow={removeEdge}
                            onAddDatastoreInteraction={(dsId, readLabel, writeLabel) =>
                                handleAddDatastoreInteraction(model.process.id, dsId, readLabel, writeLabel)}
                            onDeleteDatastoreInteraction={handleDeleteDatastoreInteraction}
                            onAddProcessFlow={(targetId, direction, label) =>
                                handleAddProcessFlow(model.process.id, targetId, direction, label)}
                        />
                    ))}

                    {processModels.length === 0 && (
                        <p className={styles.emptyState}>No processes added yet. Click "+ Add Process" to begin.</p>
                    )}
                </section>
            </div>
        </div>
    );
};

// ===== PROCESS ACCORDION COMPONENT =====

interface ProcessAccordionProps {
    model: ProcessAuthoringModel;
    isExpanded: boolean;
    onToggle: () => void;
    onUpdateName: (name: string) => void;
    onDelete: () => void;
    entities: Array<EntityNode | { id: string; label: string }>;
    datastores: DataStoreNode[];
    otherProcesses: ProcessNode[];
    onAddEntityInput: (entityId: string, label: string) => void;
    onAddEntityOutput: (entityId: string, label: string) => void;
    onDeleteFlow: (edgeId: string) => void;
    onAddDatastoreInteraction: (datastoreId: string, readLabel: string, writeLabel: string) => void;
    onDeleteDatastoreInteraction: (
        interaction: ProcessAuthoringModel['dataStoreInteractions'][number]
    ) => void;
    onAddProcessFlow: (
        targetProcessId: string,
        direction: ProcessFlowDirection,
        label: string
    ) => void;
}

const ProcessAccordion = ({
    model,
    isExpanded,
    onToggle,
    onUpdateName,
    onDelete,
    entities,
    datastores,
    otherProcesses,
    onAddEntityInput,
    onAddEntityOutput,
    onDeleteFlow,
    onAddDatastoreInteraction,
    onDeleteDatastoreInteraction,
    onAddProcessFlow,
}: ProcessAccordionProps) => {
    const [newEntityInput, setNewEntityInput] = useState({ entityId: '', label: '' });
    const [newEntityOutput, setNewEntityOutput] = useState({ entityId: '', label: '' });
    const [newDsInteraction, setNewDsInteraction] = useState({ datastoreId: '', inLabel: '', outLabel: '' });
    const [newProcessFlow, setNewProcessFlow] = useState({
        targetProcessId: '',
        direction: 'to' as ProcessFlowDirection,
        label: '',
    });

    const handleAddEntityInput = () => {
        onAddEntityInput(newEntityInput.entityId, newEntityInput.label);
        setNewEntityInput({ entityId: '', label: '' });
    };

    const handleAddEntityOutput = () => {
        onAddEntityOutput(newEntityOutput.entityId, newEntityOutput.label);
        setNewEntityOutput({ entityId: '', label: '' });
    };

    const handleAddDsInteraction = () => {
        onAddDatastoreInteraction(
            newDsInteraction.datastoreId,
            newDsInteraction.inLabel,
            newDsInteraction.outLabel
        );
        setNewDsInteraction({ datastoreId: '', inLabel: '', outLabel: '' });
    };

    const handleAddProcessFlow = () => {
        onAddProcessFlow(newProcessFlow.targetProcessId, newProcessFlow.direction, newProcessFlow.label);
        setNewProcessFlow({ targetProcessId: '', direction: 'to', label: '' });
    };

    return (
        <div className={styles.accordion}>
            {/* Accordion Header */}
            <div className={styles.accordionHeader}>
                <button onClick={onToggle} className={styles.accordionToggle}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
                <div className={styles.accordionTitle}>
                    <span className={styles.processNumber}>{model.process.processNumber}</span>
                    <input
                        type="text"
                        value={model.process.label}
                        onChange={(e) => onUpdateName(e.target.value)}
                        placeholder="Process name..."
                        className={styles.processNameInput}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
                <span className={styles.flowCount}>{model.totalFlowCount} flows</span>
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
                            {model.participantInputs.map(flow => {
                                const entity = entities.find(e => e.id === flow.participantId);
                                return (
                                    <li key={flow.edgeId} className={styles.flowItem}>
                                        <span>{entity?.label} → {flow.label}</span>
                                        <button onClick={() => onDeleteFlow(flow.edgeId)} className={styles.deleteButton}>
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
                            {model.participantOutputs.map(flow => {
                                const entity = entities.find(e => e.id === flow.participantId);
                                return (
                                    <li key={flow.edgeId} className={styles.flowItem}>
                                        <span>{flow.label} → {entity?.label}</span>
                                        <button onClick={() => onDeleteFlow(flow.edgeId)} className={styles.deleteButton}>
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
                            {model.dataStoreInteractions.map(interaction => {
                                const ds = datastores.find(d => d.id === interaction.dataStoreId);
                                return (
                                    <li key={interaction.interactionId} className={styles.flowItem}>
                                        <span>⇄ {ds?.storeCode}: IN "{interaction.readLabel}" / OUT "{interaction.writeLabel}"</span>
                                        <button
                                            onClick={() => onDeleteDatastoreInteraction(interaction)}
                                            className={styles.deleteButton}
                                        >
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
                                    onChange={(e) => setNewProcessFlow({ ...newProcessFlow, direction: e.target.value as ProcessFlowDirection })}
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
                                {model.processFlows.map(flow => {
                                    const targetProcess = otherProcesses.find(p => p.id === flow.otherProcessId);
                                    return (
                                        <li key={flow.edgeId} className={styles.flowItem}>
                                            <span>
                                                {flow.direction === 'to' ? '→' : '←'} {targetProcess?.processNumber}: {flow.label}
                                            </span>
                                            <button onClick={() => onDeleteFlow(flow.edgeId)} className={styles.deleteButton}>
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
