import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow';
import { useState, useEffect, useRef, useContext } from 'react';
import { type ProcessNode as ProcessNodeType } from '../../../core/types';
import { useDiagramStore } from '../../../store/useDiagramStore';
import styles from './ProcessNode.module.css';
import { UIVisibilityContext } from '../../../App';



export const ProcessNode = ({ data, selected }: NodeProps<ProcessNodeType>) => {
    const { diagram, updateNode, updateEdge } = useDiagramStore();
    const { showHandles } = useContext(UIVisibilityContext);
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

    // Get all entity nodes (and process_refs for Level 2)
    const entityNodes = diagram.nodes.filter(n => n.type === 'entity' || n.type === 'process_ref');
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
        if (sourceNode?.type === 'entity' || sourceNode?.type === 'process_ref') {
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
        if (targetNode?.type === 'entity' || targetNode?.type === 'process_ref') {
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

    // Helper: Distribute angles evenly within a range
    const distributeAngles = (startAngle: number, endAngle: number, count: number): number[] => {
        if (count === 0) return [];
        // If full circle (360), step is 360/count. If arc, step is (end-start)/(count+1).
        // Since we are doing left/right separation, we are using arcs (< 180 degrees generally to leave gaps at top/bottom).
        // Let's use a safe margin.

        // Left side: typically 135 to 225? Or 90 to 270?
        // Let's define:
        // Left Hemisphere (Entities): 90° (Bottom) -> 180° (Left) -> 270° (Top) in ReactFlow coords?
        // Wait, ReactFlow/CSS angles: 0=Right, 90=Bottom, 180=Left, 270=Top.
        // So Left side is 90 to 270.
        // Right side is 270 → 360/0 → 90.

        // We want to avoid 90 and 270 (Top/Bottom poles) to prevent overlap between left/right groups at the poles.
        // So Left Range: 100° to 260°.
        // Right Range: 280° to 440° (i.e. 80°).

        const availableArc = endAngle - startAngle;
        const step = availableArc / (count + 1);
        return Array.from({ length: count }, (_, i) => startAngle + step * (i + 1));
    };

    // Collect all unique flows
    const leftFlows: { id: string, type: 'source' | 'target', edgeOffset: number }[] = [];
    const rightFlows: { id: string, type: 'source' | 'target', edgeOffset: number }[] = [];

    // Process Entity Flows (LEFT)
    entityFlows.forEach((entityData) => {
        // IN (Entity -> Process): Target Handle
        entityData.incoming.forEach(id => {
            const edge = diagram.edges.find(e => e.id === id);
            leftFlows.push({ id, type: 'target', edgeOffset: edge?.targetAngleOffset || 0 });
        });
        // OUT (Process -> Entity): Source Handle
        entityData.outgoing.forEach(id => {
            const edge = diagram.edges.find(e => e.id === id);
            leftFlows.push({ id, type: 'source', edgeOffset: edge?.sourceAngleOffset || 0 });
        });
    });

    // Process Datastore Flows (RIGHT)
    datastoreFlows.incoming.forEach(id => { // DS -> Process (Target)
        const edge = diagram.edges.find(e => e.id === id);
        rightFlows.push({ id, type: 'target', edgeOffset: edge?.targetAngleOffset || 0 });
    });
    datastoreFlows.outgoing.forEach(id => { // Process -> DS (Source)
        const edge = diagram.edges.find(e => e.id === id);
        rightFlows.push({ id, type: 'source', edgeOffset: edge?.sourceAngleOffset || 0 });
    });

    // Calculate Angles for Left Side (Entities) - Grouped by Entity
    // User requested 180-360 degrees.
    // Grouping: "position ins and outs of entities close to each other just 5 degree distant"

    const entityIds = Array.from(entityFlows.keys());
    if (entityIds.length > 0) {
        // Distribute the *centers* of the entities
        const entityCenters = distributeAngles(190, 350, entityIds.length);

        entityIds.forEach((entityId, index) => {
            const centerAngle = entityCenters[index];
            const data = entityFlows.get(entityId)!;

            // Collect all flows for this entity
            // Note: We need to handle INs and OUTs.
            // Let's combine them. Order matters? Maybe INs top, OUTs bottom? or arbitrary?
            // User didn't specify order, just "close to each other".
            // Let's put Incoming (Entity->Process) then Outgoing (Process->Entity).
            const entFlows: { id: string, type: 'source' | 'target', edgeOffset: number }[] = [];

            data.incoming.forEach(id => {
                const edge = diagram.edges.find(e => e.id === id);
                entFlows.push({ id, type: 'target', edgeOffset: edge?.targetAngleOffset || 0 });
            });
            data.outgoing.forEach(id => {
                const edge = diagram.edges.find(e => e.id === id);
                entFlows.push({ id, type: 'source', edgeOffset: edge?.sourceAngleOffset || 0 });
            });

            // Position flows around center with 5 degree spacing
            const spacing = 5;
            const flowCount = entFlows.length;
            const startOffset = -((flowCount - 1) * spacing) / 2;

            entFlows.forEach((flow, flowIdx) => {
                const angleOffset = startOffset + (flowIdx * spacing);
                // Base angle is center + spacing offset
                const baseAngle = centerAngle + angleOffset;

                // Add manual drag offset
                const finalAngle = baseAngle + flow.edgeOffset;

                handles.push({ id: flow.id, angle: finalAngle, type: flow.type });
            });
        });
    }

    // Previous flat distribution logic replaced by above.
    // (Removed leftFlows usage for calculation, though we constructed it earlier. We can leave the construction or unused vars if it simplifies)
    // To be clean, I should comment out or remove the 'leftFlows' construction if it's no longer used, but the prompt replaces lines 133-141.
    // I will just replace the calculation block.

    // Calculate Angles for Right Side (Datastores)
    // User requested 0-180 degrees.
    const rightAngles = distributeAngles(10, 170, rightFlows.length);
    rightFlows.forEach((flow, i) => {
        const baseAngle = rightAngles[i];
        // Normalize angle to 0-360 for consistent rendering if needed, though transform usually allows negatives
        let finalAngle = baseAngle + flow.edgeOffset;
        if (finalAngle < 0) finalAngle += 360;
        handles.push({ id: flow.id, angle: finalAngle, type: flow.type });
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
            {showHandles && handles.map(handle => {
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
