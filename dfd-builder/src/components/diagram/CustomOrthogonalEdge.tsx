import { type FC, useState, useEffect, useContext } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, useReactFlow } from 'reactflow';
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
    label,
    markerEnd,
    style
}) => {
    const { diagram, updateEdge } = useDiagramStore();
    const { showArrowButtons } = useContext(UIVisibilityContext);
    const [isLabelSelected, setIsLabelSelected] = useState(false);
    const { getEdges } = useReactFlow();

    // Get the actual edge from the store
    const edge = diagram.edges.find(e => e.id === id);
    const storedDirection = edge?.arrowDirection as 'horizontal-first' | 'vertical-first' | undefined;
    const labelOffset = edge?.labelOffset ?? 0.5;

    let currentDirection: 'horizontal-first' | 'vertical-first' = 'horizontal-first';

    // Determine path direction
    if (storedDirection) {
        currentDirection = storedDirection;
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

    // Detect intersections with other edges
    const intersections: Array<{ x: number, y: number, segmentIndex: number }> = [];
    const allEdges = getEdges();

    allEdges.forEach(otherEdge => {
        if (otherEdge.id === id) return;

        // Get other edge positions (simplified - assumes orthogonal edges)
        const otherData = otherEdge.data as any;
        if (!otherData) return;

        // For simplicity, we'll check if this is a vertical line crossing a horizontal, or vice versa
        // We need source and target positions for the other edge
        // This is a limitation - we'd need access to actual edge coords
        // For now, we'll use the data passed through
    });

    // Build path with wire jumps
    let path = '';
    const bumpRadius = 8; // Radius of the semicircular bump

    if (currentDirection === 'horizontal-first') {
        // Horizontal segment first
        const h = segments[0];
        const crossings = intersections.filter(i => i.segmentIndex === 0);

        if (crossings.length === 0 || Math.abs(h.p1.y - h.p2.y) > 1) {
            // Vertical segment - add bumps
            path = `M ${h.p1.x},${h.p1.y}`;

            // Sort crossings by position
            crossings.sort((a, b) => Math.abs(a.y - h.p1.y) - Math.abs(b.y - h.p1.y));

            crossings.forEach(cross => {
                // Draw to just before the crossing
                path += ` L ${h.p1.x},${cross.y - bumpRadius}`;
                // Add semicircular arc (bump to the right)
                path += ` A ${bumpRadius},${bumpRadius} 0 0 1 ${h.p1.x},${cross.y + bumpRadius}`;
            });
            path += ` L ${h.p2.x},${h.p2.y}`;
        } else {
            // Horizontal segment
            path = `M ${h.p1.x},${h.p1.y} L ${h.p2.x},${h.p2.y}`;
        }

        // Vertical segment
        const v = segments[1];
        path += ` L ${v.p2.x},${v.p2.y}`;
    } else {
        // Vertical segment first
        const v = segments[0];
        path = `M ${v.p1.x},${v.p1.y}`;

        // Check if vertical - could have crossings
        const crossings = intersections.filter(i => i.segmentIndex === 0);

        if (crossings.length > 0) {
            crossings.sort((a, b) => Math.abs(a.y - v.p1.y) - Math.abs(b.y - v.p1.y));

            crossings.forEach(cross => {
                path += ` L ${v.p1.x},${cross.y - bumpRadius}`;
                path += ` A ${bumpRadius},${bumpRadius} 0 0 1 ${v.p1.x},${cross.y + bumpRadius}`;
            });
            path += ` L ${v.p2.x},${v.p2.y}`;
        } else {
            path += ` L ${v.p2.x},${v.p2.y}`;
        }

        // Horizontal segment
        const h = segments[1];
        path += ` L ${h.p2.x},${h.p2.y}`;
    }

    // Calculate label position (same as before)
    let labelX = 0;
    let labelY = 0;

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

    // Toggle arrow direction
    const handleToggleDirection = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        const newDirection = currentDirection === 'horizontal-first' ? 'vertical-first' : 'horizontal-first';
        updateEdge(id, { arrowDirection: newDirection });
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

    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                markerEnd={markerEnd}
                style={style}
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
                        pointerEvents: 'all'
                    }}
                    className="nodrag nopan"
                >
                    {showArrowButtons && (
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
