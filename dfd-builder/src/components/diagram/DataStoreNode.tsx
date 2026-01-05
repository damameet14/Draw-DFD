import { Handle, Position, type NodeProps } from 'reactflow';
import { type DataStoreNode as DataStoreNodeType } from '../../core/types';
import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './DataStoreNode.module.css';
import { useState, useEffect, useRef, useContext } from 'react';
import { UIVisibilityContext } from '../../App';

export const DataStoreNode = ({ data, selected }: NodeProps<DataStoreNodeType>) => {
    const { diagram, updateEdge } = useDiagramStore();
    const { showHandles } = useContext(UIVisibilityContext);
    const [draggingHandleId, setDraggingHandleId] = useState<string | null>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Default node dimensions
    const nodeWidth = 180;
    const nodeHeight = 60;

    const incomingFlows = diagram.edges.filter(e => e.targetNodeId === data.id);
    const outgoingFlows = diagram.edges.filter(e => e.sourceNodeId === data.id);

    // Generate handles - restrict to top/bottom edges only
    const handles: Array<{
        id: string,
        edge: 'top' | 'bottom',  // Which edge (top or bottom)
        offset: number,  // Horizontal position along edge (0-100%)
        type: 'source' | 'target'
    }> = [];

    // Helper to decode position from single offset value
    // Format: 0-50 = top edge, 50-100 = bottom edge
    const decodePosition = (encodedOffset: number): { edge: 'top' | 'bottom', offset: number } => {
        if (encodedOffset === 0) {
            return { edge: 'bottom', offset: 50 }; // Default to bottom center
        }

        const normalizedOffset = Math.max(0, Math.min(100, encodedOffset));

        if (normalizedOffset < 50) {
            // Top edge
            return {
                edge: 'top',
                offset: (normalizedOffset / 50) * 100
            };
        } else {
            // Bottom edge
            return {
                edge: 'bottom',
                offset: ((normalizedOffset - 50) / 50) * 100
            };
        }
    };

    // Helper to encode position into single offset value
    const encodePosition = (edge: 'top' | 'bottom', offset: number): number => {
        const normalizedOffset = Math.max(0, Math.min(100, offset));

        if (edge === 'top') {
            return (normalizedOffset / 100) * 50;
        } else {
            return 50 + (normalizedOffset / 100) * 50;
        }
    };

    // Position incoming handles (targets)
    incomingFlows.forEach(flow => {
        const edge = diagram.edges.find(e => e.id === flow.id);
        const encodedOffset = edge?.targetAngleOffset || 0;
        const { edge: edgePos, offset } = decodePosition(encodedOffset);

        handles.push({
            id: flow.id,
            edge: edgePos,
            offset,
            type: 'target'
        });
    });

    // Position outgoing handles (sources)
    outgoingFlows.forEach(flow => {
        const edge = diagram.edges.find(e => e.id === flow.id);
        const encodedOffset = edge?.sourceAngleOffset || 0;
        const { edge: edgePos, offset } = decodePosition(encodedOffset);

        handles.push({
            id: flow.id,
            edge: edgePos,
            offset,
            type: 'source'
        });
    });

    // Get handle position style and React Flow Position
    const getHandleStyleAndPosition = (edge: 'top' | 'bottom', offset: number) => {
        const clampedOffset = Math.max(0, Math.min(100, offset));

        let style: any = {};
        let position: Position;

        if (edge === 'top') {
            style = { top: 0, left: `${clampedOffset}%` };
            position = Position.Top;
        } else {
            style = { bottom: 0, left: `${clampedOffset}%` };
            position = Position.Bottom;
        }

        return { style, position };
    };

    // Calculate new edge and offset from mouse position
    const getPositionFromMouse = (clientX: number, clientY: number): { edge: 'top' | 'bottom', offset: number } => {
        if (!nodeRef.current) return { edge: 'bottom', offset: 50 };

        const rect = nodeRef.current.getBoundingClientRect();
        const relativeX = ((clientX - rect.left) / rect.width) * 100;
        const relativeY = clientY - rect.top;

        // Determine which edge is closer
        const distToTop = relativeY;
        const distToBottom = rect.height - relativeY;

        const edge: 'top' | 'bottom' = distToTop < distToBottom ? 'top' : 'bottom';
        const offset = Math.max(0, Math.min(100, relativeX));

        return { edge, offset };
    };

    // Start dragging a handle
    const onHandleMouseDown = (e: React.MouseEvent, handleId: string) => {
        if (!selected) return;
        e.stopPropagation();
        e.preventDefault();
        setDraggingHandleId(handleId);
    };

    // Handle mouse move - update handle position
    useEffect(() => {
        if (!draggingHandleId) return;

        const handleMouseMove = (e: MouseEvent) => {
            const edge = diagram.edges.find(ed => ed.id === draggingHandleId);
            if (!edge) return;

            const handle = handles.find(h => h.id === draggingHandleId);
            if (!handle) return;

            // Get new position from mouse
            const { edge: newEdge, offset: newOffset } = getPositionFromMouse(e.clientX, e.clientY);

            // Encode position as single value
            const encodedOffset = encodePosition(newEdge, newOffset);

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

    return (
        <div
            ref={nodeRef}
            className={`${styles.dataStoreNode} ${selected ? styles.selected : ''}`}
            style={{ width: `${nodeWidth}px`, height: `${nodeHeight}px` }}
        >
            {/* Dynamic handles - only on top/bottom edges */}
            {showHandles && handles.map(handle => {
                const { style, position } = getHandleStyleAndPosition(handle.edge, handle.offset);
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

            <div className={styles.storeLabel}>
                {data.storeCode ? <span style={{ marginRight: '5px', fontWeight: 'bold' }}>{data.storeCode}</span> : null}
                {data.label}
            </div>
        </div>
    );
};
