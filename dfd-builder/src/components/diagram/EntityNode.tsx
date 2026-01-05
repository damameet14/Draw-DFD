import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow';
import { useState, useEffect, useRef } from 'react';
import { type EntityNode as EntityNodeType } from '../../core/types';
import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './EntityNode.module.css';

export const EntityNode = ({ data, selected }: NodeProps<EntityNodeType>) => {
    const { diagram, updateNode, updateEdge } = useDiagramStore();
    const [draggingHandleId, setDraggingHandleId] = useState<string | null>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Get custom dimensions or use defaults
    const width = data.width || 160;
    const height = data.height || 80;

    // Get flows connected to this entity
    const incomingFlows = diagram.edges.filter(e =>
        e.targetNodeId === data.id && e.sourceNodeId !== data.id
    );
    const outgoingFlows = diagram.edges.filter(e =>
        e.sourceNodeId === data.id && e.targetNodeId !== data.id
    );

    // Handle positions stored as { side, offset } where side is 'top'|'right'|'bottom'|'left'
    // and offset is percentage along that side
    const handles: Array<{
        id: string,
        side: 'top' | 'right' | 'bottom' | 'left',
        offset: number,  // Percentage along the side (0-100)
        type: 'source' | 'target'
    }> = [];

    // Helper to get side and offset from stored angleOffsets
    // We'll use sourceAngleOffset for X coordinate and targetAngleOffset for Y coordinate
    const getSideAndOffset = (edge: any, isSource: boolean): { side: 'top' | 'right' | 'bottom' | 'left', offset: number } => {
        const xOffset = edge.sourceAngleOffset || 0;
        const yOffset = edge.targetAngleOffset || 0;

        // Convert X,Y offsets to side and offset along that side
        // Default positions based on flow direction
        let side: 'top' | 'right' | 'bottom' | 'left' = isSource ? 'right' : 'bottom';
        let offset = 50; // Default to middle

        // If custom offsets are set, use them to determine position
        // X: 0-100 represents left to right
        // Y: 0-100 represents top to bottom

        // Determine which edge the point is closest to
        const x = Math.max(0, Math.min(100, xOffset !== 0 ? xOffset : 50));
        const y = Math.max(0, Math.min(100, yOffset !== 0 ? yOffset : 50));

        // Find closest edge
        const distToTop = y;
        const distToBottom = 100 - y;
        const distToLeft = x;
        const distToRight = 100 - x;

        const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

        if (minDist === distToTop) {
            side = 'top';
            offset = x;
        } else if (minDist === distToBottom) {
            side = 'bottom';
            offset = x;
        } else if (minDist === distToLeft) {
            side = 'left';
            offset = y;
        } else {
            side = 'right';
            offset = y;
        }

        return { side, offset };
    };

    // Map edges to handles with side-based positioning
    incomingFlows.forEach(flow => {
        const edge = diagram.edges.find(e => e.id === flow.id);
        const { side, offset } = getSideAndOffset(edge, false);
        handles.push({
            id: flow.id,
            side,
            offset,
            type: 'target'
        });
    });

    outgoingFlows.forEach(flow => {
        const edge = diagram.edges.find(e => e.id === flow.id);
        const { side, offset } = getSideAndOffset(edge, true);
        handles.push({
            id: flow.id,
            side,
            offset,
            type: 'source'
        });
    });

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
    const getNewPositionFromMouse = (clientX: number, clientY: number): { x: number, y: number } => {
        if (!nodeRef.current) return { x: 50, y: 50 };

        const rect = nodeRef.current.getBoundingClientRect();

        // Get mouse position relative to node (0-100 percentage)
        const relX = ((clientX - rect.left) / rect.width) * 100;
        const relY = ((clientY - rect.top) / rect.height) * 100;

        // Clamp to 0-100
        const x = Math.max(0, Math.min(100, relX));
        const y = Math.max(0, Math.min(100, relY));

        return { x, y };
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

            // Get new position from mouse
            const { x, y } = getNewPositionFromMouse(e.clientX, e.clientY);

            // Store as X,Y coordinates (will be converted to side/offset on next render)
            updateEdge(draggingHandleId, {
                sourceAngleOffset: x,
                targetAngleOffset: y
            });
        };

        const handleMouseUp = () => {
            setDraggingHandleId(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingHandleId, diagram.edges, updateEdge]);

    // Handle resize event
    const onResize = (_event: any, params: any) => {
        const newWidth = Math.round(params.width);
        const newHeight = Math.round(params.height);
        updateNode(data.id, { width: newWidth, height: newHeight });
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
                minHeight={60}
                onResize={onResize}
                handleStyle={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                }}
            />

            {/* Dynamic draggable handles - can move anywhere along edges */}
            {handles.map(handle => {
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
