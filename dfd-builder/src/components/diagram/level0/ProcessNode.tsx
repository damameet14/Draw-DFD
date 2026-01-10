import { Handle, Position, type NodeProps, NodeResizer, useUpdateNodeInternals } from 'reactflow';
import { useState, useEffect, useRef, useContext } from 'react';
import { type ProcessNode as ProcessNodeType } from '../../../core/types';
import { useDiagramStore } from '../../../store/useDiagramStore';
import styles from './ProcessNode.module.css';
import { UIVisibilityContext } from '../../../App';

// =====================================================================
// QUADRANT SYSTEM (Fixed, Absolute)
// 0° at 12 o'clock, angles increase clockwise
// =====================================================================
type Quadrant = 'top' | 'right' | 'bottom' | 'left';

const QUADRANT_START_ANGLES: Record<Quadrant, number> = {
    top: 270,
    right: 0,
    bottom: 90,
    left: 180
};

const QUADRANT_ORDER: Quadrant[] = ['top', 'right', 'bottom', 'left'];

// =====================================================================
// PURE LAYOUT FUNCTION
// f(entityIndex, totalEntities) → layout info
// =====================================================================
interface EntityLayoutInfo {
    quadrant: Quadrant;
    processSection: { start: number; end: number };
    inFlowRange: { start: number; end: number };
    outFlowRange: { start: number; end: number };
    entityInSide: 'top' | 'right' | 'bottom' | 'left';
    entityOutSide: 'top' | 'right' | 'bottom' | 'left';
}

function getEntityLayoutInfo(entityIndex: number, totalEntities: number): EntityLayoutInfo {
    // entityIndex is 0-based
    // Quadrant assignment: cyclic TOP → RIGHT → BOTTOM → LEFT → TOP ...
    const quadrantIndex = entityIndex % 4;
    const quadrant = QUADRANT_ORDER[quadrantIndex];

    // Count entities per quadrant
    const entitiesPerQuadrant: Record<Quadrant, number> = { top: 0, right: 0, bottom: 0, left: 0 };
    for (let i = 0; i < totalEntities; i++) {
        const q = QUADRANT_ORDER[i % 4];
        entitiesPerQuadrant[q]++;
    }

    const m = entitiesPerQuadrant[quadrant]; // entities in this quadrant
    const sectionSize = 90 / m;

    // k = 0-based index of this entity within its quadrant
    const k = Math.floor(entityIndex / 4);

    const S_q = QUADRANT_START_ANGLES[quadrant];

    // Section calculation depends on quadrant:
    // TOP/BOTTOM: First entity (k=0) should be at the END of quadrant (close to 360° and 180°)
    // RIGHT/LEFT: First entity (k=0) should be at the START of quadrant (close to 0° and 180°)
    let sectionStart: number;
    let sectionEnd: number;

    if (quadrant === 'top' || quadrant === 'bottom') {
        // Reverse order: k=0 at end of quadrant
        sectionEnd = S_q + 90 - k * sectionSize;
        sectionStart = S_q + 90 - (k + 1) * sectionSize;
    } else {
        // Normal order: k=0 at start of quadrant
        sectionStart = S_q + k * sectionSize;
        sectionEnd = S_q + (k + 1) * sectionSize;
    }

    const half = sectionSize / 2;

    // Flow ranges depend on quadrant
    // For TOP and LEFT: OUT first (lower angles), then IN (higher angles)
    // For RIGHT and BOTTOM: IN first (lower angles), then OUT (higher angles)
    let inFlowRange: { start: number; end: number };
    let outFlowRange: { start: number; end: number };

    if (quadrant === 'top' || quadrant === 'left') {
        // OUT in lower half, IN in upper half
        outFlowRange = { start: sectionStart, end: sectionStart + half };
        inFlowRange = { start: sectionStart + half, end: sectionEnd };
    } else {
        // RIGHT and BOTTOM: IN in lower half, OUT in upper half
        inFlowRange = { start: sectionStart, end: sectionStart + half };
        outFlowRange = { start: sectionStart + half, end: sectionEnd };
    }

    // Entity node side assignment (fixed by quadrant)
    const ENTITY_SIDES: Record<Quadrant, { inSide: 'top' | 'right' | 'bottom' | 'left'; outSide: 'top' | 'right' | 'bottom' | 'left' }> = {
        top: { inSide: 'right', outSide: 'bottom' },
        right: { inSide: 'left', outSide: 'bottom' },
        bottom: { inSide: 'top', outSide: 'left' },
        left: { inSide: 'top', outSide: 'right' }
    };

    return {
        quadrant,
        processSection: { start: sectionStart, end: sectionEnd },
        inFlowRange,
        outFlowRange,
        entityInSide: ENTITY_SIDES[quadrant].inSide,
        entityOutSide: ENTITY_SIDES[quadrant].outSide
    };
}

