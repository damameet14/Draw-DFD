import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow';
import { useState, useEffect, useRef } from 'react';
import { type ProcessNode as ProcessNodeType } from '../../core/types';
import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './ProcessNode.module.css';

type QuadrantHandleConfig = {
    inCircleSection: { start: number; end: number };
    outCircleSection: { start: number; end: number };
};

const QUADRANT_CONFIGS: Record<string, QuadrantHandleConfig> = {
    'top-left': {
        inCircleSection: { start: 180, end: 270 },  // IN: Bottom-left quarter
        outCircleSection: { start: 270, end: 360 }  // OUT: Bottom-right quarter
    },
    'top-right': {
        inCircleSection: { start: 180, end: 270 },  // IN: Bottom-left quarter
        outCircleSection: { start: 90, end: 180 }   // OUT: Top-left quarter
    },
    'bottom-left': {
        inCircleSection: { start: 270, end: 360 },  // IN: Top-right quarter
        outCircleSection: { start: 0, end: 90 }     // OUT: Top-left quarter
    },
    'bottom-right': {
        inCircleSection: { start: 0, end: 90 },     // IN: Top-left quarter
        outCircleSection: { start: 90, end: 180 }   // OUT: Top-right quarter
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

    // Separate entity flows and datastore flows
    const entityFlows = new Map<string, {
        incoming: string[],
        outgoing: string[],
        quadrant: string,
        index: number
    }>();

    const datastoreFlows = {
        incoming: [] as string[],
        outgoing: [] as string[]
    };

    // Get all entity nodes
    const entityNodes = diagram.nodes.filter(n => n.type === 'entity');
    const quadrantOrder = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

    // Initialize entity flows map
    entityNodes.forEach((entity, index) => {
        const quadrant = quadrantOrder[index % 4];
        entityFlows.set(entity.id, {
            incoming: [],
            outgoing: [],
            quadrant,
            index
        });
    });

    // Categorize flows by source/target type
    incomingFlows.forEach(flow => {
        const sourceNode = diagram.nodes.find(n => n.id === flow.sourceNodeId);
        if (sourceNode?.type === 'entity') {
            const entityData = entityFlows.get(flow.sourceNodeId);
            if (entityData) {
                entityData.incoming.push(flow.id);
            }
        } else if (sourceNode?.type === 'datastore') {
            datastoreFlows.incoming.push(flow.id);
        }
    });

    outgoingFlows.forEach(flow => {
        const targetNode = diagram.nodes.find(n => n.id === flow.targetNodeId);
        if (targetNode?.type === 'entity') {
            const entityData = entityFlows.get(flow.targetNodeId);
            if (entityData) {
                entityData.outgoing.push(flow.id);
            }
        } else if (targetNode?.type === 'datastore') {
            datastoreFlows.outgoing.push(flow.id);
        }
    });

    // Generate handles
    const handles: Array<{
        id: string,
        angle: number,
        type: 'source' | 'target'
    }> = [];

    // Entity flow handles (use quadrants)
    entityFlows.forEach((entityData) => {
        const config = QUADRANT_CONFIGS[entityData.quadrant];

        // IN handles (entity → process)
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

        // OUT handles (process → entity)
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

    // Datastore flow handles (use right side of circle: 315-45 degrees)
    // IN handles (datastore → process) - bottom-right quadrant (315-360)
    const dsInCount = datastoreFlows.incoming.length;
    if (dsInCount > 0) {
        const startAngle = 315;  // Bottom-right
        const endAngle = 360;
        const sectionSize = endAngle - startAngle;

        datastoreFlows.incoming.forEach((flowId, index) => {
            const edge = diagram.edges.find(e => e.id === flowId);
            const baseAngle = startAngle + (sectionSize * (index + 1)) / (dsInCount + 1);
            const angle = baseAngle + (edge?.targetAngleOffset || 0);
            handles.push({ id: flowId, angle, type: 'target' });
        });
    }

    // OUT handles (process → datastore) - top-right quadrant (0-45)
    const dsOutCount = datastoreFlows.outgoing.length;
    if (dsOutCount > 0) {
        const startAngle = 0;    // Top-right
        const endAngle = 45;
        const sectionSize = endAngle - startAngle;

        datastoreFlows.outgoing.forEach((flowId, index) => {
            const edge = diagram.edges.find(e => e.id === flowId);
            const baseAngle = startAngle + (sectionSize * (index + 1)) / (dsOutCount + 1);
            const angle = baseAngle + (edge?.sourceAngleOffset || 0);
            handles.push({ id: flowId, angle, type: 'source' });
        });
    }

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
    }, [draggingHandleId, diagram.edges, handles, updateEdge]);

    // Handle resize event
    const onResize = (_event: any, params: any) => {
        const newDiameter = Math.round(Math.max(params.width, params.height));
        updateNode(data.id, { diameter: newDiameter });
    };

    return (
        <div
            ref={nodeRef}
            className={`${styles.processNode} ${selected ? styles.selected : ''}`}
            style={{ width: `${diameter}px`, height: `${diameter}px` }}
        >
            {/* Resize handles - only show when selected */}
            <NodeResizer
                isVisible={selected}
                minWidth={150}
                minHeight={150}
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

            <div className={styles.processCircle}>
                <div className={styles.processLabel}>{data.processNumber}</div>
                <div className={styles.processName}>{data.label}</div>
            </div>
        </div>
    );
};
