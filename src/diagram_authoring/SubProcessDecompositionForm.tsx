import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useDiagramStore } from '../diagram_state/public_interface';
import {
    type DFDNode,
    type DataStoreNode,
    type EntityNode,
    type ExternalProcessNode,
    type ProcessNode,
} from '../data_flow_diagram_model/public_interface';
import {
    createFlowEdgeId,
    createInteractionPairId,
    deriveProcessAuthoringModels,
    selectDataStores,
    selectFlowParticipants,
    type FlowParticipantNode,
    type ProcessAuthoringModel,
    type ProcessFlowDirection,
} from './deriveProcessAuthoringModel';
import styles from './DecompositionForm.module.css';

const LEVEL = 2;

/**
 * Level 2 authoring: the sub-processes of one parent process, plus the
 * participants, data stores, and flows they involve.
 *
 * Sub-process numbers and data store codes are entered by hand here rather than
 * allocated, because a Level 2 diagram inherits its numbering from its parent
 * (a decomposition of 3.0 numbers its children 3.1, 3.2, ...).
 *
 * Like the Level 1 form, the displayed lists are derived from the store; only
 * in-progress input text is local.
 */
export const SubProcessDecompositionForm = () => {
    const diagram = useDiagramStore((state) => state.diagram);
    const addNode = useDiagramStore((state) => state.addNode);
    const updateNode = useDiagramStore((state) => state.updateNode);
    const removeNode = useDiagramStore((state) => state.removeNode);
    const addEdge = useDiagramStore((state) => state.addEdge);
    const removeEdge = useDiagramStore((state) => state.removeEdge);
    const setDiagramName = useDiagramStore((state) => state.setDiagramName);

    const [parentProcessNumber, setParentProcessNumber] = useState('');
    const [parentProcessName, setParentProcessName] = useState('');

    const [participantName, setParticipantName] = useState('');
    const [participantType, setParticipantType] = useState<'entity' | 'process_ref'>('entity');
    const [datastoreName, setDatastoreName] = useState('');

    const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);

    const existingParticipants = selectFlowParticipants(diagram, LEVEL);
    const existingDatastores = selectDataStores(diagram, LEVEL);
    const processModels = deriveProcessAuthoringModels(diagram, LEVEL);

    // --- Actions: Global ---

    const handleUpdateTitle = () => {
        setDiagramName(`Level 2 - ${parentProcessNumber} ${parentProcessName}`);
    };

    const handleAddParticipant = () => {
        if (!participantName.trim()) return;

        const shared = {
            id: `ext_${crypto.randomUUID().slice(0, 4)}`,
            label: participantName,
            level: LEVEL,
            position: { x: 100, y: 100 + existingParticipants.length * 180 },
        } as const;

        const newNode: DFDNode =
            participantType === 'entity'
                ? ({ ...shared, type: 'entity' } satisfies EntityNode)
                : ({ ...shared, type: 'process_ref' } satisfies ExternalProcessNode);

        addNode(newNode);
        setParticipantName('');
    };

    const handleAddDatastore = () => {
        if (!datastoreName.trim()) return;

        const newNode: DataStoreNode = {
            id: `ds2-${crypto.randomUUID().slice(0, 4)}`,
            type: 'datastore',
            label: datastoreName,
            // Level 2 store codes are inherited from the parent diagram, so they
            // are typed in rather than allocated.
            storeCode: '',
            level: LEVEL,
            position: { x: 1100, y: 100 + existingDatastores.length * 150 },
        };

        addNode(newNode);
        setDatastoreName('');
    };

    // --- Actions: Sub-Processes ---

    const handleAddSubProcess = () => {
        const newProcess: ProcessNode = {
            id: `sp_${crypto.randomUUID().slice(0, 4)}`,
            type: 'process',
            label: 'New Process',
            processNumber: '',
            level: LEVEL,
            position: { x: 600, y: 100 + processModels.length * 300 },
        };

        addNode(newProcess);
        setExpandedProcessId(newProcess.id);
    };

    // --- Actions: Flows ---

    const handleAddParticipantFlow = (
        processId: string,
        participantId: string,
        label: string,
        direction: 'input' | 'output'
    ) => {
        if (!participantId || !label.trim()) return;

        addEdge({
            id: createFlowEdgeId(),
            type: 'dataflow',
            label,
            sourceNodeId: direction === 'input' ? participantId : processId,
            targetNodeId: direction === 'input' ? processId : participantId,
            level: LEVEL,
        });
    };

    /**
     * Level 2 records reads and writes independently, so an interaction may
     * carry only one of the two edges.
     */
    const handleAddDataStoreFlow = (
        processId: string,
        dataStoreId: string,
        label: string,
        direction: 'read' | 'write'
    ) => {
        if (!dataStoreId || !label.trim()) return;

        const pairId = createInteractionPairId();

        addEdge({
            id: direction === 'read' ? `${pairId}-in` : `${pairId}-out`,
            type: 'dataflow',
            label,
            sourceNodeId: direction === 'read' ? dataStoreId : processId,
            targetNodeId: direction === 'read' ? processId : dataStoreId,
            level: LEVEL,
            pairId,
        });
    };

    const handleAddSubProcessFlow = (
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
                <h2 className={styles.title}>Level 2 DFD</h2>
                <p className={styles.subtitle}>Sub-Process Breakdown</p>

                {/* Parent Process Context */}
                <div style={{ marginTop: '12px', padding: '8px', background: '#f1f5f9', borderRadius: '4px' }}>
                    <label className={styles.label} style={{ fontSize: '11px' }}>PARENT PROCESS</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <input
                            type="text"
                            placeholder="3.0"
                            value={parentProcessNumber}
                            onChange={e => setParentProcessNumber(e.target.value)}
                            onBlur={handleUpdateTitle}
                            style={{ width: '50px' }}
                            className={styles.flowInput}
                        />
                        <input
                            type="text"
                            placeholder="Process Name"
                            value={parentProcessName}
                            onChange={e => setParentProcessName(e.target.value)}
                            onBlur={handleUpdateTitle}
                            className={styles.flowInput}
                            style={{ flex: 1 }}
                        />
                    </div>
                </div>
            </div>

            <div className={styles.content}>

                {/* SECTION 1: PARTICIPANTS */}
                <section className={styles.globalSection}>
                    <h3 className={styles.globalTitle}>1. Participants</h3>
                    <div className={styles.inputRow}>
                        <select
                            value={participantType}
                            onChange={(e) => setParticipantType(e.target.value as 'entity' | 'process_ref')}
                            className={styles.flowSelectSmall}
                            style={{ width: '80px' }}
                        >
                            <option value="entity">Entity</option>
                            <option value="process_ref">Ref</option>
                        </select>
                        <input
                            type="text"
                            value={participantName}
                            onChange={(e) => setParticipantName(e.target.value)}
                            placeholder={participantType === 'entity' ? "Entity Name" : "Process 4.0"}
                            className={styles.inputFlex}
                            onKeyDown={e => e.key === 'Enter' && handleAddParticipant()}
                        />
                        <button onClick={handleAddParticipant} className={styles.addButton}><Plus size={18} /></button>
                    </div>
                    <ul className={styles.list}>
                        {existingParticipants.map(p => (
                            <li key={p.id} className={styles.listItem}>
                                <span style={{ fontSize: '0.8em', color: '#64748b', marginRight: '6px' }}>
                                    [{p.type === 'process_ref' ? 'REF' : 'ENT'}]
                                </span>
                                <span>{p.label}</span>
                                <button onClick={() => removeNode(p.id)} className={styles.deleteButton}><Trash2 size={16} /></button>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* SECTION 2: DATASTORES */}
                <section className={styles.globalSection}>
                    <h3 className={styles.globalTitle}>2. Data Stores</h3>
                    <div className={styles.inputRow}>
                        <input
                            type="text"
                            value={datastoreName}
                            onChange={(e) => setDatastoreName(e.target.value)}
                            placeholder="Datastore Name"
                            className={styles.inputFlex}
                            onKeyDown={e => e.key === 'Enter' && handleAddDatastore()}
                        />
                        <button onClick={handleAddDatastore} className={styles.addButton}><Plus size={18} /></button>
                    </div>
                    <ul className={styles.list}>
                        {existingDatastores.map(ds => (
                            <li key={ds.id} className={styles.listItem}>
                                <input
                                    type="text"
                                    value={ds.storeCode || ''}
                                    onChange={(e) => updateNode(ds.id, { storeCode: e.target.value })}
                                    placeholder="ID"
                                    className={styles.flowInput}
                                    style={{ width: '40px', marginRight: '6px', textAlign: 'center' }}
                                />
                                <span style={{ flex: 1 }}>{ds.label}</span>
                                <button onClick={() => removeNode(ds.id)} className={styles.deleteButton}><Trash2 size={16} /></button>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* SECTION 3: SUB-PROCESSES */}
                <section className={styles.processSection}>
                    <div className={styles.processSectionHeader}>
                        <h3 className={styles.globalTitle}>3. Sub-Processes</h3>
                        <button onClick={handleAddSubProcess} className={styles.addProcessButton}>
                            <Plus size={16} /> Add Process
                        </button>
                    </div>

                    {processModels.map(model => (
                        <SubProcessAccordion
                            key={model.process.id}
                            model={model}
                            isExpanded={expandedProcessId === model.process.id}
                            onToggle={() => setExpandedProcessId(
                                expandedProcessId === model.process.id ? null : model.process.id
                            )}
                            onUpdateName={(name) => updateNode(model.process.id, { label: name })}
                            onUpdateNumber={(num) => updateNode(model.process.id, { processNumber: num })}
                            onDelete={() => removeNode(model.process.id)}
                            participants={existingParticipants}
                            datastores={existingDatastores}
                            otherProcesses={processModels
                                .map(other => other.process)
                                .filter(other => other.id !== model.process.id)}
                            onAddParticipantInput={(id, label) =>
                                handleAddParticipantFlow(model.process.id, id, label, 'input')}
                            onAddParticipantOutput={(id, label) =>
                                handleAddParticipantFlow(model.process.id, id, label, 'output')}
                            onAddDataStoreRead={(dsId, label) =>
                                handleAddDataStoreFlow(model.process.id, dsId, label, 'read')}
                            onAddDataStoreWrite={(dsId, label) =>
                                handleAddDataStoreFlow(model.process.id, dsId, label, 'write')}
                            onAddSubProcessFlow={(tid, dir, label) =>
                                handleAddSubProcessFlow(model.process.id, tid, dir, label)}
                            onDeleteFlow={removeEdge}
                        />
                    ))}

                    {processModels.length === 0 && (
                        <p className={styles.emptyState}>No sub-processes added yet. Click "+ Add Process" to begin.</p>
                    )}
                </section>
            </div>
        </div>
    );
};

// --- Helper Component: SubProcessAccordion ---

interface AccordionProps {
    model: ProcessAuthoringModel;
    isExpanded: boolean;
    onToggle: () => void;
    onUpdateName: (name: string) => void;
    onUpdateNumber: (number: string) => void;
    onDelete: () => void;
    participants: FlowParticipantNode[];
    datastores: DataStoreNode[];
    otherProcesses: ProcessNode[];
    onAddParticipantInput: (id: string, label: string) => void;
    onAddParticipantOutput: (id: string, label: string) => void;
    onAddDataStoreRead: (dataStoreId: string, label: string) => void;
    onAddDataStoreWrite: (dataStoreId: string, label: string) => void;
    onAddSubProcessFlow: (targetId: string, dir: ProcessFlowDirection, label: string) => void;
    onDeleteFlow: (edgeId: string) => void;
}

const SubProcessAccordion = ({
    model, isExpanded, onToggle, onUpdateName, onUpdateNumber, onDelete,
    participants, datastores, otherProcesses,
    onAddParticipantInput, onAddParticipantOutput,
    onAddDataStoreRead, onAddDataStoreWrite,
    onAddSubProcessFlow, onDeleteFlow,
}: AccordionProps) => {

    // Each add-flow row keeps its own draft. The read and write rows previously
    // shared one data store field, so choosing a store in one changed the other.
    const [inputState, setInputState] = useState({
        entInId: '', entInLabel: '',
        entOutId: '', entOutLabel: '',
        dsReadId: '', dsReadLabel: '',
        dsWriteId: '', dsWriteLabel: '',
        procId: '', procDir: 'to' as ProcessFlowDirection, procLabel: '',
    });

    const dataStoreReads = model.dataStoreInteractions.filter(i => !!i.readEdgeId);
    const dataStoreWrites = model.dataStoreInteractions.filter(i => !!i.writeEdgeId);

    return (
        <div className={styles.accordion}>
            <div className={styles.accordionHeader}>
                <button onClick={onToggle} className={styles.accordionToggle}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
                <div className={styles.accordionTitle}>
                    <input
                        type="text"
                        value={model.process.processNumber}
                        onChange={e => onUpdateNumber(e.target.value)}
                        placeholder="3.1"
                        className={styles.processNumberInput}
                        style={{ width: '40px', fontWeight: 'bold', marginRight: '8px', border: '1px solid #ccc', borderRadius: '4px', padding: '2px 4px' }}
                    />
                    <input
                        type="text"
                        value={model.process.label}
                        onChange={e => onUpdateName(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className={styles.processNameInput}
                        placeholder="Name..."
                    />
                </div>
                <span className={styles.flowCount}>{model.totalFlowCount} flows</span>
                <button onClick={onDelete} className={styles.deleteButton}><Trash2 size={16} /></button>
            </div>

            {isExpanded && (
                <div className={styles.accordionBody}>
                    {/* Participant Inputs */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Participant Inputs</h4>
                        <div className={styles.flowForm}>
                            <select value={inputState.entInId} onChange={e => setInputState({ ...inputState, entInId: e.target.value })} className={styles.flowSelect}>
                                <option value="">Select participant...</option>
                                {participants.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                            <input type="text" placeholder="Label" value={inputState.entInLabel} onChange={e => setInputState({ ...inputState, entInLabel: e.target.value })} className={styles.flowInput} />
                            <button onClick={() => {
                                onAddParticipantInput(inputState.entInId, inputState.entInLabel);
                                setInputState({ ...inputState, entInId: '', entInLabel: '' });
                            }} className={styles.addFlowButton}><Plus size={16} /></button>
                        </div>
                        <ul className={styles.flowList}>
                            {model.participantInputs.map(f => (
                                <li key={f.edgeId} className={styles.flowItem}>
                                    <span>{participants.find(p => p.id === f.participantId)?.label} → {f.label}</span>
                                    <button onClick={() => onDeleteFlow(f.edgeId)} className={styles.deleteButton}><Trash2 size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Participant Outputs */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Participant Outputs</h4>
                        <div className={styles.flowForm}>
                            <select value={inputState.entOutId} onChange={e => setInputState({ ...inputState, entOutId: e.target.value })} className={styles.flowSelect}>
                                <option value="">Select participant...</option>
                                {participants.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                            <input type="text" placeholder="Label" value={inputState.entOutLabel} onChange={e => setInputState({ ...inputState, entOutLabel: e.target.value })} className={styles.flowInput} />
                            <button onClick={() => {
                                onAddParticipantOutput(inputState.entOutId, inputState.entOutLabel);
                                setInputState({ ...inputState, entOutId: '', entOutLabel: '' });
                            }} className={styles.addFlowButton}><Plus size={16} /></button>
                        </div>
                        <ul className={styles.flowList}>
                            {model.participantOutputs.map(f => (
                                <li key={f.edgeId} className={styles.flowItem}>
                                    <span>{f.label} → {participants.find(p => p.id === f.participantId)?.label}</span>
                                    <button onClick={() => onDeleteFlow(f.edgeId)} className={styles.deleteButton}><Trash2 size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Datastore Inputs (Reading from DS) */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Data Store Inputs (Read)</h4>
                        <div className={styles.flowForm}>
                            <select value={inputState.dsReadId} onChange={e => setInputState({ ...inputState, dsReadId: e.target.value })} className={styles.flowSelect}>
                                <option value="">Select Data Store...</option>
                                {datastores.map(ds => <option key={ds.id} value={ds.id}>{ds.storeCode} {ds.label}</option>)}
                            </select>
                            <input type="text" placeholder="Label" value={inputState.dsReadLabel} onChange={e => setInputState({ ...inputState, dsReadLabel: e.target.value })} className={styles.flowInput} />
                            <button onClick={() => {
                                onAddDataStoreRead(inputState.dsReadId, inputState.dsReadLabel);
                                setInputState({ ...inputState, dsReadId: '', dsReadLabel: '' });
                            }} className={styles.addFlowButton}><Plus size={16} /></button>
                        </div>
                        <ul className={styles.flowList}>
                            {dataStoreReads.map(i => (
                                <li key={i.readEdgeId} className={styles.flowItem}>
                                    <span>← {datastores.find(d => d.id === i.dataStoreId)?.storeCode}: {i.readLabel}</span>
                                    <button onClick={() => onDeleteFlow(i.readEdgeId!)} className={styles.deleteButton}><Trash2 size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Datastore Outputs (Writing to DS) */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Data Store Outputs (Write)</h4>
                        <div className={styles.flowForm}>
                            <select value={inputState.dsWriteId} onChange={e => setInputState({ ...inputState, dsWriteId: e.target.value })} className={styles.flowSelect}>
                                <option value="">Select Data Store...</option>
                                {datastores.map(ds => <option key={ds.id} value={ds.id}>{ds.storeCode} {ds.label}</option>)}
                            </select>
                            <input type="text" placeholder="Label" value={inputState.dsWriteLabel} onChange={e => setInputState({ ...inputState, dsWriteLabel: e.target.value })} className={styles.flowInput} />
                            <button onClick={() => {
                                onAddDataStoreWrite(inputState.dsWriteId, inputState.dsWriteLabel);
                                setInputState({ ...inputState, dsWriteId: '', dsWriteLabel: '' });
                            }} className={styles.addFlowButton}><Plus size={16} /></button>
                        </div>
                        <ul className={styles.flowList}>
                            {dataStoreWrites.map(i => (
                                <li key={i.writeEdgeId} className={styles.flowItem}>
                                    <span>→ {datastores.find(d => d.id === i.dataStoreId)?.storeCode}: {i.writeLabel}</span>
                                    <button onClick={() => onDeleteFlow(i.writeEdgeId!)} className={styles.deleteButton}><Trash2 size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Sub-process Flows */}
                    {otherProcesses.length > 0 && (
                        <div className={styles.flowSection}>
                            <h4 className={styles.flowSectionTitle}>Internal Process Flows</h4>
                            <div className={styles.flowForm}>
                                <select value={inputState.procDir} onChange={e => setInputState({ ...inputState, procDir: e.target.value as ProcessFlowDirection })} className={styles.flowSelectSmall}>
                                    <option value="to">To</option>
                                    <option value="from">From</option>
                                </select>
                                <select value={inputState.procId} onChange={e => setInputState({ ...inputState, procId: e.target.value })} className={styles.flowSelect}>
                                    <option value="">Select process...</option>
                                    {otherProcesses.map(p => <option key={p.id} value={p.id}>{p.processNumber} {p.label}</option>)}
                                </select>
                                <input type="text" placeholder="Label" value={inputState.procLabel} onChange={e => setInputState({ ...inputState, procLabel: e.target.value })} className={styles.flowInput} />
                                <button onClick={() => {
                                    onAddSubProcessFlow(inputState.procId, inputState.procDir, inputState.procLabel);
                                    setInputState({ ...inputState, procId: '', procLabel: '', procDir: 'to' });
                                }} className={styles.addFlowButton}><Plus size={16} /></button>
                            </div>
                            <ul className={styles.flowList}>
                                {model.processFlows.map(f => (
                                    <li key={f.edgeId} className={styles.flowItem}>
                                        <span>{f.direction === 'to' ? '→' : '←'} {otherProcesses.find(p => p.id === f.otherProcessId)?.processNumber}: {f.label}</span>
                                        <button onClick={() => onDeleteFlow(f.edgeId)} className={styles.deleteButton}><Trash2 size={14} /></button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
