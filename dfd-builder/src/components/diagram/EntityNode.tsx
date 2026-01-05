import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow';
import { useState, useEffect, useRef, useContext } from 'react';
import { type EntityNode as EntityNodeType } from '../../core/types';
import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './EntityNode.module.css';
import { UIVisibilityContext } from '../../App';

export const EntityNode = ({ data, selected }: NodeProps<EntityNodeType>) => {
    const { diagram, updateNode, updateEdge } = useDiagramStore();
    const { showHandles } = useContext(UIVisibilityContext);
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
        let side: 'top' | 'right' | 'bottom' | 'left';
        let offset: number;

        if (normalizedOffset >= 0 && normalizedOffset < 25) {
            side = 'top';
            offset = (normalizedOffset / 25) * 100;
        } else if (normalizedOffset >= 25 && normalizedOffset < 50) {
            side = 'right';
            offset = ((normalizedOffset - 25) / 25) * 100;
        } else if (normalizedOffset >= 50 && normalizedOffset < 75) {
            side = 'bottom';
            offset = ((normalizedOffset - 50) / 25) * 100;
        } else {
            side = 'left';
            offset = ((normalizedOffset - 75) / 25) * 100;
        }

        return { side, offset };
    };

    // Helper to encode position into single offset value
    const encodePosition = (side: 'top' | 'right' | 'bottom' | 'left', offset: number): number => {
        const normalizedOffset = Math.max(0, Math.min(100, offset));
        let encoded: number;

        switch (side) {
            case 'top':
                encoded = (normalizedOffset / 100) * 25;
                break;
            case 'right':
                encoded = 25 + (normalizedOffset / 100) * 25;
                break;
            case 'bottom':
                encoded = 50 + (normalizedOffset / 100) * 25;
                break;
            case 'left':
                encoded = 75 + (normalizedOffset / 100) * 25;
                break;
        }

        return encoded;
    };

    // Determine entity's position/quadrant (based on ProcessNode's quadrant assignment)
    const getEntityPosition = (): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' => {
        const entityNodes = diagram.nodes.filter(n => n.type === 'entity');
        const entityIndex = entityNodes.findIndex(n => n.id === data.id);
        const quadrantOrder = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        return quadrantOrder[entityIndex % 4] as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    };

    // Get default handle side based on entity position
    const getDefaultHandleSide = (isIncoming: boolean): 'top' | 'right' | 'bottom' | 'left' => {
        const position = getEntityPosition();

        if (isIncoming) {
            // IN handles (Process -> Entity) - User's "OUT" column
            switch (position) {
                case 'top-left': return 'bottom';
                case 'top-right': return 'bottom';
                case 'bottom-left': return 'top';
                case 'bottom-right': return 'top';
            }
        } else {
            // OUT handles (Entity -> Process) - User's "IN" column
            switch (position) {
                case 'top-left': return 'right';
                case 'top-right': return 'left';
                case 'bottom-left': return 'right';
                case 'bottom-right': return 'right';
            }
        }
        // Fallback
        return 'right';
    };

    // Generate handles for incoming flows (entity as target)
    incomingFlows.forEach(flow => {
        const defaultSide = getDefaultHandleSide(true);
        const defaultOffset = 50; // Center of the side
        const defaultEncoded = encodePosition(defaultSide, defaultOffset);

        const storedOffset = flow.targetAngleOffset || defaultEncoded;
        const { side, offset } = decodePosition(storedOffset);

        handles.push({
            id: flow.id,
            side,
            offset,
            type: 'target'
        });
    });

    // Generate handles for outgoing flows (entity as source)
    outgoingFlows.forEach(flow => {
        const defaultSide = getDefaultHandleSide(false);
        const defaultOffset = 50; // Center of the side
        const defaultEncoded = encodePosition(defaultSide, defaultOffset);

        const storedOffset = flow.sourceAngleOffset || defaultEncoded;
        const { side, offset } = decodePosition(storedOffset);
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
    const getNewPositionFromMouse = (clientX: number, clientY: number): { side: 'top' | 'right' | 'bottom' | 'left', offset: number } => {
        if (!nodeRef.current) return { side: 'right', offset: 50 };

        const rect = nodeRef.current.getBoundingClientRect();

        // Get mouse position relative to node (0-100 percentage)
        const relX = ((clientX - rect.left) / rect.width) * 100;
        const relY = ((clientY - rect.top) / rect.height) * 100;

        // Clamp to 0-100
        const x = Math.max(0, Math.min(100, relX));
        const y = Math.max(0, Math.min(100, relY));

        // Determine which edge is closest
        const distToTop = y;
        const distToBottom = 100 - y;
        const distToLeft = x;
        const distToRight = 100 - x;

        const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

        let side: 'top' | 'right' | 'bottom' | 'left';
        let offset: number;

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

            const handle = handles.find(h => h.id === draggingHandleId);
            if (!handle) return;

            // Get new position from mouse
            const { side, offset } = getNewPositionFromMouse(e.clientX, e.clientY);

            // Encode position as single value
            const encodedOffset = encodePosition(side, offset);

            // Update only the appropriate field for this handle
            if (handle.type === 'source') {
                updateEdge(draggingHandleId, { sourceAngleOffset: encodedOffset });
            } else {
                updateEdge(draggingHandleId, { targetAngleOffset: encodedOffset });
            }
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
    }, [draggingHandleId, diagram.edges, handles, updateEdge]);

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
            {showHandles && handles.map(handle => {
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
