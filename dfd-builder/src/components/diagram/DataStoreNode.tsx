import { Handle, Position, type NodeProps } from 'reactflow';
import { type DataStoreNode as DataStoreNodeType } from '../../core/types';
import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './DataStoreNode.module.css';
import { useState, useEffect, useRef } from 'react';

export const DataStoreNode = ({ data, selected }: NodeProps<DataStoreNodeType>) => {
    const { diagram, updateEdge } = useDiagramStore();
    const [draggingHandleId, setDraggingHandleId] = useState<string | null>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Default node dimensions
    const nodeWidth = 180;
    const nodeHeight = 60;

    const incomingFlows = diagram.edges.filter(e => e.targetNodeId === data.id);
    const outgoingFlows = diagram.edges.filter(e => e.sourceNodeId === data.id);

    // Generate handles - distribute them across the node area
    const handles: Array<{
        id: string,
        x: number,  // X position in pixels from left
        y: number,  // Y position in pixels from top
        type: 'source' | 'target'
    }> = [];

    // Position incoming handles (targets) on left half
    incomingFlows.forEach((flow, index) => {
        const edge = diagram.edges.find(e => e.id === flow.id);
        const baseX = nodeWidth * 0.25; // Default to 25% from left
        const baseY = ((index + 1) / (incomingFlows.length + 1)) * nodeHeight;

        // Apply any custom offsets
        const offsetX = edge?.sourceAngleOffset || 0; // Reuse angleOffset for X
        const offsetY = edge?.targetAngleOffset || 0; // Reuse angleOffset for Y

        handles.push({
            id: flow.id,
            x: baseX + offsetX,
            y: baseY + offsetY,
            type: 'target'
        });
    });

    // Position outgoing handles (sources) on right half
    outgoingFlows.forEach((flow, index) => {
        const edge = diagram.edges.find(e => e.id === flow.id);
        const baseX = nodeWidth * 0.75; // Default to 75% from left
        const baseY = ((index + 1) / (outgoingFlows.length + 1)) * nodeHeight;

        // Apply any custom offsets
        const offsetX = edge?.sourceAngleOffset || 0;
        const offsetY = edge?.targetAngleOffset || 0;

        handles.push({
            id: flow.id,
            x: baseX + offsetX,
            y: baseY + offsetY,
            type: 'source'
        });
    });

    // Get handle position style
    const getHandlePosition = (x: number, y: number) => {
        // Clamp to node boundaries
        const clampedX = Math.max(0, Math.min(nodeWidth, x));
        const clampedY = Math.max(0, Math.min(nodeHeight, y));

        return {
            top: `${clampedY}px`,
            left: `${clampedX}px`
        };
    };

    // Calculate position from mouse relative to node
    const getPositionFromMouse = (clientX: number, clientY: number): { x: number, y: number } => {
        if (!nodeRef.current) return { x: 0, y: 0 };

        const rect = nodeRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        return { x, y };
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

            // Calculate base position (original position without offset)
            const currentOffsetX = handle.type === 'source'
                ? (edge.sourceAngleOffset || 0)
                : 0;
            const currentOffsetY = handle.type === 'target'
                ? (edge.targetAngleOffset || 0)
                : 0;

            const baseX = handle.x - currentOffsetX;
            const baseY = handle.y - currentOffsetY;

            // Get new position from mouse
            const newPos = getPositionFromMouse(e.clientX, e.clientY);
            const newOffsetX = newPos.x - baseX;
            const newOffsetY = newPos.y - baseY;

            // Update the edge with new offsets
            // We're reusing sourceAngleOffset/targetAngleOffset for X/Y coordinates
            if (handle.type === 'source') {
                updateEdge(draggingHandleId, {
                    sourceAngleOffset: newOffsetX,
                    targetAngleOffset: newOffsetY
                });
            } else {
                updateEdge(draggingHandleId, {
                    sourceAngleOffset: newOffsetX,
                    targetAngleOffset: newOffsetY
                });
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
            {/* Dynamic handles */}
            {handles.map(handle => {
                const pos = getHandlePosition(handle.x, handle.y);
                const isDragging = draggingHandleId === handle.id;
                return (
                    <Handle
                        key={handle.id}
                        type={handle.type}
                        position={Position.Top}
                        id={handle.id}
                        onMouseDown={(e) => onHandleMouseDown(e, handle.id)}
                        style={{
                            ...pos,
                            width: isDragging ? 12 : 8,
                            height: isDragging ? 12 : 8,
                            background: handle.type === 'source' ? '#34d399' : '#60a5fa',
                            border: '2px solid #fff',
                            position: 'absolute',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10,
                            cursor: selected ? 'grab' : 'default',
                            transition: isDragging ? 'none' : 'width 0.2s, height 0.2s'
                        }}
                    />
                );
            })}

            <div className={styles.storeId}>{data.storeCode}</div>
            <div className={styles.storeLabel}>{data.label}</div>
        </div>
    );
};
