import { type FC, useState, useEffect, useContext } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath, useReactFlow } from 'reactflow';
import { useDiagramStore } from '../../../store/useDiagramStore';
import { RotateCw } from 'lucide-react';
import { UIVisibilityContext } from '../../../App';

export const CustomOrthogonalEdge: FC<EdgeProps> = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    markerEnd,
    style,
    selected // Capture selected prop
}) => {
    const { diagram, updateEdge } = useDiagramStore();
    const { showArrowButtons } = useContext(UIVisibilityContext);
    const [isLabelSelected, setIsLabelSelected] = useState(false);
    const { getNodes } = useReactFlow(); // Moved to top level

    // Highlighting Style
    const edgeStyle = {
        ...style,
        stroke: selected ? '#3b82f6' : (style?.stroke || '#1e293b'),
        strokeWidth: selected ? 3 : (style?.strokeWidth || 2),
        filter: selected ? 'drop-shadow(0 0 2px rgba(59, 130, 246, 0.5))' : 'none'
    };

    // Marker Style for selection - modifying markerEnd is complex inside the component as it expects an ID string
    // We'll stick to highlighting the path for now.

    // Get the actual edge from the store
    const edge = diagram.edges.find(e => e.id === id);
    const storedDirection = edge?.arrowDirection as 'horizontal-first' | 'vertical-first' | 'smart' | undefined;
    const labelOffset = edge?.labelOffset ?? 0.5;

    let currentDirection: 'horizontal-first' | 'vertical-first' | 'smart' = 'horizontal-first';

    // Define path and label position
    let path = '';
    let labelX = 0;
    let labelY = 0;

    // Check for Level 2
    const isLevel2 = edge?.level === 2;
    // Smart Routing is active for Level 2 if direction is not explicitly set to manual (H/V) or explicitly 'smart'
    const useSmartRouting = isLevel2 && (!storedDirection || storedDirection === 'smart');

    if (useSmartRouting) {
        // --- LEVEL 2: Step Edge Logic (Smart/Auto) ---
        const [stepPath, centerX, centerY] = getSmoothStepPath({
            sourceX, sourceY, sourcePosition,
            targetX, targetY, targetPosition,
            borderRadius: 0
        });
        path = stepPath;

        // Calculate Label Position along the path
        // Parse "M x y L x y ..."
        const commands = stepPath.match(/[ML][^ML]*/g) || [];
        const points: { x: number, y: number }[] = [];

        commands.forEach(cmd => {
            const coords = cmd.slice(1).trim().split(/[\s,]+/);
            // Take x,y (last 2 numbers)
            if (coords.length >= 2) {
                const x = parseFloat(coords[coords.length - 2]);
                const y = parseFloat(coords[coords.length - 1]);
                if (!isNaN(x) && !isNaN(y)) {
                    points.push({ x, y });
                }
            }
        });

        if (points.length >= 2) {
            let totalLen = 0;
            const pathSegments: { len: number, p1: any, p2: any }[] = [];

            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                pathSegments.push({ len, p1, p2 });
                totalLen += len;
            }

            let targetLen = totalLen * labelOffset;
            let currentLen = 0;

            // Default center fallback
            labelX = centerX;
            labelY = centerY;

            for (const seg of pathSegments) {
                if (currentLen + seg.len >= targetLen) {
                    const innerLen = targetLen - currentLen;
                    const ratio = seg.len > 0 ? innerLen / seg.len : 0;
                    labelX = seg.p1.x + (seg.p2.x - seg.p1.x) * ratio;
                    labelY = seg.p1.y + (seg.p2.y - seg.p1.y) * ratio;
                    break;
                }
                currentLen += seg.len;
            }
        } else {
            labelX = centerX;
            labelY = centerY;
        }

    } else {
        // --- Manual L-Shape Logic (Level 0/1 OR Manual Override for Level 2) ---

        // Determine path direction
        if (storedDirection && storedDirection !== 'smart') {
            currentDirection = storedDirection as 'horizontal-first' | 'vertical-first';
        } else if (sourcePosition === 'bottom') {
            currentDirection = 'vertical-first';
        } else {
            currentDirection = 'horizontal-first';
        }

        // Define path segments
        let segments: Array<{ p1: { x: number, y: number }, p2: { x: number, y: number } }> = [];
        if (currentDirection === 'horizontal-first') {
            segments = [
                { p1: { x: sourceX, y: sourceY }, p2: { x: targetX, y: sourceY } },
                { p1: { x: targetX, y: sourceY }, p2: { x: targetX, y: targetY } }
            ];
        } else {
            segments = [
                { p1: { x: sourceX, y: sourceY }, p2: { x: sourceX, y: targetY } },
                { p1: { x: sourceX, y: targetY }, p2: { x: targetX, y: targetY } }
            ];
        }

        // --- Wire Jump / Intersection Logic ---
        // Helper for Process Angles
        const distributeAngles = (start: number, end: number, count: number) => {
            if (count === 0) return [];
            const step = (end - start) / (count + 1);
            return Array.from({ length: count }, (_, i) => start + step * (i + 1));
        };

        const getProcessHandlePosition = (node: any, edgeId: string, isSourceHandle: boolean) => {
            const diameter = node.diameter || 200;
            const r = diameter / 2;
            const cx = node.position.x + r;
            const cy = node.position.y + r;

            const incoming = diagram.edges.filter(e => e.targetNodeId === node.id);
            const outgoing = diagram.edges.filter(e => e.sourceNodeId === node.id);

            // Build Entity Groupings
            const entityFlows = new Map<string, { incoming: string[], outgoing: string[] }>();
            const entityNodes = diagram.nodes.filter(n => n.type === 'entity' || n.type === 'process_ref');

            // Defined order in ProcessNode is by index in diagram.nodes list effectively
            // BUT ProcessNode.tsx does: `diagram.nodes.filter(...)` then `forEach((entity, index) => ...)`
            // This order is stable if diagram.nodes is stable.

            entityNodes.forEach((entity) => {
                entityFlows.set(entity.id, { incoming: [], outgoing: [] });
            });

            // Populate Check
            let isEntitySide = false;
            let targetEntityId = '';

            // Check if OUR edgeId involves an entity
            // Find the *other* node for this edge
            const thisEdge = diagram.edges.find(e => e.id === edgeId);
            if (!thisEdge) return { x: cx, y: cy }; // should not happen

            const otherNodeId = isSourceHandle ? thisEdge.targetNodeId : thisEdge.sourceNodeId;
            const otherNode = diagram.nodes.find(n => n.id === otherNodeId);

            if (otherNode && (otherNode.type === 'entity' || otherNode.type === 'process_ref')) {
                isEntitySide = true;
                targetEntityId = otherNodeId;
            }

            if (isEntitySide) {
                // We are on the LEFT side (Entity Side)
                // We need to match the specific angle calculation for this entity group

                // Populate flows for ALL entities to find correct center angle index
                incoming.forEach(f => {
                    if (entityFlows.has(f.sourceNodeId)) entityFlows.get(f.sourceNodeId)?.incoming.push(f.id);
                });
                outgoing.forEach(f => {
                    if (entityFlows.has(f.targetNodeId)) entityFlows.get(f.targetNodeId)?.outgoing.push(f.id);
                });

                const entityIds = Array.from(entityFlows.keys());
                const entityIndex = entityIds.indexOf(targetEntityId);
                if (entityIndex === -1) return { x: cx, y: cy };

                const entityCenters = distributeAngles(190, 350, entityIds.length);
                const centerAngle = entityCenters[entityIndex];

                // Reconstruct the specific flow list for this entity to find index
                const data = entityFlows.get(targetEntityId)!;
                // Incoming then Outgoing
                const entFlows = [...data.incoming, ...data.outgoing]; // ID strings
                const flowIndex = entFlows.indexOf(edgeId);

                if (flowIndex === -1) return { x: cx, y: cy };

                const spacing = 5;
                const flowCount = entFlows.length;
                const startOffset = -((flowCount - 1) * spacing) / 2;
                const angleOffset = startOffset + (flowIndex * spacing);
                const baseAngle = centerAngle + angleOffset;

                // Add manual offset
                const manualOffset = isSourceHandle ? (thisEdge.sourceAngleOffset || 0) : (thisEdge.targetAngleOffset || 0);
                const finalAngle = baseAngle + manualOffset;

                // Convert to X,Y
                const rad = (finalAngle - 90) * (Math.PI / 180);
                return {
                    x: cx + r * Math.cos(rad),
                    y: cy + r * Math.sin(rad)
                };

            } else {
                // Right Side (Datastore or other)
                // Just Datastore flows for now based on ProcessNode logic
                const datastoreFlows = { incoming: [] as string[], outgoing: [] as string[] };

                incoming.forEach(f => {
                    const src = diagram.nodes.find(n => n.id === f.sourceNodeId);
                    if (src?.type === 'datastore') datastoreFlows.incoming.push(f.id);
                });
                outgoing.forEach(f => {
                    const tgt = diagram.nodes.find(n => n.id === f.targetNodeId);
                    if (tgt?.type === 'datastore') datastoreFlows.outgoing.push(f.id);
                });

                // ProcessNode joins In then Out (implicitly in construction of rightFlows)
                // RIGHT side logic:
                // incoming.forEach -> push target
                // outgoing.forEach -> push source
                // Order: incoming first (from top of code exec), then outgoing.
                const allRightFlows = [...datastoreFlows.incoming, ...datastoreFlows.outgoing];
                const flowIndex = allRightFlows.indexOf(edgeId);

                if (flowIndex === -1) {
                    // Fallback: simple center-ish
                    return { x: cx + r, y: cy };
                }

                const rightAngles = distributeAngles(10, 170, allRightFlows.length);
                const baseAngle = rightAngles[flowIndex];

                const manualOffset = isSourceHandle ? (thisEdge.sourceAngleOffset || 0) : (thisEdge.targetAngleOffset || 0);
                let finalAngle = baseAngle + manualOffset;
                if (finalAngle < 0) finalAngle += 360;

                const rad = (finalAngle - 90) * (Math.PI / 180);
                return {
                    x: cx + r * Math.cos(rad),
                    y: cy + r * Math.sin(rad)
                };
            }
        };

        // Helper to decode Entity handle position
        const decodeEntityPosition = (encodedOffset: number) => {
            if (encodedOffset === 0) return { side: 'right', offset: 50 };
            const norm = Math.max(0, Math.min(100, encodedOffset));
            if (norm < 25) return { side: 'top', offset: (norm / 25) * 100 };
            if (norm < 50) return { side: 'right', offset: ((norm - 25) / 25) * 100 };
            if (norm < 75) return { side: 'bottom', offset: ((norm - 50) / 25) * 100 };
            return { side: 'left', offset: ((norm - 75) / 25) * 100 };
        };

        // Helper to decode DataStore handle position
        const decodeDataStorePosition = (encodedOffset: number) => {
            if (encodedOffset === 0) return { side: 'bottom', offset: 50 };
            const norm = Math.max(0, Math.min(100, encodedOffset));
            if (norm < 50) return { side: 'top', offset: (norm / 50) * 100 };
            return { side: 'bottom', offset: ((norm - 50) / 50) * 100 };
        };

        // Helper to get exact handle position
        const getNodeHandlePosition = (node: any, edge: any, isSourceHandle: boolean) => {
            const w = node.width ?? 150;
            const h = node.height ?? 80;
            const x = node.position.x;
            const y = node.position.y;
            const offset = isSourceHandle ? edge.sourceAngleOffset : edge.targetAngleOffset;

            if (node.type === 'entity') {
                const { side, offset: pct } = decodeEntityPosition(offset ?? 0);
                if (side === 'top') return { x: x + (w * pct / 100), y: y };
                if (side === 'bottom') return { x: x + (w * pct / 100), y: y + h };
                if (side === 'left') return { x: x, y: y + (h * pct / 100) };
                return { x: x + w, y: y + (h * pct / 100) };
            }
            else if (node.type === 'datastore') {
                const { side, offset: pct } = decodeDataStorePosition(offset ?? 0);
                if (side === 'top') return { x: x + (w * pct / 100), y: y };
                return { x: x + (w * pct / 100), y: y + h };
            }
            else if (node.type === 'process' || node.type === 'process_ref') {
                return getProcessHandlePosition(node, edge.id, isSourceHandle);
            }
            // Default center
            return { x: x + w / 2, y: y + h / 2 };
        };

        const getEdgeSegments = (otherEdge: any) => {
            const sourceNode = getNodes().find(n => n.id === otherEdge.sourceNodeId);
            const targetNode = getNodes().find(n => n.id === otherEdge.targetNodeId);
            if (!sourceNode || !targetNode) return [];

            const p1 = getNodeHandlePosition(sourceNode, otherEdge, true);
            const p2 = getNodeHandlePosition(targetNode, otherEdge, false);

            let dir = (otherEdge.arrowDirection as string) || 'horizontal-first';
            if (dir !== 'horizontal-first' && dir !== 'vertical-first') dir = 'horizontal-first';

            const segments: Array<{ p1: { x: number, y: number }, p2: { x: number, y: number }, type: 'h' | 'v' }> = [];

            // Replicate L-shape path
            if (dir === 'horizontal-first') {
                // p1 -> (p2.x, p1.y) -> p2
                segments.push(
                    { p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p1.y }, type: 'h' },
                    { p1: { x: p2.x, y: p1.y }, p2: { x: p2.x, y: p2.y }, type: 'v' }
                );
            } else {
                // p1 -> (p1.x, p2.y) -> p2
                segments.push(
                    { p1: { x: p1.x, y: p1.y }, p2: { x: p1.x, y: p2.y }, type: 'v' },
                    { p1: { x: p1.x, y: p2.y }, p2: { x: p2.x, y: p2.y }, type: 'h' }
                );
            }
            return segments;
        };

        const intersections: Array<{ dist: number, pt: { x: number, y: number }, segmentIndex: number }> = [];
        const jumpRadius = 6;

        // Only calculate jumps if this is a Manual edge (Level 0/1 or Manual override)
        if (!useSmartRouting) {
            diagram.edges.forEach(otherEdge => {
                if (otherEdge.id === id) return;
                // Only check Manual edges for collisions for now
                if (otherEdge.arrowDirection === 'smart') return;

                const otherSegments = getEdgeSegments(otherEdge);

                // Compare my segments vs other segments
                segments.forEach((mySeg, myIdx) => {
                    otherSegments.forEach(otherSeg => {
                        const myType = (mySeg.p1.y === mySeg.p2.y) ? 'h' : 'v';
                        const otherType = otherSeg.type;

                        // Only perpendicular lines intersect for jumps
                        if (myType !== otherType) {
                            // Convention: Vertical lines jump over Horizontal lines
                            if (myType === 'v') {
                                // Me: V, Them: H
                                const minY = Math.min(mySeg.p1.y, mySeg.p2.y);
                                const maxY = Math.max(mySeg.p1.y, mySeg.p2.y);
                                const otherY = otherSeg.p1.y; // Horizontal line Y

                                const minX = Math.min(otherSeg.p1.x, otherSeg.p2.x);
                                const maxX = Math.max(otherSeg.p1.x, otherSeg.p2.x);
                                const myX = mySeg.p1.x;

                                if (otherY > minY + jumpRadius && otherY < maxY - jumpRadius &&
                                    myX > minX + jumpRadius && myX < maxX - jumpRadius) {
                                    intersections.push({
                                        dist: Math.abs(otherY - mySeg.p1.y),
                                        pt: { x: myX, y: otherY },
                                        segmentIndex: myIdx
                                    });
                                }
                            }
                        }
                    });
                });
            });
        }

        // --- Path Generation with Jumps ---
        path = `M ${segments[0].p1.x},${segments[0].p1.y}`;

        segments.forEach((seg, idx) => {
            // Find jumps for this segment
            const jumps = intersections
                .filter(i => i.segmentIndex === idx)
                .sort((a, b) => a.dist - b.dist);

            const isHoriz = (seg.p1.y === seg.p2.y);
            const signX = Math.sign(seg.p2.x - seg.p1.x) || 1;
            const signY = Math.sign(seg.p2.y - seg.p1.y) || 1;

            jumps.forEach(jump => {
                if (isHoriz) {
                    const jumpStart = jump.pt.x - (jumpRadius * signX);
                    path += ` L ${jumpStart},${jump.pt.y}`;
                    const jumpEnd = jump.pt.x + (jumpRadius * signX);
                    // Arc: rx ry rot large sweep x y
                    path += ` A ${jumpRadius},${jumpRadius} 0 0 1 ${jumpEnd},${jump.pt.y}`;
                } else {
                    const jumpStart = jump.pt.y - (jumpRadius * signY);
                    path += ` L ${jump.pt.x},${jumpStart}`;
                    const jumpEnd = jump.pt.y + (jumpRadius * signY);
                    path += ` A ${jumpRadius},${jumpRadius} 0 0 1 ${jump.pt.x},${jumpEnd}`;
                }
            });

            // Finish segment
            path += ` L ${seg.p2.x},${seg.p2.y}`;
        });

        // Calculate label position for Manual
        if (currentDirection === 'horizontal-first') {
            const horizontalLength = Math.abs(targetX - sourceX);
            const verticalLength = Math.abs(targetY - sourceY);
            const totalLength = horizontalLength + verticalLength;
            const offsetDistance = totalLength * labelOffset;

            if (offsetDistance <= horizontalLength) {
                labelX = sourceX + (targetX - sourceX) * (offsetDistance / horizontalLength);
                labelY = sourceY;
            } else {
                labelX = targetX;
                const verticalOffset = offsetDistance - horizontalLength;
                labelY = sourceY + (targetY - sourceY) * (verticalOffset / verticalLength);
            }
        } else {
            const verticalLength = Math.abs(targetY - sourceY);
            const horizontalLength = Math.abs(targetX - sourceX);
            const totalLength = verticalLength + horizontalLength;
            const offsetDistance = totalLength * labelOffset;

            if (offsetDistance <= verticalLength) {
                labelX = sourceX;
                labelY = sourceY + (targetY - sourceY) * (offsetDistance / verticalLength);
            } else {
                const horizontalOffset = offsetDistance - verticalLength;
                labelX = sourceX + (targetX - sourceX) * (horizontalOffset / horizontalLength);
                labelY = targetY;
            }
        }
    }

    // Toggle arrow direction
    const handleToggleDirection = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        // Level 2: Smart -> Horizontal -> Vertical -> Smart
        if (isLevel2) {
            let newDirection: 'horizontal-first' | 'vertical-first' | 'smart' = 'smart';
            if (!storedDirection || storedDirection === 'smart') {
                newDirection = 'horizontal-first';
            } else if (storedDirection === 'horizontal-first') {
                newDirection = 'vertical-first';
            } else {
                newDirection = 'smart';
            }
            updateEdge(id, { arrowDirection: newDirection });
        } else {
            // Level 0/1: Horizontal <-> Vertical
            const newDirection = currentDirection === 'horizontal-first' ? 'vertical-first' : 'horizontal-first';
            updateEdge(id, { arrowDirection: newDirection });
        }
    };

    // Label click handler
    const handleLabelClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsLabelSelected(true);
    };

    // Keyboard navigation for label
    useEffect(() => {
        if (!isLabelSelected) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const newOffset = Math.max(0.1, labelOffset - 0.05);
                updateEdge(id, { labelOffset: newOffset });
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                const newOffset = Math.min(0.9, labelOffset + 0.05);
                updateEdge(id, { labelOffset: newOffset });
            } else if (e.key === 'Escape') {
                setIsLabelSelected(false);
            }
        };

        const handleClickOutside = () => {
            setIsLabelSelected(false);
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isLabelSelected, labelOffset, id, updateEdge]);

    // Button visibility: Global toggle OR Selected (Always allow, control internal logic)
    const isButtonVisible = showArrowButtons || selected;

    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                markerEnd={markerEnd}
                style={edgeStyle}
            />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        pointerEvents: 'all',
                        zIndex: 1001 // Ensure it's on top
                    }}
                    className="nodrag nopan"
                >
                    {isButtonVisible && (
                        <button
                            onClick={handleToggleDirection}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                width: '24px',
                                height: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                                transition: 'all 0.2s',
                                pointerEvents: 'all'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#2563eb';
                                e.currentTarget.style.transform = 'scale(1.1)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#3b82f6';
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                            title={`Toggle arrow direction (current: ${currentDirection})`}
                        >
                            <RotateCw size={14} />
                        </button>
                    )}

                    {label && (
                        <div
                            onClick={handleLabelClick}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                                background: isLabelSelected ? '#dbeafe' : '#ffffff',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#1e293b',
                                border: isLabelSelected ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                boxShadow: isLabelSelected ? '0 0 0 3px rgba(59, 130, 246, 0.2)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                pointerEvents: 'all',
                                userSelect: 'none',
                                transition: 'all 0.2s'
                            }}
                            title={isLabelSelected ? "Use ← → arrows to move, ESC to deselect" : "Click to select, then use arrow keys"}
                        >
                            {label}
                        </div>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
