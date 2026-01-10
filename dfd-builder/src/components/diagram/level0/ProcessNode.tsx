import { Handle, Position, type NodeProps, NodeResizer, useUpdateNodeInternals } from 'reactflow';
import { useState, useEffect, useRef, useContext } from 'react';
import { type ProcessNode as ProcessNodeType } from '../../../core/types';
import { useDiagramStore } from '../../../store/useDiagramStore';
import styles from './ProcessNode.module.css';
import { UIVisibilityContext } from '../../../App';

interface QuadrantHandleConfig {
    inCircleSection: { start: number; end: number };
    outCircleSection: { start: number; end: number };
}

const QUADRANT_CONFIGS: Record<string, QuadrantHandleConfig> = {
    'top-left': {
        inCircleSection: { start: 358, end: 328 },   // IN: Top of circle
        outCircleSection: { start: 315, end: 285 }  // OUT: Bottom-left
    },
    'top-right': {
        inCircleSection: { start: 2, end: 40 },    // IN: Top-right
        outCircleSection: { start: 45, end: 88 }  // OUT: Bottom-right
    },
    'bottom-left': {
        inCircleSection: { start: 93, end: 125 },  // IN: Left
        outCircleSection: { start: 130, end: 165 }  // OUT: Bottom
    },
    'bottom-right': {
        inCircleSection: { start: 219, end: 240 },   // IN: Top-right
        outCircleSection: { start: 182, end: 215 }  // OUT: Bottom
    }
};

