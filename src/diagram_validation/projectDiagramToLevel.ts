import { type DFDDiagram, type DFDLevel } from '../data_flow_diagram_model/public_interface';

/**
 * Narrows a diagram to the single level a user is looking at.
 *
 * The store keeps all three levels in one `DFDDiagram`, with each node and edge
 * tagged by level. The rule set, however, describes one level at a time: it asks
 * questions like "does this diagram contain exactly one process" and reads
 * `diagram.level` to decide which level rules apply. Handing it the unsliced
 * diagram made those rules count nodes from every level at once and evaluate all
 * of them against `diagram.level`, which nothing ever advanced past 0.
 *
 * Validating `projectDiagramToLevel(diagram, level)` instead gives each rule the
 * diagram it was written for.
 */
export function projectDiagramToLevel(diagram: DFDDiagram, level: DFDLevel): DFDDiagram {
    return {
        ...diagram,
        level,
        nodes: diagram.nodes.filter((node) => node.level === level),
        edges: diagram.edges.filter((edge) => edge.level === level),
    };
}
