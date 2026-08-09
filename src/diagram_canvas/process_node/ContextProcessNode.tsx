import { Handle, Position, type NodeProps, NodeResizer, useUpdateNodeInternals } from 'reactflow';
import { useState, useEffect, useRef } from 'react';
import { type ProcessNode as ProcessNodeType } from '../../data_flow_diagram_model/public_interface';
import { useDiagramStore } from '../../diagram_state/public_interface';
import styles from './ContextProcessNode.module.css';
import { useDiagramVisibilityPreferences } from '../../application_shell/public_interface';
import {
    computeContextDiagramLayout,
    HANDLE_SPACING_PX,
    MIN_PROCESS_DIAMETER,
    type EntityLayoutInfo,
} from '../contextDiagramGeometry';

// =====================================================================
// PROCESS NODE COMPONENT
//
// The quadrant system and section allocation live in contextDiagramGeometry,
// which sizes the circle from the flow counts. This component only renders what
// that returns and handles direct manipulation of individual handles.
// =====================================================================
export const ContextProcessNode = ({ data, selected }: NodeProps<ProcessNodeType>) => {
    const { diagram, updateNode, updateEdge } = useDiagramStore();
    const updateNodeInternals = useUpdateNodeInternals();
    const { areFlowHandlesVisible } = useDiagramVisibilityPreferences();
    const [draggingHandleId, setDraggingHandleId] = useState<string | null>(null);
    const nodeElementReference = useRef<HTMLDivElement>(null);

    const diameter = data.diameter || MIN_PROCESS_DIAMETER;
    const circleRadius = diameter / 2;
    const incomingFlows = diagram.edges.filter(e => e.targetNodeId === data.id);
    const outgoingFlows = diagram.edges.filter(e => e.sourceNodeId === data.id);

    // Get all Level 0 entity nodes
    const entityNodes = diagram.nodes.filter(n => n.type === 'entity' && n.level === 0);

    // Group each entity's flows first: the section each entity gets is sized from
    // how many flows it has, so the counts are needed before the layout.
    const flowsByEntityId = new Map<string, { incoming: string[]; outgoing: string[] }>();
    entityNodes.forEach(entity => {
        flowsByEntityId.set(entity.id, { incoming: [], outgoing: [] });
    });

    incomingFlows.forEach(flow => {
        flowsByEntityId.get(flow.sourceNodeId)?.incoming.push(flow.id);
    });

    outgoingFlows.forEach(flow => {
        flowsByEntityId.get(flow.targetNodeId)?.outgoing.push(flow.id);
    });

    const { entityLayouts, requiredProcessDiameter } = computeContextDiagramLayout(
        entityNodes.map(entity => {
            const flows = flowsByEntityId.get(entity.id);
            return {
                inFlowCount: flows?.incoming.length ?? 0,
                outFlowCount: flows?.outgoing.length ?? 0,
            };
        })
    );

    const entityLayoutMap = new Map<string, { layout: EntityLayoutInfo; incoming: string[]; outgoing: string[] }>();
    entityNodes.forEach((entity, index) => {
        const flows = flowsByEntityId.get(entity.id)!;
        entityLayoutMap.set(entity.id, { layout: entityLayouts[index], ...flows });
    });

    // Generate handles with nested rectangle ordering
    interface ProcessHandle {
        id: string;
        angle: number;
        type: 'source' | 'target';
        sectionStart: number;
        sectionEnd: number;
    }
    const rawHandles: ProcessHandle[] = [];

    // Helper: distribute N angles evenly within a range
    const distributeAngles = (start: number, end: number, count: number): number[] => {
        if (count === 0) return [];
        const step = (end - start) / (count + 1);
        return Array.from({ length: count }, (_, i) => start + step * (i + 1));
    };

    entityLayoutMap.forEach((entityData) => {
        const { layout, incoming, outgoing } = entityData;
        const quadrant = layout.quadrant;

        // Helper: get pair index from pairId (scoped to THIS entity's flows only)
        const getEntityPairIndex = (flowId: string): number => {
            const edge = diagram.edges.find(e => e.id === flowId);
            if (!edge?.pairId) return 0;

            // Find unique pairIds ONLY from this entity's flows (in order they appear)
            const entityFlowIds = [...incoming, ...outgoing];
            const pairIds: string[] = [];
            entityFlowIds.forEach(fid => {
                const e = diagram.edges.find(ed => ed.id === fid);
                if (e?.pairId && !pairIds.includes(e.pairId)) {
                    pairIds.push(e.pairId);
                }
            });
            return pairIds.indexOf(edge.pairId);
        };

        // Sort flows by pair index (per-entity)
        const sortedIncoming = [...incoming].sort((a, b) => getEntityPairIndex(a) - getEntityPairIndex(b));
        const sortedOutgoing = [...outgoing].sort((a, b) => getEntityPairIndex(a) - getEntityPairIndex(b));

        // For nested rectangles:
        // TOP and LEFT use OUTs 1→N, INs N→1
        // RIGHT and BOTTOM use INs 1→N, OUTs N→1
        const useOutFirst = quadrant === 'top' || quadrant === 'left';

        if (useOutFirst) {
            // TOP/LEFT: OUTs ordered 1→N (first half), INs ordered N→1 (second half)
            // First half: OUTs in ascending pair order
            if (sortedOutgoing.length > 0) {
                const angles = distributeAngles(layout.outFlowRange.start, layout.outFlowRange.end, sortedOutgoing.length);
                sortedOutgoing.forEach((id, idx) => {
                    const edge = diagram.edges.find(e => e.id === id);
                    const angle = angles[idx] + (edge?.sourceAngleOffset || 0);
                    rawHandles.push({
                        id,
                        angle,
                        type: 'source',
                        sectionStart: layout.outFlowRange.start,
                        sectionEnd: layout.outFlowRange.end
                    });
                });
            }
            // Second half: INs in descending pair order (reverse for nesting)
            if (sortedIncoming.length > 0) {
                const reversedIncoming = [...sortedIncoming].reverse();
                const angles = distributeAngles(layout.inFlowRange.start, layout.inFlowRange.end, reversedIncoming.length);
                reversedIncoming.forEach((id, idx) => {
                    const edge = diagram.edges.find(e => e.id === id);
                    const angle = angles[idx] + (edge?.targetAngleOffset || 0);
                    rawHandles.push({
                        id,
                        angle,
                        type: 'target',
                        sectionStart: layout.inFlowRange.start,
                        sectionEnd: layout.inFlowRange.end
                    });
                });
            }
        } else {
            // RIGHT/BOTTOM: INs ordered 1→N (first half), OUTs ordered N→1 (second half)
            // First half: INs in ascending pair order
            if (sortedIncoming.length > 0) {
                const angles = distributeAngles(layout.inFlowRange.start, layout.inFlowRange.end, sortedIncoming.length);
                sortedIncoming.forEach((id, idx) => {
                    const edge = diagram.edges.find(e => e.id === id);
                    const angle = angles[idx] + (edge?.targetAngleOffset || 0);
                    rawHandles.push({
                        id,
                        angle,
                        type: 'target',
                        sectionStart: layout.inFlowRange.start,
                        sectionEnd: layout.inFlowRange.end
                    });
                });
            }
            // Second half: OUTs in descending pair order (reverse for nesting)
            if (sortedOutgoing.length > 0) {
                const reversedOutgoing = [...sortedOutgoing].reverse();
                const angles = distributeAngles(layout.outFlowRange.start, layout.outFlowRange.end, reversedOutgoing.length);
                reversedOutgoing.forEach((id, idx) => {
                    const edge = diagram.edges.find(e => e.id === id);
                    const angle = angles[idx] + (edge?.sourceAngleOffset || 0);
                    rawHandles.push({
                        id,
                        angle,
                        type: 'source',
                        sectionStart: layout.outFlowRange.start,
                        sectionEnd: layout.outFlowRange.end
                    });
                });
            }
        }
    });

    // COLLISION RESOLUTION
    //
    // Sections are already wide enough for the handles they hold, so this only
    // has to separate handles a user has dragged on top of one another via
    // sourceAngleOffset / targetAngleOffset.
    const distributedHandles: ProcessHandle[] = [];
    const minGapDeg = (HANDLE_SPACING_PX / circleRadius) * (180 / Math.PI);

    const sections = new Map<string, ProcessHandle[]>();
    rawHandles.forEach(h => {
        const key = `${h.sectionStart}-${h.sectionEnd}`;
        if (!sections.has(key)) sections.set(key, []);
        sections.get(key)!.push(h);
    });

    sections.forEach((handlesInSection) => {
        if (handlesInSection.length < 2) {
            handlesInSection.forEach(h => distributedHandles.push(h));
            return;
        }

        const localHandles = [...handlesInSection].sort((a, b) => a.angle - b.angle);

        let changed = true;
        let iter = 0;
        while (changed && iter < 10) {
            changed = false;
            iter++;
            for (let i = 0; i < localHandles.length - 1; i++) {
                const h1 = localHandles[i];
                const h2 = localHandles[i + 1];
                const gap = Math.abs(h2.angle - h1.angle);

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

        localHandles.forEach(h => distributedHandles.push(h));
    });

    // Auto-resize to whatever the current flow count needs.
    //
    // Growing is mandatory — too small a circle crowds the handles. Shrinking is
    // only done while the diameter is still the automatic one: it reclaims space
    // the layout itself asked for, including on a diagram saved before the
    // sections were allocated by flow count, without overriding a size the user
    // set by dragging the resize handles.
    const wasManuallyResized = useRef(false);

    useEffect(() => {
        if (draggingHandleId) return;

        const isTooSmall = diameter < requiredProcessDiameter;
        const canReclaimSpace = diameter > requiredProcessDiameter && !wasManuallyResized.current;
        if (!isTooSmall && !canReclaimSpace) return;

        const timer = setTimeout(() => {
            updateNode(data.id, { diameter: requiredProcessDiameter });
        }, 300);
        return () => clearTimeout(timer);
    }, [requiredProcessDiameter, diameter, draggingHandleId, updateNode, data.id]);

    // Position helper
    const getHandlePosition = (angle: number) => {
        const rad = (angle - 90) * (Math.PI / 180);
        const x = circleRadius + circleRadius * Math.cos(rad);
        const y = circleRadius + circleRadius * Math.sin(rad);
        return { top: `${y}px`, left: `${x}px` };
    };

    const getAngleFromMouse = (clientX: number, clientY: number): number => {
        if (!nodeElementReference.current) return 0;
        const rect = nodeElementReference.current.getBoundingClientRect();
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

            const currentOffset = handle.type === 'source' ? (edge.sourceAngleOffset || 0) : (edge.targetAngleOffset || 0);
            const mouseAngle = getAngleFromMouse(e.clientX, e.clientY);

            let delta = mouseAngle - handle.angle;
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
    }, [draggingHandleId, diagram.edges, updateEdge, diameter]);

    useEffect(() => {
        const t = setTimeout(() => {
            updateNodeInternals(data.id);
        }, 50);
        return () => clearTimeout(t);
    }, [distributedHandles.length, diameter, data.id, updateNodeInternals, diagram.edges]);

    const onResize = (_event: unknown, params: { width: number; height: number }) => {
        // Stops the automatic sizing from undoing the size just chosen.
        wasManuallyResized.current = true;
        const newDiameter = Math.round(Math.max(params.width, params.height));
        updateNode(data.id, { diameter: newDiameter });
    };

    return (
        <div
            ref={nodeElementReference}
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

            {areFlowHandlesVisible && distributedHandles.map(handle => {
                const pos = getHandlePosition(handle.angle);
                const isDragging = draggingHandleId === handle.id;

                // Determine logical position for edge routing
                let position = Position.Top;
                const normAngle = ((handle.angle % 360) + 360) % 360;
                if (normAngle >= 0 && normAngle < 90) position = Position.Right;
                else if (normAngle >= 90 && normAngle < 180) position = Position.Bottom;
                else if (normAngle >= 180 && normAngle < 270) position = Position.Left;
                else position = Position.Top;

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
                <div
                    className={styles.processHeader}
                    style={{ paddingTop: `${data.dividerPosition ?? 15}%` }}
                >
                    <span
                        className={styles.processNumber}
                        style={{ fontSize: `${(data.textSize ?? 16) / 16}rem` }}
                    >
                        {data.processNumber}
                    </span>
                </div>
                <div className={styles.processDivider}></div>
                <div className={styles.processBody}>
                    <span
                        className={styles.processName}
                        style={{ fontSize: `${(data.textSize ?? 16) / 16}rem` }}
                    >
                        {data.label}
                    </span>
                </div>
            </div>
        </div>
    );
};
