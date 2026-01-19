import { create } from 'zustand';
import { type DFDDiagram, type DFDNode, type DFDEdge, type ValidationResult, type DFDLevel } from '../core/types';
import { validateDiagram, filterValidationForUI } from '../core/rules';

interface DiagramState {
    diagram: DFDDiagram;
    validationResults: ValidationResult[];

    // Actions
    setDiagramName: (name: string) => void;
    setLevel: (level: DFDLevel) => void;

    // Node Actions
    addNode: (node: DFDNode) => void;
    updateNode: (id: string, updates: Partial<DFDNode>) => void;
    removeNode: (id: string) => void;

    // Edge Actions
    addEdge: (edge: DFDEdge) => void;
    updateEdge: (id: string, updates: Partial<DFDEdge>) => void;
    removeEdge: (id: string) => void;

    // High-level
    loadDiagram: (diagram: DFDDiagram) => void;
    resetDiagram: () => void;
    handleNodeDrag: (id: string, position: { x: number; y: number }, levelOverride?: number) => void;
    syncProcessNodesSize: (level: number, diameter: number) => void;
}

const INITIAL_DIAGRAM: DFDDiagram = {
    id: 'root-diagram',
    name: 'New DFD',
    systemName: 'My System',
    level: 0,
    nodes: [],
    edges: [],
};

export const useDiagramStore = create<DiagramState>((set) => ({
    diagram: INITIAL_DIAGRAM,
    validationResults: [],

    setDiagramName: (name) => {
        set((state) => ({
            diagram: { ...state.diagram, name }
        }));
    },

    setLevel: (level) => {
        set((state) => {
            const newDiagram = { ...state.diagram, level };
            const validationResults = filterValidationForUI(validateDiagram(newDiagram), newDiagram);
            return { diagram: newDiagram, validationResults };
        });
    },

    addNode: (node) => {
        set((state) => {
            const newNodes = [...state.diagram.nodes, node];
            const newDiagram = { ...state.diagram, nodes: newNodes };
            const validationResults = filterValidationForUI(validateDiagram(newDiagram), newDiagram);
            return { diagram: newDiagram, validationResults };
        });
    },

    updateNode: (id, updates) => {
        set((state) => {
            const newNodes = state.diagram.nodes.map((n) =>
                n.id === id ? { ...n, ...updates } : n
            ) as DFDNode[];

            const newDiagram = { ...state.diagram, nodes: newNodes };
            const validationResults = filterValidationForUI(validateDiagram(newDiagram), newDiagram);
            return { diagram: newDiagram, validationResults };
        });
    },

    removeNode: (id) => {
        set((state) => {
            const newNodes = state.diagram.nodes.filter((n) => n.id !== id);
            const newEdges = state.diagram.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id);

            const newDiagram = { ...state.diagram, nodes: newNodes, edges: newEdges };
            const validationResults = filterValidationForUI(validateDiagram(newDiagram), newDiagram);
            return { diagram: newDiagram, validationResults };
        });
    },

    addEdge: (edge) => {
        set((state) => {
            const newEdges = [...state.diagram.edges, edge];
            const newDiagram = { ...state.diagram, edges: newEdges };
            const validationResults = filterValidationForUI(validateDiagram(newDiagram), newDiagram);
            return { diagram: newDiagram, validationResults };
        });
    },

    updateEdge: (id, updates) => {
        set((state) => {
            const newEdges = state.diagram.edges.map((e) =>
                e.id === id ? { ...e, ...updates } : e
            );
            const newDiagram = { ...state.diagram, edges: newEdges };
            const validationResults = filterValidationForUI(validateDiagram(newDiagram), newDiagram);
            return { diagram: newDiagram, validationResults };
        });
    },

    removeEdge: (id) => {
        set((state) => {
            const newEdges = state.diagram.edges.filter((e) => e.id !== id);
            const newDiagram = { ...state.diagram, edges: newEdges };
            const validationResults = filterValidationForUI(validateDiagram(newDiagram), newDiagram);
            return { diagram: newDiagram, validationResults };
        });
    },

    loadDiagram: (diagram) => {
        const validationResults = filterValidationForUI(validateDiagram(diagram), diagram);
        set({ diagram, validationResults });
    },

    resetDiagram: () => {
        set({ diagram: INITIAL_DIAGRAM, validationResults: [] });
    },

    handleNodeDrag: (id, position, levelOverride) => {
        set((state) => {
            const currentLevel = levelOverride ?? state.diagram.level;
            const nodes = [...state.diagram.nodes];
            const draggedNode = nodes.find(n => n.id === id);

            if (!draggedNode) return state;

            // Determine if coupled movement is needed
            const isProcess = draggedNode.type === 'process';
            const isDataStore = draggedNode.type === 'datastore';

            // Check if we are in Level 1 or 2
            if ((isProcess || isDataStore) && (currentLevel === 1 || currentLevel === 2)) {
                // Lock X movement for all nodes of the same type in this level
                const dx = position.x - draggedNode.position.x;

                // Update ALL nodes of this type
                const updatedNodes = nodes.map(n => {
                    if (n.level === currentLevel && n.type === draggedNode.type) {
                        return {
                            ...n,
                            position: {
                                x: n.position.x + dx, // Move all X by delta
                                y: n.id === id ? position.y : n.position.y // Move Y only for dragged node
                            }
                        };
                    }
                    return n;
                });
                return { diagram: { ...state.diagram, nodes: updatedNodes } };
            } else {
                // Normal drag for Entities or Level 0
                const updatedNodes = nodes.map(n =>
                    n.id === id ? { ...n, position } : n
                );
                return { diagram: { ...state.diagram, nodes: updatedNodes } };
            }
        });
    },

    syncProcessNodesSize: (level, diameter) => {
        set((state) => {
            const nodes = state.diagram.nodes.map(n => {
                if (n.level === level && n.type === 'process') {
                    // Update diameter for all process nodes in this level
                    // Use type casting or spread to handle the specific property
                    return { ...n, diameter } as DFDNode;
                }
                return n;
            });
            return { diagram: { ...state.diagram, nodes } };
        });
    }
}));