// =====================================================================
// PROCESS NODE COMPONENT
// =====================================================================
export const ProcessNode = ({ data, selected }: NodeProps<ProcessNodeType>) => {
    const { diagram, updateNode, updateEdge } = useDiagramStore();
    const updateNodeInternals = useUpdateNodeInternals();
    const { showHandles } = useContext(UIVisibilityContext);
    const [draggingHandleId, setDraggingHandleId] = useState<string | null>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    const diameter = data.diameter || 200;
    const circleRadius = diameter / 2;
    const incomingFlows = diagram.edges.filter(e => e.targetNodeId === data.id);
    const outgoingFlows = diagram.edges.filter(e => e.sourceNodeId === data.id);

    // Get all Level 0 entity nodes
    const entityNodes = diagram.nodes.filter(n => n.type === 'entity' && n.level === 0);
    const totalEntities = entityNodes.length;

    // Build entity layout map
    const entityLayoutMap = new Map<string, { layout: EntityLayoutInfo; incoming: string[]; outgoing: string[] }>();
    entityNodes.forEach((entity, index) => {
        const layout = getEntityLayoutInfo(index, totalEntities);
        entityLayoutMap.set(entity.id, { layout, incoming: [], outgoing: [] });
    });

    // Categorize flows by entity
    incomingFlows.forEach(flow => {
        const entry = entityLayoutMap.get(flow.sourceNodeId);
        if (entry) entry.incoming.push(flow.id);
    });

    outgoingFlows.forEach(flow => {
        const entry = entityLayoutMap.get(flow.targetNodeId);
        if (entry) entry.outgoing.push(flow.id);
    });

    // Generate handles
    interface ProcessHandle {
        id: string;
        angle: number;
        type: 'source' | 'target';
        sectionStart: number;
        sectionEnd: number;
    }
    const rawHandles: ProcessHandle[] = [];

    const distributeAngles = (start: number, end: number, count: number): number[] => {
        if (count === 0) return [];
        const step = (end - start) / (count + 1);
        return Array.from({ length: count }, (_, i) => start + step * (i + 1));
    };

    entityLayoutMap.forEach((data) => {
        const { layout, incoming, outgoing } = data;

        // IN-flows (Entity → Process) = target handles
        if (incoming.length > 0) {
            const angles = distributeAngles(layout.inFlowRange.start, layout.inFlowRange.end, incoming.length);
            incoming.forEach((id, idx) => {
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

        // OUT-flows (Process → Entity) = source handles
        if (outgoing.length > 0) {
            const angles = distributeAngles(layout.outFlowRange.start, layout.outFlowRange.end, outgoing.length);
            outgoing.forEach((id, idx) => {
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
    });

    // COLLISION RESOLUTION
    const distributedHandles: ProcessHandle[] = [];
    const minGapPx = 25;
    const minGapRad = minGapPx / circleRadius;
    const minGapDeg = minGapRad * (180 / Math.PI);

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

        const [startStr, endStr] = key.split('-');
        const start = parseFloat(startStr);
        const end = parseFloat(endStr);

        handlesInSection.sort((a, b) => a.angle - b.angle);

        let changed = true;
        let iter = 0;
        const localHandles = [...handlesInSection];

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

        // Check capacity
        const count = localHandles.length;
        const totalNeededSpanDeg = count * minGapDeg;
        const availableSpanDeg = Math.abs(end - start);

        if (totalNeededSpanDeg > availableSpanDeg) {
            const availableSpanRad = availableSpanDeg * (Math.PI / 180);
            const neededArcLen = count * (minGapPx + 5);
            const neededR = neededArcLen / availableSpanRad;
            const neededD = neededR * 2;

            if (neededD > requiredDiameter) {
                requiredDiameter = neededD;
                resizeNeeded = true;
            }
        }
    });

    // Auto-resize
    useEffect(() => {
        if (draggingHandleId) return;
        if (resizeNeeded && requiredDiameter > diameter) {
            const timer = setTimeout(() => {
                updateNode(data.id, { diameter: Math.round(requiredDiameter) });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [resizeNeeded, requiredDiameter, diameter, draggingHandleId, updateNode, data.id]);

    // Position helper
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
                <div className={styles.processLabel}>{data.processNumber}</div>
                <div className={styles.processName}>{data.label}</div>
            </div>
        </div>
    );
};

// Export the layout function for use by EntityNode
export { getEntityLayoutInfo };
export type { EntityLayoutInfo, Quadrant };
