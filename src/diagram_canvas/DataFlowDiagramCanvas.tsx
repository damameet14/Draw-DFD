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
import {
    type DFDLevel,
    type ValidationResult,
} from '../data_flow_diagram_model/public_interface';
import { selectNodeTypesForLevel, dataFlowEdgeTypes } from './canvasNodeAndEdgeRegistry';
import styles from './DataFlowDiagramCanvas.module.css';

const DATA_FLOW_STROKE_COLOR = '#1e293b';
const DATA_FLOW_STROKE_WIDTH = 2;
const SNAP_GRID_SIZE = 20;

/** Stroke colours for flows a validation rule has flagged. */
const FLOW_STROKE_COLOR_BY_SEVERITY: Record<ValidationResult['severity'], string> = {
    error: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
};

/** Lower is worse; a node with both an error and a warning is drawn as an error. */
const SEVERITY_RANK: Record<ValidationResult['severity'], number> = {
    error: 0,
    warning: 1,
    info: 2,
};

const DIAGRAM_TITLE_BY_LEVEL: Record<DFDLevel, string> = {
    0: 'Context Level DFD',
    1: 'Level 1 DFD',
    2: 'Level 2 DFD',
};

/**
 * Reduces findings to the single worst severity per element, keyed by node or
 * edge id, so each element is drawn once no matter how many rules it broke.
 */
function mapWorstSeverityByElementId(
    findings: ValidationResult[]
): Map<string, ValidationResult['severity']> {
    const worstByElementId = new Map<string, ValidationResult['severity']>();

    findings.forEach((finding) => {
        const elementId = finding.nodeId ?? finding.edgeId;
        if (!elementId) return;

        const current = worstByElementId.get(elementId);
        if (!current || SEVERITY_RANK[finding.severity] < SEVERITY_RANK[current]) {
            worstByElementId.set(elementId, finding.severity);
        }
    });

    return worstByElementId;
}

interface DataFlowDiagramCanvasProps {
    currentLevel: DFDLevel;
    /** Findings for `currentLevel`, already filtered for display. */
    validationFindings: ValidationResult[];
    /** Node or edge the user selected in the validation panel, if any. */
    focusedElementId: string | null;
}

/**
 * Renders the slice of the diagram belonging to `currentLevel`.
 *
 * The store holds one diagram covering all levels; this component filters by
 * level and adapts the domain contracts into React Flow's node and edge shapes.
 * It holds no diagram rules — every mutation is delegated to `diagram_state`,
 * and validation findings arrive as a prop rather than being computed here.
 */
export const DataFlowDiagramCanvas = ({
    currentLevel,
    validationFindings,
    focusedElementId,
}: DataFlowDiagramCanvasProps) => {
    const diagram = useDiagramStore((state) => state.diagram);
    const updateNode = useDiagramStore((state) => state.updateNode);
    const moveNodeApplyingColumnAlignment = useDiagramStore(
        (state) => state.moveNodeApplyingColumnAlignment
    );
    const { isBackgroundGridVisible } = useDiagramVisibilityPreferences();

    const nodeTypes = useMemo(() => selectNodeTypesForLevel(currentLevel), [currentLevel]);

    const severityByElementId = useMemo(
        () => mapWorstSeverityByElementId(validationFindings),
        [validationFindings]
    );

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    useEffect(() => {
        const nodesOnCurrentLevel = diagram.nodes.filter((node) => node.level === currentLevel);
        const edgesOnCurrentLevel = diagram.edges.filter((edge) => edge.level === currentLevel);

        const reactFlowNodes: Node[] = nodesOnCurrentLevel.map((node) => {
            const severity = severityByElementId.get(node.id);
            const isFocused = node.id === focusedElementId;

            // React Flow puts this className on the node wrapper, which lets the
            // finding badge and glow be styled once here instead of being
            // threaded through all six node renderers.
            const validationClassName = [
                severity === 'error' ? styles.nodeHasError : '',
                severity === 'warning' ? styles.nodeHasWarning : '',
                isFocused ? styles.nodeFocused : '',
            ]
                .filter(Boolean)
                .join(' ');

            return {
                id: node.id,
                type: node.type,
                position: node.position,
                data: { ...node },
                draggable: true,
                selectable: true,
                focusable: true,
                className: validationClassName || undefined,
            };
        });

        const reactFlowEdges: Edge[] = edgesOnCurrentLevel.map((edge) => {
            const severity = severityByElementId.get(edge.id);
            const isFocused = edge.id === focusedElementId;
            const strokeColor = severity
                ? FLOW_STROKE_COLOR_BY_SEVERITY[severity]
                : DATA_FLOW_STROKE_COLOR;

            return {
                id: edge.id,
                source: edge.sourceNodeId,
                target: edge.targetNodeId,
                // Node components create one handle per edge, keyed by the edge id,
                // so the handle identifiers are the edge identifier on both ends.
                sourceHandle: edge.id,
                targetHandle: edge.id,
                label: edge.label,
                type: 'orthogonal',
                animated: isFocused,
                style: {
                    stroke: strokeColor,
                    strokeWidth: isFocused ? DATA_FLOW_STROKE_WIDTH + 2 : DATA_FLOW_STROKE_WIDTH,
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: strokeColor,
                    width: 25,
                    height: 25,
                },
                data: { ...edge },
            };
        });

        setNodes(reactFlowNodes);
        setEdges(reactFlowEdges);
    }, [
        diagram.nodes,
        diagram.edges,
        currentLevel,
        severityByElementId,
        focusedElementId,
        setNodes,
        setEdges,
    ]);

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
