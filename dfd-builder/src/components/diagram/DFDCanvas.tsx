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

import { ProcessNode } from './ProcessNode';
import { EntityNode } from './EntityNode';
import { DataStoreNode } from './DataStoreNode';
import { CustomOrthogonalEdge } from './CustomOrthogonalEdge';
import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './DFDCanvas.module.css';
import { type DFDLevel } from '../../core/types';

const nodeTypes: NodeTypes = {
    process: ProcessNode,
    entity: EntityNode,
    datastore: DataStoreNode,
    process_ref: EntityNode, // Reusing EntityNode for external process refs for now
};

const edgeTypes: EdgeTypes = {
    orthogonal: CustomOrthogonalEdge,
};

interface DFDCanvasProps {
    currentLevel: DFDLevel;
}

export const DFDCanvas = ({ currentLevel }: DFDCanvasProps) => {
    const { diagram, updateNode } = useDiagramStore();

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
