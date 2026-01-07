import { useCallback, useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    type NodeTypes,
    useNodesState,
    useEdgesState,
    type Edge,
    MarkerType,
    type EdgeTypes
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './DFDCanvas.module.css';
import { type DFDLevel } from '../../core/types';

// Level 0 Components
import { ProcessNode as L0Process } from './level0/ProcessNode';
import { EntityNode as L0Entity } from './level0/EntityNode';
import { DataStoreNode as L0Store } from './level0/DataStoreNode';
import { CustomOrthogonalEdge as L0Edge } from './level0/Level0Edge';

// Level 1 Components
import { ProcessNode as L1Process } from './level1/ProcessNode';
import { EntityNode as L1Entity } from './level1/EntityNode';
import { DataStoreNode as L1Store } from './level1/DataStoreNode';
import { CustomOrthogonalEdge as L1Edge } from './level1/Level1Edge';

// Level 2 Components
import { ProcessNode as L2Process } from './level2/ProcessNode';
import { EntityNode as L2Entity } from './level2/EntityNode';
import { DataStoreNode as L2Store } from './level2/DataStoreNode';
import { CustomOrthogonalEdge as L2Edge } from './level2/Level2Edge';

const level0NodeTypes: NodeTypes = { process: L0Process, entity: L0Entity, datastore: L0Store, process_ref: L0Entity };
const level0EdgeTypes: EdgeTypes = { orthogonal: L0Edge };

const level1NodeTypes: NodeTypes = { process: L1Process, entity: L1Entity, datastore: L1Store, process_ref: L1Entity };
const level1EdgeTypes: EdgeTypes = { orthogonal: L1Edge };

const level2NodeTypes: NodeTypes = { process: L2Process, entity: L2Entity, datastore: L2Store, process_ref: L2Entity };
const level2EdgeTypes: EdgeTypes = { orthogonal: L2Edge };

interface DFDCanvasProps {
    currentLevel: DFDLevel;
}

export const DFDCanvas = ({ currentLevel }: DFDCanvasProps) => {
    const { diagram, updateNode } = useDiagramStore();

    // Select types based on level
    const nodeTypes = currentLevel === 0 ? level0NodeTypes : (currentLevel === 2 ? level2NodeTypes : level1NodeTypes);
    const edgeTypes = currentLevel === 0 ? level0EdgeTypes : (currentLevel === 2 ? level2EdgeTypes : level1EdgeTypes);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    useEffect(() => {
        // Filter nodes and edges by current level
        const levelNodes = diagram.nodes.filter(n => n.level === currentLevel);
        const levelEdges = diagram.edges.filter(e => e.level === currentLevel);

        const mappedNodes = levelNodes.map(n => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: { ...n },
            draggable: true,
            selectable: true,
            focusable: true
        }));

        const mappedEdges: Edge[] = levelEdges.map(e => {
            // Use edge ID as both source and target handle ID
            // This matches the dynamic handles created in ProcessNode and EntityNode
            const sourceHandle = e.id;
            const targetHandle = e.id;

            console.log('Mapping edge:', {
                id: e.id,
                label: e.label,
                source: e.sourceNodeId,
                target: e.targetNodeId,
                sourceHandle,
                targetHandle
            });

            return {
                id: e.id,
                source: e.sourceNodeId,
                target: e.targetNodeId,
                sourceHandle,
                targetHandle,
                label: e.label,
                type: 'orthogonal',
                animated: false,
                style: {
                    stroke: '#1e293b',
                    strokeWidth: 2
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: '#1e293b',
                    width: 25,
                    height: 25
                },
                data: { ...e }
            };
        });

        console.log('Setting edges:', mappedEdges);
        console.log('Setting nodes:', mappedNodes);

        setNodes(mappedNodes);
        setEdges(mappedEdges);
    }, [diagram.nodes, diagram.edges, currentLevel, setNodes, setEdges]);

    const onNodeDragStop = useCallback((_event: any, node: any) => {
        updateNode(node.id, { position: node.position });
    }, [updateNode]);

    return (
        <div className={styles.canvasContainer}>
            <div className={styles.diagramHeader}>
                <h1 className={styles.diagramTitle}>
                    {currentLevel === 0 ? 'Context Level DFD' : currentLevel === 1 ? 'Level 1 DFD' : 'Level 2 DFD'}
                </h1>
            </div>
            <div className={styles.canvasWrapper}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeDragStop={onNodeDragStop}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    minZoom={0.5}
                    maxZoom={1.5}
                    nodesFocusable={true}
                    nodesConnectable={false}
                    selectNodesOnDrag={false}
                    defaultEdgeOptions={{
                        type: 'orthogonal',
                        animated: false,
                        style: { stroke: '#1e293b', strokeWidth: 2 },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: '#1e293b'
                        }
                    }}
                >
                    <Background gap={16} size={1} color="#e2e8f0" />
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    );
};
