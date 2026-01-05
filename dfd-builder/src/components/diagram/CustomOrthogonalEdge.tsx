import { type FC, useState, useEffect, useContext } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from 'reactflow';
import { useDiagramStore } from '../../store/useDiagramStore';
import { RotateCw } from 'lucide-react';
import { UIVisibilityContext } from '../../App';

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
    // const { getEdges } = useReactFlow(); // Unused

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

        // Build path (Simple L-Shape)
        if (currentDirection === 'horizontal-first') {
            // Horizontal segment first
            const h = segments[0];
            const v = segments[1];
            path = `M ${h.p1.x},${h.p1.y} L ${h.p2.x},${h.p2.y} L ${v.p2.x},${v.p2.y}`;
        } else {
            // Vertical segment first
            const v = segments[0];
            const h = segments[1];
            path = `M ${v.p1.x},${v.p1.y} L ${v.p2.x},${v.p2.y} L ${h.p2.x},${h.p2.y}`;
        }

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
