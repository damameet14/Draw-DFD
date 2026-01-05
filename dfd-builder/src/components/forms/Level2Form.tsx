import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useDiagramStore } from '../../store/useDiagramStore';
import { type EntityNode, type ProcessNode, type DataStoreNode, type ExternalProcessNode, type DFDNode } from '../../core/types';
import styles from './Level1Form.module.css'; // Reusing Level 1 styles for consistency

interface FlowDefinition {
    id: string;
    targetId: string;
    label: string;
}

interface DatastoreInteraction {
    id: string;
    datastoreId: string;
    inLabel: string;
    outLabel: string;
}

interface SubProcessFlow {
    id: string;
    targetProcessId: string;
    direction: 'to' | 'from';
    label: string;
}

interface SubProcessDefinition {
    id: string;
    number: string;
    name: string;
    entityInputs: FlowDefinition[];
    entityOutputs: FlowDefinition[];
    datastoreInteractions: DatastoreInteraction[];
    subProcessFlows: SubProcessFlow[];
}

export const Level2Form = () => {
    const { diagram, addNode, removeNode, addEdge, removeEdge, setDiagramName } = useDiagramStore();

    // --- State ---
    const [parentProcessNumber, setParentProcessNumber] = useState('');
    const [parentProcessName, setParentProcessName] = useState('');

    const [participantName, setParticipantName] = useState('');
    const [participantType, setParticipantType] = useState<'entity' | 'process_ref'>('entity');
    const [datastoreName, setDatastoreName] = useState('');

    const [subProcesses, setSubProcesses] = useState<SubProcessDefinition[]>([]);
    const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);

    // Filter Level 2 nodes
    const level2Nodes = diagram.nodes.filter(n => n.level === 2);
    const existingEntities = level2Nodes.filter(n => n.type === 'entity' || n.type === 'process_ref') as (EntityNode | ExternalProcessNode)[];
    const existingDatastores = level2Nodes.filter(n => n.type === 'datastore') as DataStoreNode[];
    const existingSubProcesses = level2Nodes.filter(n => n.type === 'process') as ProcessNode[];

    // --- Actions: Global ---

    const handleUpdateTitle = () => {
        const name = `Level 2 - ${parentProcessNumber} ${parentProcessName}`;
        setDiagramName(name);
    };

    const handleAddParticipant = () => {
        if (!participantName.trim()) return;

        const id = `ext_${crypto.randomUUID().slice(0, 4)}`;
        const yOffset = existingEntities.length * 120;

        let newNode: DFDNode;
        if (participantType === 'entity') {
            newNode = {
                id, type: 'entity', label: participantName, level: 2,
                position: { x: 100, y: 100 + yOffset }
            } as EntityNode;
        } else {
            newNode = {
                id, type: 'process_ref', label: participantName, level: 2,
                position: { x: 100, y: 100 + yOffset }
            } as ExternalProcessNode;
        }

        addNode(newNode);
        setParticipantName('');
    };

    const handleAddDatastore = () => {
        if (!datastoreName.trim()) return;

        const storeCode = `D${existingDatastores.length + 1}`;
        const yOffset = existingDatastores.length * 100;
        const newNode: DataStoreNode = {
            id: `ds2-${crypto.randomUUID().slice(0, 4)}`,
            type: 'datastore',
            label: datastoreName,
            storeCode,
            level: 2,
            position: { x: 750, y: 100 + yOffset }
        };

        addNode(newNode);
        setDatastoreName('');
    };

    // --- Actions: Sub-Processes ---

    const handleAddSubProcess = () => {
        const nextNum = existingSubProcesses.length + 1;
        const number = parentProcessNumber ? `${parentProcessNumber}.${nextNum}` : `?.${nextNum}`;

        const newProcess: SubProcessDefinition = {
            id: `sp_${crypto.randomUUID().slice(0, 4)}`,
            number,
            name: '',
            entityInputs: [],
            entityOutputs: [],
            datastoreInteractions: [],
            subProcessFlows: []
        };

        setSubProcesses([...subProcesses, newProcess]);

        // Create node
        const yOffset = existingSubProcesses.length * 150;
        const newNode: ProcessNode = {
            id: newProcess.id,
            type: 'process',
            label: 'New Process',
            processNumber: number,
            level: 2,
            position: { x: 450, y: 100 + yOffset }
        };
        addNode(newNode);
        setExpandedProcessId(newProcess.id);
    };

    const handleUpdateSubProcessName = (id: string, name: string) => {
        setSubProcesses(subProcesses.map(p => p.id === id ? { ...p, name } : p));
        const node = diagram.nodes.find(n => n.id === id);
        if (node) addNode({ ...node, label: name || 'New Process' });
    };

    const handleUpdateSubProcessNumber = (id: string, number: string) => {
        setSubProcesses(subProcesses.map(p => p.id === id ? { ...p, number } : p));
        const node = diagram.nodes.find(n => n.id === id);
        if (node) addNode({ ...node, processNumber: number } as ProcessNode);
    };

    const handleDeleteSubProcess = (id: string) => {
        const edges = diagram.edges.filter(e => e.sourceNodeId === id || e.targetNodeId === id);
        edges.forEach(e => removeEdge(e.id));
        removeNode(id);
        setSubProcesses(subProcesses.filter(p => p.id !== id));
    };

    // --- Actions: Flows (Generic) ---

    // 1. Entity/Participant Flows
    const handleAddEntityInput = (processId: string, entityId: string, label: string) => {
        if (!entityId || !label.trim()) return;
        const flowId = `flow-${crypto.randomUUID().slice(0, 4)}`;

        // Update local state (optional, if we want to track it in subProcesses array, but we rely on diagram state mostly?)
        // The original Level 1 form kept local state in sync. Let's try to mimic that for UI consistency.
        setSubProcesses(subProcesses.map(p => p.id === processId ? {
            ...p, entityInputs: [...p.entityInputs, { id: flowId, targetId: entityId, label }]
        } : p));

        addEdge({
            id: flowId, type: 'dataflow', label, sourceNodeId: entityId, targetNodeId: processId, level: 2
        });
    };

    const handleAddEntityOutput = (processId: string, entityId: string, label: string) => {
        if (!entityId || !label.trim()) return;
        const flowId = `flow-${crypto.randomUUID().slice(0, 4)}`;

        setSubProcesses(subProcesses.map(p => p.id === processId ? {
            ...p, entityOutputs: [...p.entityOutputs, { id: flowId, targetId: entityId, label }]
        } : p));

        addEdge({
            id: flowId, type: 'dataflow', label, sourceNodeId: processId, targetNodeId: entityId, level: 2
        });
    };

    const handleDeleteEntityFlow = (processId: string, flowId: string, type: 'input' | 'output') => {
        removeEdge(flowId);
        setSubProcesses(subProcesses.map(p => p.id === processId ? {
            ...p,
            entityInputs: type === 'input' ? p.entityInputs.filter(f => f.id !== flowId) : p.entityInputs,
            entityOutputs: type === 'output' ? p.entityOutputs.filter(f => f.id !== flowId) : p.entityOutputs
        } : p));
    };

    // 2. Datastore Interactions
    const handleAddDsInteraction = (processId: string, dsId: string, inLabel: string, outLabel: string) => {
        if (!dsId || (!inLabel.trim() && !outLabel.trim())) return; // Require at least one label
        const intId = `int-${crypto.randomUUID().slice(0, 4)}`;

        setSubProcesses(subProcesses.map(p => p.id === processId ? {
            ...p, datastoreInteractions: [...p.datastoreInteractions, { id: intId, datastoreId: dsId, inLabel, outLabel }]
        } : p));

        if (inLabel.trim()) {
            addEdge({ id: `${intId}-in`, type: 'dataflow', label: inLabel, sourceNodeId: dsId, targetNodeId: processId, level: 2 });
        }
        if (outLabel.trim()) {
            addEdge({ id: `${intId}-out`, type: 'dataflow', label: outLabel, sourceNodeId: processId, targetNodeId: dsId, level: 2 });
        }
    };

    const handleDeleteDsInteraction = (processId: string, intId: string) => {
        // Try removing both potential edges
        removeEdge(`${intId}-in`);
        removeEdge(`${intId}-out`);
        setSubProcesses(subProcesses.map(p => p.id === processId ? {
            ...p, datastoreInteractions: p.datastoreInteractions.filter(i => i.id !== intId)
        } : p));
    };

    // 3. Sub-Process Flows
    const handleAddSubProcessFlow = (processId: string, targetId: string, direction: 'to' | 'from', label: string) => {
        if (!targetId || !label.trim()) return;
        const flowId = `flow-${crypto.randomUUID().slice(0, 4)}`;

        setSubProcesses(subProcesses.map(p => p.id === processId ? {
            ...p, subProcessFlows: [...p.subProcessFlows, { id: flowId, targetProcessId: targetId, direction, label }]
        } : p));

        addEdge({
            id: flowId, type: 'dataflow', label,
            sourceNodeId: direction === 'to' ? processId : targetId,
            targetNodeId: direction === 'to' ? targetId : processId,
            level: 2
        });
    };

    const handleDeleteSubProcessFlow = (processId: string, flowId: string) => {
        removeEdge(flowId);
        setSubProcesses(subProcesses.map(p => p.id === processId ? {
            ...p, subProcessFlows: p.subProcessFlows.filter(f => f.id !== flowId)
        } : p));
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
                            onChange={(e) => setParticipantType(e.target.value as any)}
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
                        {existingEntities.map(p => (
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
                                <span>{ds.storeCode} - {ds.label}</span>
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

                    {subProcesses.map(process => (
                        <SubProcessAccordion
                            key={process.id}
                            process={process}
                            isExpanded={expandedProcessId === process.id}
                            onToggle={() => setExpandedProcessId(expandedProcessId === process.id ? null : process.id)}
                            onUpdateName={(name) => handleUpdateSubProcessName(process.id, name)}
                            onUpdateNumber={(num) => handleUpdateSubProcessNumber(process.id, num)}
                            onDelete={() => handleDeleteSubProcess(process.id)}
                            participants={existingEntities}
                            datastores={existingDatastores}
                            otherProcesses={existingSubProcesses.filter(p => p.id !== process.id)}
                            onAddEntityInput={(id, label) => handleAddEntityInput(process.id, id, label)}
                            onAddEntityOutput={(id, label) => handleAddEntityOutput(process.id, id, label)}
                            onDeleteEntityFlow={(fid, type) => handleDeleteEntityFlow(process.id, fid, type)}
                            onAddDsInteraction={(dsId, inL, outL) => handleAddDsInteraction(process.id, dsId, inL, outL)}
                            onDeleteDsInteraction={(iid) => handleDeleteDsInteraction(process.id, iid)}
                            onAddSubProcessFlow={(tid, dir, lab) => handleAddSubProcessFlow(process.id, tid, dir, lab)}
                            onDeleteSubProcessFlow={(fid) => handleDeleteSubProcessFlow(process.id, fid)}
                        />
                    ))}
                </section>
            </div>
        </div>
    );
};

// --- Helper Component: SubProcessAccordion (Similar to Level 1 but types adapted) ---
interface AccordionProps {
    process: SubProcessDefinition;
    isExpanded: boolean;
    onToggle: () => void;
    onUpdateName: (name: string) => void;
    onUpdateNumber: (number: string) => void;
    onDelete: () => void;
    participants: (EntityNode | ExternalProcessNode)[];
    datastores: DataStoreNode[];
    otherProcesses: ProcessNode[];
    onAddEntityInput: (id: string, label: string) => void;
    onAddEntityOutput: (id: string, label: string) => void;
    onDeleteEntityFlow: (flowId: string, type: 'input' | 'output') => void;
    onAddDsInteraction: (dsId: string, inLabel: string, outLabel: string) => void;
    onDeleteDsInteraction: (intId: string) => void;
    onAddSubProcessFlow: (targetId: string, dir: 'to' | 'from', label: string) => void;
    onDeleteSubProcessFlow: (flowId: string) => void;
}

const SubProcessAccordion = ({
    process, isExpanded, onToggle, onUpdateName, onUpdateNumber, onDelete,
    participants, datastores, otherProcesses,
    onAddEntityInput, onAddEntityOutput, onDeleteEntityFlow,
    onAddDsInteraction, onDeleteDsInteraction,
    onAddSubProcessFlow, onDeleteSubProcessFlow
}: AccordionProps) => {

    // Local inputs for adding flows
    const [inputState, setInputState] = useState({
        entInId: '', entInLabel: '',
        entOutId: '', entOutLabel: '',
        dsId: '', dsIn: '', dsOut: '',
        procId: '', procDir: 'to' as 'to' | 'from', procLabel: ''
    });

    const totalFlows = process.entityInputs.length + process.entityOutputs.length +
        process.datastoreInteractions.length + process.subProcessFlows.length;

    return (
        <div className={styles.accordion}>
            <div className={styles.accordionHeader}>
                <button onClick={onToggle} className={styles.accordionToggle}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
                <div className={styles.accordionTitle}>
                    <input
                        type="text"
                        value={process.number}
                        onChange={e => onUpdateNumber(e.target.value)}
                        className={styles.processNumberInput} // New class needed or inline style
                        style={{ width: '40px', fontWeight: 'bold', marginRight: '8px', border: '1px solid #ccc', borderRadius: '4px', padding: '2px 4px' }}
                    />
                    <input
                        type="text"
                        value={process.name}
                        onChange={e => onUpdateName(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className={styles.processNameInput}
                        placeholder="Name..."
                    />
                </div>
                <span className={styles.flowCount}>{totalFlows} flows</span>
                <button onClick={onDelete} className={styles.deleteButton}><Trash2 size={16} /></button>
            </div>

            {isExpanded && (
                <div className={styles.accordionBody}>
                    {/* Entity Inputs */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Participant Inputs</h4>
                        <div className={styles.flowForm}>
                            <select value={inputState.entInId} onChange={e => setInputState({ ...inputState, entInId: e.target.value })} className={styles.flowSelect}>
                                <option value="">Select participant...</option>
                                {participants.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                            <input type="text" placeholder="Label" value={inputState.entInLabel} onChange={e => setInputState({ ...inputState, entInLabel: e.target.value })} className={styles.flowInput} />
                            <button onClick={() => {
                                onAddEntityInput(inputState.entInId, inputState.entInLabel);
                                setInputState({ ...inputState, entInId: '', entInLabel: '' });
                            }} className={styles.addFlowButton}><Plus size={16} /></button>
                        </div>
                        <ul className={styles.flowList}>
                            {process.entityInputs.map(f => (
                                <li key={f.id} className={styles.flowItem}>
                                    <span>{participants.find(p => p.id === f.targetId)?.label} → {f.label}</span>
                                    <button onClick={() => onDeleteEntityFlow(f.id, 'input')} className={styles.deleteButton}><Trash2 size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Entity Outputs */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Participant Outputs</h4>
                        <div className={styles.flowForm}>
                            <select value={inputState.entOutId} onChange={e => setInputState({ ...inputState, entOutId: e.target.value })} className={styles.flowSelect}>
                                <option value="">Select participant...</option>
                                {participants.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                            <input type="text" placeholder="Label" value={inputState.entOutLabel} onChange={e => setInputState({ ...inputState, entOutLabel: e.target.value })} className={styles.flowInput} />
                            <button onClick={() => {
                                onAddEntityOutput(inputState.entOutId, inputState.entOutLabel);
                                setInputState({ ...inputState, entOutId: '', entOutLabel: '' });
                            }} className={styles.addFlowButton}><Plus size={16} /></button>
                        </div>
                        <ul className={styles.flowList}>
                            {process.entityOutputs.map(f => (
                                <li key={f.id} className={styles.flowItem}>
                                    <span>{f.label} → {participants.find(p => p.id === f.targetId)?.label}</span>
                                    <button onClick={() => onDeleteEntityFlow(f.id, 'output')} className={styles.deleteButton}><Trash2 size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    </div>


                    {/* Datastore Inputs (Reading from DS) */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Data Store Inputs (Read)</h4>
                        <div className={styles.flowForm}>
                            <select value={inputState.dsId} onChange={e => setInputState({ ...inputState, dsId: e.target.value })} className={styles.flowSelect}>
                                <option value="">Select Data Store...</option>
                                {datastores.map(ds => <option key={ds.id} value={ds.id}>{ds.storeCode} {ds.label}</option>)}
                            </select>
                            <input type="text" placeholder="Label" value={inputState.dsIn} onChange={e => setInputState({ ...inputState, dsIn: e.target.value })} className={styles.flowInput} />
                            <button onClick={() => {
                                onAddDsInteraction(inputState.dsId, inputState.dsIn, ""); // Only IN label
                                setInputState({ ...inputState, dsId: '', dsIn: '' });
                            }} className={styles.addFlowButton}><Plus size={16} /></button>
                        </div>
                        <ul className={styles.flowList}>
                            {process.datastoreInteractions.filter(i => !!i.inLabel).map(i => (
                                <li key={`${i.id}-in`} className={styles.flowItem}>
                                    <span>← {datastores.find(d => d.id === i.datastoreId)?.storeCode}: {i.inLabel}</span>
                                    <button onClick={() => onDeleteDsInteraction(i.id)} className={styles.deleteButton}><Trash2 size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Datastore Outputs (Writing to DS) */}
                    <div className={styles.flowSection}>
                        <h4 className={styles.flowSectionTitle}>Data Store Outputs (Write)</h4>
                        <div className={styles.flowForm}>
                            <select value={inputState.dsId} onChange={e => setInputState({ ...inputState, dsId: e.target.value })} className={styles.flowSelect}>
                                <option value="">Select Data Store...</option>
                                {datastores.map(ds => <option key={ds.id} value={ds.id}>{ds.storeCode} {ds.label}</option>)}
                            </select>
                            <input type="text" placeholder="Label" value={inputState.dsOut} onChange={e => setInputState({ ...inputState, dsOut: e.target.value })} className={styles.flowInput} />
                            <button onClick={() => {
                                onAddDsInteraction(inputState.dsId, "", inputState.dsOut); // Only OUT label
                                setInputState({ ...inputState, dsId: '', dsOut: '' });
                            }} className={styles.addFlowButton}><Plus size={16} /></button>
                        </div>
                        <ul className={styles.flowList}>
                            {process.datastoreInteractions.filter(i => !!i.outLabel).map(i => (
                                <li key={`${i.id}-out`} className={styles.flowItem}>
                                    <span>→ {datastores.find(d => d.id === i.datastoreId)?.storeCode}: {i.outLabel}</span>
                                    <button onClick={() => onDeleteDsInteraction(i.id)} className={styles.deleteButton}><Trash2 size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Sub-process Flows */}
                    {otherProcesses.length > 0 && (
                        <div className={styles.flowSection}>
                            <h4 className={styles.flowSectionTitle}>Internal Process Flows</h4>
                            <div className={styles.flowForm}>
                                <select value={inputState.procDir} onChange={e => setInputState({ ...inputState, procDir: e.target.value as 'to' | 'from' })} className={styles.flowSelectSmall}>
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
                                {process.subProcessFlows.map(f => (
                                    <li key={f.id} className={styles.flowItem}>
                                        <span>{f.direction === 'to' ? '→' : '←'} {otherProcesses.find(p => p.id === f.targetProcessId)?.processNumber}: {f.label}</span>
                                        <button onClick={() => onDeleteSubProcessFlow(f.id)} className={styles.deleteButton}><Trash2 size={14} /></button>
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
