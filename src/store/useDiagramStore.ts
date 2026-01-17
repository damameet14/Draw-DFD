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
    }
}));
