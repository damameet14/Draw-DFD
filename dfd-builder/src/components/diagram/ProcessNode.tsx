import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow';
import { type ProcessNode as ProcessNodeType } from '../../core/types';
import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './ProcessNode.module.css';
import { useState, useEffect, useRef } from 'react';

type QuadrantConfig = {
    inCircleSection: { start: number, end: number }; // Angles for IN handles on circle
    outCircleSection: { start: number, end: number }; // Angles for OUT handles on circle
};

const QUADRANT_CONFIGS: Record<string, QuadrantConfig> = {
    'top-left': {
        inCircleSection: { start: 340, end: 360 },      // Top of circle (near north)
        outCircleSection: { start: 250, end: 290 }      // Left side of circle (west)
    },
    'top-right': {
        inCircleSection: { start: 0, end: 20 },         // Top-right of circle  
        outCircleSection: { start: 70, end: 110 }       // Right side of circle (east)
    },
    'bottom-left': {
        inCircleSection: { start: 200, end: 240 },      // Left-bottom of circle
        outCircleSection: { start: 160, end: 200 }      // Bottom of circle (south)
    },
    'bottom-right': {
        inCircleSection: { start: 120, end: 160 },      // Right-bottom of circle
        outCircleSection: { start: 160, end: 200 }      // Bottom of circle (south)
    }
};

export const ProcessNode = ({ data, selected }: NodeProps<ProcessNodeType>) => {
    const { diagram, updateNode, updateEdge } = useDiagramStore();
    const [draggingHandleId, setDraggingHandleId] = useState<string | null>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Get custom diameter or use default
    const diameter = data.diameter || 200;
    const circleRadius = diameter / 2;
    const incomingFlows = diagram.edges.filter(e => e.targetNodeId === data.id);
    const outgoingFlows = diagram.edges.filter(e => e.sourceNodeId === data.id);

    // Group flows by entity and assign quadrants based on entity order
    const entityFlows = new Map<string, {
        incoming: string[],
        outgoing: string[],
        quadrant: string,
        index: number
    }>();

    // Get all entity nodes
    const entityNodes = diagram.nodes.filter(n => n.type === 'entity');
    const quadrantOrder = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

    entityNodes.forEach((entity, index) => {
        const quadrant = quadrantOrder[index % 4];
        entityFlows.set(entity.id, {
            incoming: [],
            outgoing: [],
            quadrant,
            index
        });
    });

    // Categorize flows
    incomingFlows.forEach(flow => {
        const entityData = entityFlows.get(flow.sourceNodeId);
        if (entityData) {
            entityData.incoming.push(flow.id);
        }
    });

    outgoingFlows.forEach(flow => {
        const entityData = entityFlows.get(flow.targetNodeId);
        if (entityData) {
            entityData.outgoing.push(flow.id);
        }
    });

    // Generate handles based on quadrant configuration
    const handles: Array<{
        id: string,
        angle: number,
        type: 'source' | 'target'
    }> = [];

    entityFlows.forEach((entityData) => {
        const config = QUADRANT_CONFIGS[entityData.quadrant];

        // IN handles (incoming to process)
        const inCount = entityData.incoming.length;
        if (inCount > 0) {
            const sectionSize = config.inCircleSection.end - config.inCircleSection.start;
            entityData.incoming.forEach((flowId, index) => {
                const edge = diagram.edges.find(e => e.id === flowId);
                const baseAngle = config.inCircleSection.start +
                    (sectionSize * (index + 1)) / (inCount + 1);
                const angle = baseAngle + (edge?.targetAngleOffset || 0);
                handles.push({ id: flowId, angle, type: 'target' });
            });
        }

        // OUT handles (outgoing from process)
        const outCount = entityData.outgoing.length;
        if (outCount > 0) {
            const sectionSize = config.outCircleSection.end - config.outCircleSection.start;
            entityData.outgoing.forEach((flowId, index) => {
                const edge = diagram.edges.find(e => e.id === flowId);
                const baseAngle = config.outCircleSection.start +
                    (sectionSize * (index + 1)) / (outCount + 1);
                const angle = baseAngle + (edge?.sourceAngleOffset || 0);
                handles.push({ id: flowId, angle, type: 'source' });
            });
        }
    });

    // Convert angle to position on circle
    const getHandlePosition = (angle: number) => {
        const rad = (angle - 90) * (Math.PI / 180); // -90 to start from top
        const x = circleRadius + circleRadius * Math.cos(rad);
        const y = circleRadius + circleRadius * Math.sin(rad);
        return { top: `${y}px`, left: `${x}px` };
    };

    // Calculate angle from mouse position relative to circle center
    const getAngleFromMouse = (clientX: number, clientY: number): number => {
        if (!nodeRef.current) return 0;
        const rect = nodeRef.current.getBoundingClientRect();
        const centerX = rect.left + diameter / 2;
        const centerY = rect.top + diameter / 2;
        const dx = clientX - centerX;
        const dy = clientY - centerY;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;
        return angle;
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

            // Calculate base angle (original position without offset)
            const currentOffset = handle.type === 'source'
                ? (edge.sourceAngleOffset || 0)
                : (edge.targetAngleOffset || 0);
            const baseAngle = handle.angle - currentOffset;

            // Get new angle from mouse
            const newAngle = getAngleFromMouse(e.clientX, e.clientY);
            const newOffset = newAngle - baseAngle;

            // Update the edge with new offset
            if (handle.type === 'source') {
                updateEdge(draggingHandleId, { sourceAngleOffset: newOffset });
            } else {
                updateEdge(draggingHandleId, { targetAngleOffset: newOffset });
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
    }, [draggingHandleId, diagram.edges, handles, diameter, updateEdge]);

    // Handle resize event
    const onResize = (_event: any, params: any) => {
        // Use width for circular nodes (maintaining aspect ratio)
        const newDiameter = Math.round(params.width);
        updateNode(data.id, { diameter: newDiameter });
    };

    return (
        <div
            ref={nodeRef}
            className={`${styles.processNode} ${selected ? styles.selected : ''}`}
            style={{ width: `${diameter}px`, height: `${diameter}px` }}
        >
            {/* Resize handles - only show when selected, lock aspect ratio for circle */}
            <NodeResizer
                isVisible={selected}
                minWidth={120}
                minHeight={120}
                keepAspectRatio={true}
                onResize={onResize}
                handleStyle={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                }}
            />
            {/* Dynamic handles */}
            {handles.map(handle => {
                const pos = getHandlePosition(handle.angle);
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
                            width: isDragging ? 14 : 10,
                            height: isDragging ? 14 : 10,
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

            <div className={styles.processNumber}>{data.processNumber}</div>
            <div className={styles.processLabel}>{data.label}</div>
        </div>
    );
};
