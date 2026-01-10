import { Handle, Position, type NodeProps, NodeResizer, useUpdateNodeInternals } from 'reactflow';
import { useState, useEffect, useRef, useContext } from 'react';
import { type EntityNode as EntityNodeType } from '../../../core/types';
import { useDiagramStore } from '../../../store/useDiagramStore';
import styles from './EntityNode.module.css';
import { UIVisibilityContext } from '../../../App';

export const EntityNode = ({ data, selected }: NodeProps<EntityNodeType>) => {
    const { diagram, updateNode, updateEdge } = useDiagramStore();
    const updateNodeInternals = useUpdateNodeInternals();
    const { showHandles } = useContext(UIVisibilityContext);
    const [draggingHandleId, setDraggingHandleId] = useState<string | null>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Get custom dimensions or use defaults - Default to SQUARE
    const width = data.width || 120;
    const height = data.height || 120;

    // Get flows connected to this entity
    const incomingFlows = diagram.edges.filter(e =>
        e.targetNodeId === data.id && e.sourceNodeId !== data.id
    );
    const outgoingFlows = diagram.edges.filter(e =>
        e.sourceNodeId === data.id && e.targetNodeId !== data.id
    );

    interface EntityHandle {
        id: string;
        side: 'top' | 'right' | 'bottom' | 'left';
        offset: number;  // Percentage 0-100
        type: 'source' | 'target';
    }

    // Helper to decode position from single offset value
    // Format: side is encoded in ranges: 0-25=top, 25-50=right, 50-75=bottom, 75-100=left
    // Within each range, the exact position along that side is encoded
    const decodePosition = (encodedOffset: number): { side: 'top' | 'right' | 'bottom' | 'left', offset: number } => {
        if (encodedOffset === 0) {
            // Default position
            return { side: 'right', offset: 50 };
        }

        // Decode side from range
        const normalizedOffset = Math.max(0, Math.min(100, encodedOffset));
        if (normalizedOffset >= 0 && normalizedOffset < 25) {
            return { side: 'top', offset: (normalizedOffset / 25) * 100 };
        } else if (normalizedOffset >= 25 && normalizedOffset < 50) {
            return { side: 'right', offset: ((normalizedOffset - 25) / 25) * 100 };
        } else if (normalizedOffset >= 50 && normalizedOffset < 75) {
            return { side: 'bottom', offset: ((normalizedOffset - 50) / 25) * 100 };
        } else {
            return { side: 'left', offset: ((normalizedOffset - 75) / 25) * 100 };
        }
    };

    // Helper to encode position into single offset value
    const encodePosition = (side: 'top' | 'right' | 'bottom' | 'left', offset: number): number => {
        const normalizedOffset = Math.max(0, Math.min(100, offset));
        switch (side) {
            case 'top': return (normalizedOffset / 100) * 25;
            case 'right': return 25 + (normalizedOffset / 100) * 25;
            case 'bottom': return 50 + (normalizedOffset / 100) * 25;
            case 'left': return 75 + (normalizedOffset / 100) * 25;
        }
    };

    const rawHandles: EntityHandle[] = [];

    // Generate Raw Handles
    incomingFlows.forEach(flow => {
        const storedOffset = flow.targetAngleOffset;
        let side: 'top' | 'right' | 'bottom' | 'left';
        let offset: number;

        if (storedOffset !== undefined && storedOffset !== 0) {
            const decoded = decodePosition(storedOffset);
            side = decoded.side;
            offset = decoded.offset;
        } else {
            side = 'bottom';
            offset = 50;
        }
        rawHandles.push({ id: flow.id, side, offset, type: 'target' });
    });

    outgoingFlows.forEach(flow => {
        const storedOffset = flow.sourceAngleOffset;
        let side: 'top' | 'right' | 'bottom' | 'left';
        let offset: number;

        if (storedOffset !== undefined && storedOffset !== 0) {
            const decoded = decodePosition(storedOffset);
            side = decoded.side;
            offset = decoded.offset;
        } else {
            side = 'right';
            offset = 50;
        }
        rawHandles.push({ id: flow.id, side, offset, type: 'source' });
    });

    // DISTRIBUTE HANDLES LOGIC
    // We want to visually separate handles that are too close, without necessarily changing their stored value permanently unless dragged.
    const distributedHandles: EntityHandle[] = [];
    const minSpacingPx = 25; // Minimum pixels between handles as requested

    ['top', 'right', 'bottom', 'left'].forEach(side => {
        const sideKey = side as 'top' | 'right' | 'bottom' | 'left';

        // Filter and sort handles on this side
        // Sort by offset primarily, ID secondarily for stability
        const sideHandles = rawHandles
            .filter(h => h.side === sideKey)
            .sort((a, b) => {
                if (Math.abs(a.offset - b.offset) > 0.1) return a.offset - b.offset;
                return a.id.localeCompare(b.id);
            });

        if (sideHandles.length === 0) return;

        const sideLength = (sideKey === 'top' || sideKey === 'bottom') ? width : height;

        // Convert offsets to pixels for calculation
        let positionsPx = sideHandles.map(h => (h.offset / 100) * sideLength);

        // Resolve overlaps
        let changed = true;
        let iterations = 0;

        // Iterative relaxation to spread handles
        while (changed && iterations < 10) {
            changed = false;
            iterations++;

            for (let i = 0; i < positionsPx.length - 1; i++) {
                const current = positionsPx[i];
                const next = positionsPx[i + 1];
                const diff = next - current;

                if (diff < minSpacingPx) {
                    // Overlap detected. Push apart symmetrically around center of overlap
                    const center = (current + next) / 2;
                    const halfSpace = minSpacingPx / 2.0;
                    positionsPx[i] = center - halfSpace;
                    positionsPx[i + 1] = center + halfSpace;
                    changed = true;
                }
            }

            // Re-sort after potential swaps
            positionsPx.sort((a, b) => a - b);
        }

        // Convert back to percentages and store
        sideHandles.forEach((h, i) => {
            const visualOffset = (positionsPx[i] / sideLength) * 100;
            // Always push to distributedHandles for rendering
            distributedHandles.push({ ...h, offset: visualOffset });
        });
    });


    // Check for Resize Need
    useEffect(() => {
        // Debounce/Delay updateNodeInternals to ensure Edge is mounted
        const t = setTimeout(() => {
            updateNodeInternals(data.id);
        }, 50);
        return () => clearTimeout(t);

        if (draggingHandleId) return;

        let newWidth = width;
        let newHeight = height;
        let shouldResize = false;
        const minPadding = 20;

        // Simple congestion check: required space vs available space
        const countMap = { top: 0, right: 0, bottom: 0, left: 0 };
        distributedHandles.forEach(h => countMap[h.side]++);

        const requiredW = Math.max(
            (countMap.top * minSpacingPx) + minPadding,
            (countMap.bottom * minSpacingPx) + minPadding,
            120 // Min width
        );

        const requiredH = Math.max(
            (countMap.left * minSpacingPx) + minPadding,
            (countMap.right * minSpacingPx) + minPadding,
            120 // Min height
        );

        // Also check if handles are pushed off-screen ( < 0% or > 100% )
        // Actually, simple count-based logic is safer and more predictable for sizing than position-based
        // because position-based can oscillate if we resize -> positions change -> unresize.
        // Stick to count-based for stability.

        if (requiredW > width || requiredH > height) {
            const newSize = Math.max(requiredW, requiredH, width, height);
            newWidth = newSize;
            newHeight = newSize;
            shouldResize = true;
        }

        if (shouldResize) {
            const timer = setTimeout(() => {
                updateNode(data.id, { width: newWidth, height: newHeight });
            }, 300);
            return () => clearTimeout(timer);
        }

    }, [distributedHandles.length, width, height, draggingHandleId, data.id, updateNode]);


    // Calculate handle position and React Flow Position
    const getHandleStyleAndPosition = (side: 'top' | 'right' | 'bottom' | 'left', offset: number) => {
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

    // Calculate new side and offset from mouse position
    const getNewPositionFromMouse = (clientX: number, clientY: number): { side: 'top' | 'right' | 'bottom' | 'left', offset: number } => {
        if (!nodeRef.current) return { side: 'right', offset: 50 };
        const rect = nodeRef.current.getBoundingClientRect();

        const relX = ((clientX - rect.left) / rect.width) * 100;
        const relY = ((clientY - rect.top) / rect.height) * 100;

        const x = Math.max(0, Math.min(100, relX));
        const y = Math.max(0, Math.min(100, relY));

        const distToTop = y;
        const distToBottom = 100 - y;
        const distToLeft = x;
        const distToRight = 100 - x;

        const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

        if (minDist === distToTop) return { side: 'top', offset: x };
        if (minDist === distToBottom) return { side: 'bottom', offset: x };
        if (minDist === distToLeft) return { side: 'left', offset: y };
        return { side: 'right', offset: y };
    };

    // Start dragging a handle
    const onHandleMouseDown = (e: React.MouseEvent, handleId: string) => {
        if (!selected) return;
        e.stopPropagation();
        e.preventDefault();
        setDraggingHandleId(handleId);
    };

    // Handle mouse move - update handle position with 2D movement
    useEffect(() => {
        if (!draggingHandleId) return;

        const handleMouseMove = (e: MouseEvent) => {
            const edge = diagram.edges.find(ed => ed.id === draggingHandleId);
            if (!edge) return;

            // We use distributedHandles simply to find which handle we are talking about, but we need the stored ID.
            // We don't need the handle object itself for logic, just the ID.

            // Get new position from mouse
            const { side, offset } = getNewPositionFromMouse(e.clientX, e.clientY);

            // Encode position as single value
            const encodedOffset = encodePosition(side, offset);

            // Update only the appropriate field for this handle
            // We need to know if it's source or target. diagram.edges has that info.
            // Wait, we need to know if the Entity is the source or target of THAT edge.
            const isSource = edge.sourceNodeId === data.id;

            if (isSource) {
                updateEdge(draggingHandleId, { sourceAngleOffset: encodedOffset });
            } else {
                updateEdge(draggingHandleId, { targetAngleOffset: encodedOffset });
            }
        };

        const handleMouseUp = () => {
            setDraggingHandleId(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingHandleId, diagram.edges, updateEdge, data.id]);

    // Handle resize event
    const onResize = (_event: any, params: any) => {
        const size = Math.max(params.width, params.height);
        updateNode(data.id, { width: size, height: size });
    };

    return (
        <div
            ref={nodeRef}
            className={`${styles.entityNode} ${selected ? styles.selected : ''}`}
            style={{ width: `${width}px`, height: `${height}px` }}
        >
            {/* Resize handles - only show when selected */}
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

            {/* Dynamic draggable handles - can move anywhere along edges */}
            {showHandles && distributedHandles.map(handle => {
                const { style, position } = getHandleStyleAndPosition(handle.side, handle.offset);
                const isDragging = draggingHandleId === handle.id;
                return (
                    <Handle
                        key={handle.id}
                        type={handle.type}
                        position={position}
                        id={handle.id}
                        onMouseDown={(e) => onHandleMouseDown(e, handle.id)}
                        style={{
                            ...style,
                            width: isDragging ? 14 : 10,
                            height: isDragging ? 14 : 10,
                            background: handle.type === 'source' ? '#34d399' : '#60a5fa',
                            border: '2px solid #fff',
                            zIndex: 10,
                            cursor: selected ? 'grab' : 'default',
                            transition: isDragging ? 'none' : 'all 0.2s'
                        }}
                    />
                );
            })}

            <div className={styles.entityLabel}>{data.label}</div>
        </div>
    );
};
