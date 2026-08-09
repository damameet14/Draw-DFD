import { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { type HandlePlacement } from './decomposedLevelLayout';
import { useDiagramVisibilityPreferences } from '../application_shell/public_interface';

/**
 * Draws a node's flow handles where the level layout put them.
 *
 * The handles carry no interaction of their own. On a decomposed level the
 * layout decides where every flow meets every shape — that is what keeps the
 * lines off each other — so dragging one somewhere else would only be undone on
 * the next render.
 *
 * They are always rendered, and hidden with `opacity` rather than by being left
 * out, because React Flow measures an edge's endpoints from the handle elements:
 * a handle that is not in the document takes its edge with it.
 */
export function PlannedFlowHandles({
    nodeId,
    placements,
}: {
    nodeId: string;
    placements: HandlePlacement[];
}) {
    const updateNodeInternals = useUpdateNodeInternals();
    const { areFlowHandlesVisible } = useDiagramVisibilityPreferences();

    // React Flow caches where a node's handles are, so it has to be told when
    // the layout has moved them.
    const placementSignature = placements
        .map((placement) => `${placement.edgeId}:${placement.x}:${placement.y}`)
        .join('|');

    useEffect(() => {
        updateNodeInternals(nodeId);
    }, [placementSignature, nodeId, updateNodeInternals]);

    return (
        <>
            {placements.map((placement) => (
                <Handle
                    key={`${placement.edgeId}-${placement.type}`}
                    type={placement.type}
                    position={placement.side === 'left' ? Position.Left : Position.Right}
                    id={placement.edgeId}
                    isConnectable={false}
                    style={{
                        position: 'absolute',
                        left: `${placement.x}px`,
                        top: `${placement.y}px`,
                        transform: 'translate(-50%, -50%)',
                        width: 8,
                        height: 8,
                        background: placement.type === 'source' ? '#34d399' : '#60a5fa',
                        border: '2px solid #fff',
                        opacity: areFlowHandlesVisible ? 1 : 0,
                        zIndex: 10,
                    }}
                />
            ))}
        </>
    );
}
