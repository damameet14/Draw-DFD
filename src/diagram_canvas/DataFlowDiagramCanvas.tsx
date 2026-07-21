import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    MarkerType,
    useNodesState,
    useEdgesState,
    type Edge,
    type Node,
    type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useDiagramStore } from '../diagram_state/public_interface';
import { useDiagramVisibilityPreferences } from '../application_shell/public_interface';
import { type DFDLevel } from '../data_flow_diagram_model/public_interface';
import { selectNodeTypesForLevel, dataFlowEdgeTypes } from './canvasNodeAndEdgeRegistry';
import styles from './DataFlowDiagramCanvas.module.css';

const DATA_FLOW_STROKE_COLOR = '#1e293b';
const DATA_FLOW_STROKE_WIDTH = 2;
const SNAP_GRID_SIZE = 20;

const DIAGRAM_TITLE_BY_LEVEL: Record<DFDLevel, string> = {
    0: 'Context Level DFD',
    1: 'Level 1 DFD',
    2: 'Level 2 DFD',
};

interface DataFlowDiagramCanvasProps {
    currentLevel: DFDLevel;
}

/**
 * Renders the slice of the diagram belonging to `currentLevel`.
 *
 * The store holds one diagram covering all levels; this component filters by
 * level and adapts the domain contracts into React Flow's node and edge shapes.
 * It holds no diagram rules — every mutation is delegated to `diagram_state`.
 */
export const DataFlowDiagramCanvas = ({ currentLevel }: DataFlowDiagramCanvasProps) => {
    const diagram = useDiagramStore((state) => state.diagram);
    const updateNode = useDiagramStore((state) => state.updateNode);
    const moveNodeApplyingColumnAlignment = useDiagramStore(
        (state) => state.moveNodeApplyingColumnAlignment
    );
    const { isBackgroundGridVisible } = useDiagramVisibilityPreferences();

    const nodeTypes = useMemo(() => selectNodeTypesForLevel(currentLevel), [currentLevel]);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    useEffect(() => {
        const nodesOnCurrentLevel = diagram.nodes.filter((node) => node.level === currentLevel);
        const edgesOnCurrentLevel = diagram.edges.filter((edge) => edge.level === currentLevel);

        const reactFlowNodes: Node[] = nodesOnCurrentLevel.map((node) => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: { ...node },
            draggable: true,
            selectable: true,
            focusable: true,
        }));

        const reactFlowEdges: Edge[] = edgesOnCurrentLevel.map((edge) => ({
            id: edge.id,
            source: edge.sourceNodeId,
            target: edge.targetNodeId,
            // Node components create one handle per edge, keyed by the edge id,
            // so the handle identifiers are the edge identifier on both ends.
            sourceHandle: edge.id,
            targetHandle: edge.id,
            label: edge.label,
            type: 'orthogonal',
            animated: false,
            style: { stroke: DATA_FLOW_STROKE_COLOR, strokeWidth: DATA_FLOW_STROKE_WIDTH },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: DATA_FLOW_STROKE_COLOR,
                width: 25,
                height: 25,
            },
            data: { ...edge },
        }));

        setNodes(reactFlowNodes);
        setEdges(reactFlowEdges);
    }, [diagram.nodes, diagram.edges, currentLevel, setNodes, setEdges]);

    const onNodeDrag = useCallback<NodeMouseHandler>(
        (_event, node) => moveNodeApplyingColumnAlignment(node.id, node.position, currentLevel),
        [moveNodeApplyingColumnAlignment, currentLevel]
    );

    const onNodeDragStop = useCallback<NodeMouseHandler>(
        (_event, node) => updateNode(node.id, { position: node.position }),
        [updateNode]
    );

    return (
        <div className={styles.canvasContainer}>
            <div className={styles.diagramHeader}>
                <h1 className={styles.diagramTitle}>{DIAGRAM_TITLE_BY_LEVEL[currentLevel]}</h1>
            </div>
            <div className={styles.canvasWrapper}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    nodeTypes={nodeTypes}
                    edgeTypes={dataFlowEdgeTypes}
                    fitView
                    snapToGrid={true}
                    snapGrid={[SNAP_GRID_SIZE, SNAP_GRID_SIZE]}
                    minZoom={0.5}
                    maxZoom={1.5}
                    nodesFocusable={true}
                    nodesConnectable={false}
                    selectNodesOnDrag={false}
                    defaultEdgeOptions={{
                        type: 'orthogonal',
                        animated: false,
                        style: { stroke: DATA_FLOW_STROKE_COLOR, strokeWidth: DATA_FLOW_STROKE_WIDTH },
                        markerEnd: { type: MarkerType.ArrowClosed, color: DATA_FLOW_STROKE_COLOR },
                    }}
                >
                    {isBackgroundGridVisible && (
                        <Background
                            variant={BackgroundVariant.Lines}
                            gap={SNAP_GRID_SIZE}
                            size={1}
                            color="#cbd5e1"
                        />
                    )}
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    );
};