export const ProcessNode = ({ data, selected }: NodeProps<ProcessNodeType>) => {
    const { diagram, updateNode, updateEdge } = useDiagramStore();
    const updateNodeInternals = useUpdateNodeInternals();
    const { showHandles } = useContext(UIVisibilityContext);
    const [draggingHandleId, setDraggingHandleId] = useState<string | null>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Get custom diameter or use default
    const diameter = data.diameter || 200;
    const circleRadius = diameter / 2;
    const incomingFlows = diagram.edges.filter(e => e.targetNodeId === data.id);
    const outgoingFlows = diagram.edges.filter(e => e.sourceNodeId === data.id);

    // Separate entity flows
    const entityFlows = new Map<string, {
        incoming: string[],
        outgoing: string[],
        quadrant: string,
        index: number
    }>();

    // Get all entity nodes (and process_refs)
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

    // Categorize flows
    incomingFlows.forEach(flow => {
        const sourceNode = diagram.nodes.find(n => n.id === flow.sourceNodeId);
        if (sourceNode?.type === 'entity' || sourceNode?.type === 'process_ref') {
            const entityData = entityFlows.get(flow.sourceNodeId);
            if (entityData) entityData.incoming.push(flow.id);
        }
    });

    outgoingFlows.forEach(flow => {
        const targetNode = diagram.nodes.find(n => n.id === flow.targetNodeId);
        if (targetNode?.type === 'entity' || targetNode?.type === 'process_ref') {
            const entityData = entityFlows.get(flow.targetNodeId);
            if (entityData) entityData.outgoing.push(flow.id);
        }
    });

    // Generate Raw Handles first
    interface ProcessHandle {
        id: string;
        angle: number;
        type: 'source' | 'target';
        sectionStart: number;
        sectionEnd: number;
    }
    const rawHandles: ProcessHandle[] = [];

    // Helper: Distribute angles (Basic)
    const distributeAngles = (startAngle: number, endAngle: number, count: number): number[] => {
        if (count === 0) return [];
        const totalAngle = endAngle - startAngle;
        const step = totalAngle / (count + 1);
        return Array.from({ length: count }, (_, i) => startAngle + step * (i + 1));
    };

    // Process Entity Flows based on Quadrants to generate RAW positions
    entityFlows.forEach((entityData) => {
        const config = QUADRANT_CONFIGS[entityData.quadrant];
        if (!config) return;

        // INCOMING
        const incomingIds = entityData.incoming;
        if (incomingIds.length > 0) {
            const angles = distributeAngles(config.inCircleSection.start, config.inCircleSection.end, incomingIds.length);
            incomingIds.forEach((id, idx) => {
                const edge = diagram.edges.find(e => e.id === id);
                // raw angle includes offset
                const angle = angles[idx] + (edge?.targetAngleOffset || 0);
                rawHandles.push({
                    id,
                    angle,
                    type: 'target',
                    sectionStart: config.inCircleSection.start,
                    sectionEnd: config.inCircleSection.end
                });
            });
        }

        // OUTGOING
        const outgoingIds = entityData.outgoing;
        if (outgoingIds.length > 0) {
            const angles = distributeAngles(config.outCircleSection.start, config.outCircleSection.end, outgoingIds.length);
            outgoingIds.forEach((id, idx) => {
                const edge = diagram.edges.find(e => e.id === id);
                const angle = angles[idx] + (edge?.sourceAngleOffset || 0);
                rawHandles.push({
                    id,
                    angle,
                    type: 'source',
                    sectionStart: config.outCircleSection.start,
                    sectionEnd: config.outCircleSection.end
                });
            });
        }
    });

    // COLLISION RESOLUTION & DISTRIBUTED HANDLES
    const distributedHandles: ProcessHandle[] = [];
    const minGapPx = 25;
    const minGapRad = minGapPx / circleRadius; // Arc length formula s = r*theta -> theta = s/r
    const minGapDeg = minGapRad * (180 / Math.PI);

    // Group handles by quadrant/section to resolve overlaps locally
    const sections = new Map<string, ProcessHandle[]>();

    rawHandles.forEach(h => {
        const key = `${h.sectionStart}-${h.sectionEnd}`;
        if (!sections.has(key)) sections.set(key, []);
        sections.get(key)!.push(h);
    });

    let resizeNeeded = false;
    let requiredDiameter = diameter;

    sections.forEach((handlesInSection, key) => {
        if (handlesInSection.length < 2) {
            handlesInSection.forEach(h => distributedHandles.push(h));
            return;
        }

        // Sort by angle
        // Note: Range might be reversed (e.g. 358 to 328). We need to respect the direction.
        // Or determine 'linear' position.
        const [startStr, endStr] = key.split('-');
        const start = parseFloat(startStr);
        const end = parseFloat(endStr);
        // const isCounterClockwise = start > end; - Unused, sorting by angle value directly.
        // isCounterClockwise unused, ignoring for now as we sort by angle value.
        // 358 -> 328 is decreasing (-30). 93 -> 125 is increasing (+32).
        // Let's just sort by value and see distance.

        handlesInSection.sort((a, b) => a.angle - b.angle);

        // Iterative spread
        let changed = true;
        let iter = 0;
        const localHandles = [...handlesInSection];

        while (changed && iter < 10) {
            changed = false;
            iter++;
            for (let i = 0; i < localHandles.length - 1; i++) {
                const h1 = localHandles[i];
                const h2 = localHandles[i + 1];

                // Gap
                let gap = Math.abs(h2.angle - h1.angle);
                // Handle wrap-around case? Angles are usually close here, but if one is 359 and other is 1...
                // But our distribution generates them in range. drag might push them out.
                // Assuming simple linear diff for now as they are confined to quadrant.

                if (gap < minGapDeg) {
                    const center = (h1.angle + h2.angle) / 2;
                    const shift = minGapDeg / 2;
                    h1.angle = center - shift;
                    h2.angle = center + shift;
                    changed = true;
                }
            }
            localHandles.sort((a, b) => a.angle - b.angle);
        }

        // Store distributed
        localHandles.forEach(h => distributedHandles.push(h));

        // CHECK CAPACITY
        // Total needed angular span
        const count = localHandles.length;
        const totalNeededSpanDeg = count * minGapDeg;
        const availableSpanDeg = Math.abs(end - start);

        if (totalNeededSpanDeg > availableSpanDeg) {
            // We need more space.
            // totalNeededSpanRad * R_new = availableArcLength? No.
            // We need valid distribution.
            // Actually, we need the arc gap to correspond to 15px.
            // availableSpanRad * R_new >= count * 15px
            const availableSpanRad = availableSpanDeg * (Math.PI / 180);
            const neededArcLen = count * (minGapPx + 5); // +padding
            const neededR = neededArcLen / availableSpanRad;
            const neededD = neededR * 2;

            if (neededD > requiredDiameter) {
                requiredDiameter = neededD;
                resizeNeeded = true;
            }
        }
    });

    // Handle Auto-Resize
    useEffect(() => {
        if (draggingHandleId) return;
        if (resizeNeeded && requiredDiameter > diameter) {
            const timer = setTimeout(() => {
                updateNode(data.id, { diameter: Math.round(requiredDiameter) });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [resizeNeeded, requiredDiameter, diameter, draggingHandleId, updateNode, data.id]);

    // Position Helper
    const getHandlePosition = (angle: number) => {
        const rad = (angle - 90) * (Math.PI / 180);
        const x = circleRadius + circleRadius * Math.cos(rad);
        const y = circleRadius + circleRadius * Math.sin(rad);
        return { top: `${y}px`, left: `${x}px` };
    };

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

    const onHandleMouseDown = (e: React.MouseEvent, handleId: string) => {
        if (!selected) return;
        e.stopPropagation();
        e.preventDefault();
        setDraggingHandleId(handleId);
    };

    useEffect(() => {
        if (!draggingHandleId) return;

        const handleMouseMove = (e: MouseEvent) => {
            const edge = diagram.edges.find(ed => ed.id === draggingHandleId);
            if (!edge) return;

            const handle = distributedHandles.find(h => h.id === draggingHandleId);
            if (!handle) return;

            // Logic to calculate offset
            // Problem: handle.angle is distributed. We need base angle derived from distribution logic?
            // Actually, we should just assume the user is "adding" offset to the CURRENT visual angle relative to default.
            // Or simpler: The stored offset is what we modify.
            // visualAngle = defaultAngle + storedOffset.
            // mouseAngle = visualAngle_new.
            // storedOffset_new = mouseAngle - defaultAngle.
            // We need defaultAngle.
            // We can re-calculate defaultAngle by calling distributeAngles again for this specific group.

            // Re-find group info
            // Optimally we'd store defaultAngle on handle.
            // For now, let's just use the current distributed angle as "base" if offset is 0?
            // No, that causes drift.

            // Let's simplfy: We just calculate delta from PREVIOUS visual angle?
            // Or: mouseAngle - handle.angle (current visual) = delta.
            // newOffset = oldOffset + delta.
            // YES.

            const currentOffset = handle.type === 'source' ? (edge.sourceAngleOffset || 0) : (edge.targetAngleOffset || 0);
            const mouseAngle = getAngleFromMouse(e.clientX, e.clientY);

            // Delta calculation needs to handle 360 wrap if simple subtraction fails (e.g. 359 -> 1).
            // But getAngleFromMouse returns 0-360.
            // Let's trust simple diff for small drags.

            let delta = mouseAngle - handle.angle;
            // correction for wrap
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;

            const newOffset = currentOffset + delta;

            if (handle.type === 'source') {
                updateEdge(draggingHandleId, { sourceAngleOffset: newOffset });
            } else {
                updateEdge(draggingHandleId, { targetAngleOffset: newOffset });
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
    }, [draggingHandleId, diagram.edges, updateEdge, diameter]); // distributedHandles not needed in dep if we just need id

    useEffect(() => {
        // Delay to ensure edges are ready
        const t = setTimeout(() => {
            updateNodeInternals(data.id);
        }, 50);
        return () => clearTimeout(t);
    }, [distributedHandles.length, diameter, data.id, updateNodeInternals, diagram.edges]);

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

            {showHandles && distributedHandles.map(handle => {
                const pos = getHandlePosition(handle.angle);
                const isDragging = draggingHandleId === handle.id;

                // Determine logical position for edge routing
                let position = Position.Top;
                const normAngle = handle.angle % 360;
                if (normAngle >= 45 && normAngle < 135) position = Position.Right;
                else if (normAngle >= 135 && normAngle < 225) position = Position.Bottom;
                else if (normAngle >= 225 && normAngle < 315) position = Position.Left;

                return (
                    <Handle
                        key={handle.id}
                        type={handle.type}
                        position={position}
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
                            transition: isDragging ? 'none' : 'width 0.2s, height 0.2s, top 0.2s, left 0.2s'
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
