import { Handle, Position, type NodeProps, NodeResizer, useUpdateNodeInternals } from 'reactflow';
import { useEffect, useRef } from 'react';
import { type EntityNode as EntityNodeType } from '../../data_flow_diagram_model/public_interface';
import { useDiagramStore } from '../../diagram_state/public_interface';
import styles from './ContextEntityNode.module.css';
import { useDiagramVisibilityPreferences } from '../../application_shell/public_interface';
import {
    calculateRequiredEntitySize,
    DEFAULT_ENTITY_TEXT_SIZE_PX,
    ENTITY_EDGE_USABLE_FRACTION,
    ENTITY_HANDLE_SPACING_PX,
    MIN_ENTITY_SIZE,
    quadrantForEntityIndex,
    ENTITY_SIDES_BY_QUADRANT,
} from '../contextDiagramGeometry';

/** Percentage of an edge handles may occupy, centred, leaving the corners clear. */
const HANDLE_SPAN_PERCENT = ENTITY_EDGE_USABLE_FRACTION * 100;
const HANDLE_SPAN_START_PERCENT = (100 - HANDLE_SPAN_PERCENT) / 2;

type Side = 'top' | 'right' | 'bottom' | 'left';

export const ContextEntityNode = ({ data, selected }: NodeProps<EntityNodeType>) => {
    const { diagram, updateNode } = useDiagramStore();
    const updateNodeInternals = useUpdateNodeInternals();
    const { areFlowHandlesVisible } = useDiagramVisibilityPreferences();
    const nodeElementReference = useRef<HTMLDivElement>(null);
    const wasManuallyResized = useRef(false);

    const width = data.width || MIN_ENTITY_SIZE;
    const height = data.height || MIN_ENTITY_SIZE;

    // Determine this entity's index and layout info
    const entityNodes = diagram.nodes.filter(n => n.type === 'entity' && n.level === 0);
    const entityIndex = entityNodes.findIndex(n => n.id === data.id);

    // Only the quadrant matters here, and that follows from the index alone —
    // the angular sections the process circle uses are not needed on this side.
    const quadrant = entityIndex >= 0 ? quadrantForEntityIndex(entityIndex) : 'top';
    const inSide: Side = ENTITY_SIDES_BY_QUADRANT[quadrant].inSide;
    const outSide: Side = ENTITY_SIDES_BY_QUADRANT[quadrant].outSide;

    // Get flows connected to this entity
    const incomingFlows = diagram.edges.filter(e =>
        e.targetNodeId === data.id && e.sourceNodeId !== data.id
    );
    const outgoingFlows = diagram.edges.filter(e =>
        e.sourceNodeId === data.id && e.targetNodeId !== data.id
    );

    interface EntityHandle {
        id: string;
        side: Side;
        offset: number;
        type: 'source' | 'target';
    }

    // Helper: get pair index from pairId (scoped to THIS entity's flows only)
    const getEntityPairIndex = (flowId: string): number => {
        const edge = diagram.edges.find(e => e.id === flowId);
        if (!edge?.pairId) return 0;

        // Find unique pairIds ONLY from this entity's flows (in order they appear)
        const entityFlows = [...incomingFlows, ...outgoingFlows];
        const pairIds: string[] = [];
        entityFlows.forEach(f => {
            if (f.pairId && !pairIds.includes(f.pairId)) {
                pairIds.push(f.pairId);
            }
        });
        return pairIds.indexOf(edge.pairId);
    };

    const rawHandles: EntityHandle[] = [];

    // Sort flows by pair index for nested rectangle ordering (per-entity)
    const sortedIncoming = [...incomingFlows].sort((a, b) => getEntityPairIndex(a.id) - getEntityPairIndex(b.id));
    const sortedOutgoing = [...outgoingFlows].sort((a, b) => getEntityPairIndex(a.id) - getEntityPairIndex(b.id));

    // For nested rectangles, specific quadrants need specific reversals:
    // TOP:    Neither reversed
    // RIGHT:  OUTs reversed (incoming from process)
    // BOTTOM: Both reversed
    // LEFT:   OUTs reversed (incoming from process)
    const reverseIncoming = quadrant === 'right' || quadrant === 'bottom' || quadrant === 'left'; // OUTs from process
    const reverseOutgoing = quadrant === 'bottom';  // INs to process (only BOTTOM)

    // Apply reversal for proper nesting
    const orderedIncoming = reverseIncoming ? [...sortedIncoming].reverse() : sortedIncoming;
    const orderedOutgoing = reverseOutgoing ? [...sortedOutgoing].reverse() : sortedOutgoing;

    // Spread handles across most of the edge rather than the middle 60%, so a box
    // holds more flows before it has to grow.
    const offsetForIndex = (index: number, count: number) =>
        count === 1
            ? 50
            : HANDLE_SPAN_START_PERCENT + (index * HANDLE_SPAN_PERCENT) / Math.max(1, count - 1);

    // Incoming flows (Process → Entity) = target handles = OUT side on Entity
    orderedIncoming.forEach((flow, idx) => {
        rawHandles.push({
            id: flow.id,
            side: outSide,
            offset: offsetForIndex(idx, orderedIncoming.length),
            type: 'target',
        });
    });

    // Outgoing flows (Entity → Process) = source handles = IN side on Entity
    orderedOutgoing.forEach((flow, idx) => {
        rawHandles.push({
            id: flow.id,
            side: inSide,
            offset: offsetForIndex(idx, orderedOutgoing.length),
            type: 'source',
        });
    });

    // DISTRIBUTE HANDLES LOGIC
    const distributedHandles: EntityHandle[] = [];
    const minSpacingPx = ENTITY_HANDLE_SPACING_PX;

    (['top', 'right', 'bottom', 'left'] as Side[]).forEach(side => {
        const sideHandles = rawHandles
            .filter(h => h.side === side)
            .sort((a, b) => {
                if (Math.abs(a.offset - b.offset) > 0.1) return a.offset - b.offset;
                return a.id.localeCompare(b.id);
            });

        if (sideHandles.length === 0) return;

        const sideLength = (side === 'top' || side === 'bottom') ? width : height;
        const positionsPx = sideHandles.map(h => (h.offset / 100) * sideLength);

        let changed = true;
        let iterations = 0;

        while (changed && iterations < 10) {
            changed = false;
            iterations++;

            for (let i = 0; i < positionsPx.length - 1; i++) {
                const current = positionsPx[i];
                const next = positionsPx[i + 1];
                const diff = next - current;

                if (diff < minSpacingPx) {
                    const center = (current + next) / 2;
                    const halfSpace = minSpacingPx / 2.0;
                    positionsPx[i] = center - halfSpace;
                    positionsPx[i + 1] = center + halfSpace;
                    changed = true;
                }
            }

            positionsPx.sort((a, b) => a - b);
        }

        sideHandles.forEach((h, i) => {
            const visualOffset = (positionsPx[i] / sideLength) * 100;
            distributedHandles.push({ ...h, offset: visualOffset });
        });
    });

    // Update node internals when handles change
    useEffect(() => {
        const t = setTimeout(() => {
            updateNodeInternals(data.id);
        }, 50);
        return () => clearTimeout(t);
    }, [distributedHandles.length, width, height, data.id, updateNodeInternals, diagram.edges, entityIndex]);

    // Auto-resize to fit the handles, using the same rule the CSV import uses to
    // size boxes up front.
    //
    // Like the process circle, this grows whenever the box is too small but only
    // shrinks while the size is still the automatic one, so dragging the resize
    // handles is not undone a moment later.
    const textSize = data.textSize ?? DEFAULT_ENTITY_TEXT_SIZE_PX;

    const requiredSize = calculateRequiredEntitySize(
        { inFlowCount: outgoingFlows.length, outFlowCount: incomingFlows.length },
        textSize
    );

    useEffect(() => {
        const currentSize = Math.max(width, height);
        const isTooSmall = currentSize < requiredSize;
        const canReclaimSpace = currentSize > requiredSize && !wasManuallyResized.current;
        if (!isTooSmall && !canReclaimSpace) return;

        const timer = setTimeout(() => {
            updateNode(data.id, { width: requiredSize, height: requiredSize });
        }, 300);
        return () => clearTimeout(timer);
    }, [requiredSize, width, height, data.id, updateNode]);

    const getHandleStyleAndPosition = (side: Side, offset: number) => {
        const clampedOffset = Math.max(0, Math.min(100, offset));

        let style: any = {};
        let position: Position;

        switch (side) {
            case 'top':
                style = { top: 0, left: `${clampedOffset}%` };
                position = Position.Top;
                break;
            case 'bottom':
                style = { bottom: 0, left: `${clampedOffset}%` };
                position = Position.Bottom;
                break;
            case 'left':
                style = { left: 0, top: `${clampedOffset}%` };
                position = Position.Left;
                break;
            case 'right':
                style = { right: 0, top: `${clampedOffset}%` };
                position = Position.Right;
                break;
        }

        return { style, position };
    };

    const onResize = (_event: unknown, params: { width: number; height: number }) => {
        wasManuallyResized.current = true;
        const size = Math.round(Math.max(params.width, params.height));
        updateNode(data.id, { width: size, height: size });
    };

    return (
        <div
            ref={nodeElementReference}
            className={`${styles.entityNode} ${selected ? styles.selected : ''}`}
            style={{ width: `${width}px`, height: `${height}px` }}
        >
            <NodeResizer
                isVisible={selected}
                minWidth={100}
                minHeight={100}
                onResize={onResize}
                keepAspectRatio={true}
                handleStyle={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                }}
            />

            {areFlowHandlesVisible && distributedHandles.map(handle => {
                const { style, position } = getHandleStyleAndPosition(handle.side, handle.offset);
                return (
                    <Handle
                        key={handle.id}
                        type={handle.type}
                        position={position}
                        id={handle.id}
                        style={{
                            ...style,
                            width: 10,
                            height: 10,
                            background: handle.type === 'source' ? '#34d399' : '#60a5fa',
                            border: '2px solid #fff',
                            zIndex: 10,
                            cursor: 'default',
                            transition: 'all 0.2s'
                        }}
                    />
                );
            })}

            <div className={styles.entityLabel} style={{ fontSize: `${textSize}px` }}>
                {data.label}
            </div>
        </div>
    );
};
