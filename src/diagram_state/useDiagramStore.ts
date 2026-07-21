import { create } from 'zustand';
import {
    type DFDDiagram,
    type DFDNode,
    type DFDEdge,
    type DFDLevel,
} from '../data_flow_diagram_model/public_interface';

/**
 * Holds the single Data Flow Diagram being authored. All three levels live in
 * one diagram; nodes and edges carry a `level` and consumers filter by it.
 *
 * Validation is intentionally NOT stored here. It is derived from the diagram by
 * `useDiagramValidationResults`, so it costs nothing until something displays it.
 */
interface DiagramState {
    diagram: DFDDiagram;

    setDiagramName: (name: string) => void;
    setLevel: (level: DFDLevel) => void;

    addNode: (node: DFDNode) => void;
    updateNode: (nodeId: string, updates: Partial<DFDNode>) => void;
    removeNode: (nodeId: string) => void;

    addEdge: (edge: DFDEdge) => void;
    updateEdge: (edgeId: string, updates: Partial<DFDEdge>) => void;
    removeEdge: (edgeId: string) => void;

    loadDiagram: (diagram: DFDDiagram) => void;
    resetDiagram: () => void;

    /**
     * Moves a node during a drag gesture. On Level 1 and Level 2, processes and
     * data stores are laid out in vertical columns: dragging one horizontally
     * moves every node of the same type on that level by the same delta, while
     * vertical movement applies only to the dragged node.
     */
    moveNodeApplyingColumnAlignment: (
        nodeId: string,
        position: { x: number; y: number },
        levelOverride?: DFDLevel
    ) => void;

    /** Keeps every process circle on a level the same diameter. */
    syncProcessNodeDiameter: (level: DFDLevel, diameter: number) => void;
}

/**
 * Returns a fresh diagram each call. A shared module-level constant would let a
 * future in-place mutation leak into every subsequent reset.
 */
function createInitialDataFlowDiagram(): DFDDiagram {
    return {
        id: 'root-diagram',
        name: 'New DFD',
        systemName: 'My System',
        level: 0,
        nodes: [],
        edges: [],
    };
}

export const useDiagramStore = create<DiagramState>((set) => ({
    diagram: createInitialDataFlowDiagram(),

    setDiagramName: (name) => {
        set((state) => ({ diagram: { ...state.diagram, name } }));
    },

    setLevel: (level) => {
        set((state) => ({ diagram: { ...state.diagram, level } }));
    },

    addNode: (node) => {
        set((state) => ({
            diagram: { ...state.diagram, nodes: [...state.diagram.nodes, node] },
        }));
    },

    updateNode: (nodeId, updates) => {
        set((state) => ({
            diagram: {
                ...state.diagram,
                nodes: state.diagram.nodes.map((node) =>
                    node.id === nodeId ? { ...node, ...updates } : node
                ) as DFDNode[],
            },
        }));
    },

    removeNode: (nodeId) => {
        set((state) => ({
            diagram: {
                ...state.diagram,
                nodes: state.diagram.nodes.filter((node) => node.id !== nodeId),
                // Removing a node must also remove flows that would otherwise dangle.
                edges: state.diagram.edges.filter(
                    (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
                ),
            },
        }));
    },

    addEdge: (edge) => {
        set((state) => ({
            diagram: { ...state.diagram, edges: [...state.diagram.edges, edge] },
        }));
    },

    updateEdge: (edgeId, updates) => {
        set((state) => ({
            diagram: {
                ...state.diagram,
                edges: state.diagram.edges.map((edge) =>
                    edge.id === edgeId ? { ...edge, ...updates } : edge
                ),
            },
        }));
    },

    removeEdge: (edgeId) => {
        set((state) => ({
            diagram: {
                ...state.diagram,
                edges: state.diagram.edges.filter((edge) => edge.id !== edgeId),
            },
        }));
    },

    loadDiagram: (diagram) => {
        set({ diagram });
    },

    resetDiagram: () => {
        set({ diagram: createInitialDataFlowDiagram() });
    },

    moveNodeApplyingColumnAlignment: (nodeId, position, levelOverride) => {
        set((state) => {
            const currentLevel = levelOverride ?? state.diagram.level;
            const draggedNode = state.diagram.nodes.find((node) => node.id === nodeId);

            if (!draggedNode) return state;

            const isColumnAlignedType =
                draggedNode.type === 'process' || draggedNode.type === 'datastore';
            const isDecomposedLevel = currentLevel === 1 || currentLevel === 2;

            if (!isColumnAlignedType || !isDecomposedLevel) {
                return {
                    diagram: {
                        ...state.diagram,
                        nodes: state.diagram.nodes.map((node) =>
                            node.id === nodeId ? { ...node, position } : node
                        ),
                    },
                };
            }

            const horizontalDelta = position.x - draggedNode.position.x;

            return {
                diagram: {
                    ...state.diagram,
                    nodes: state.diagram.nodes.map((node) => {
                        const isInSameColumn =
                            node.level === currentLevel && node.type === draggedNode.type;
                        if (!isInSameColumn) return node;

                        return {
                            ...node,
                            position: {
                                x: node.position.x + horizontalDelta,
                                y: node.id === nodeId ? position.y : node.position.y,
                            },
                        };
                    }),
                },
            };
        });
    },

    syncProcessNodeDiameter: (level, diameter) => {
        set((state) => ({
            diagram: {
                ...state.diagram,
                nodes: state.diagram.nodes.map((node) =>
                    node.level === level && node.type === 'process'
                        ? ({ ...node, diameter } as DFDNode)
                        : node
                ),
            },
        }));
    },
}));
