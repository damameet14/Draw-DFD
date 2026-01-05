import { type FC, useState, useEffect } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from 'reactflow';
import { useDiagramStore } from '../../store/useDiagramStore';
import { RotateCw } from 'lucide-react';

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
    const [isLabelSelected, setIsLabelSelected] = useState(false);

    // Get the actual edge from the store to get the latest arrow direction and label offset
    const edge = diagram.edges.find(e => e.id === id);
    const storedDirection = edge?.arrowDirection as 'horizontal-first' | 'vertical-first' | undefined;
    const labelOffset = edge?.labelOffset ?? 0.5; // Default to center (0.5)

    let path = '';
    let labelX = 0;
    let labelY = 0;
    let currentDirection: 'horizontal-first' | 'vertical-first' = 'horizontal-first';

    // Determine path based on preference or defaults
    if (storedDirection) {
        currentDirection = storedDirection;
    } else if (sourcePosition === 'bottom') {
        currentDirection = 'vertical-first';
    } else {
        currentDirection = 'horizontal-first';
    }

    // Create path based on direction and calculate label position
    if (currentDirection === 'horizontal-first') {
        // Horizontal first, then vertical
        path = `M ${sourceX},${sourceY} L ${targetX},${sourceY} L ${targetX},${targetY}`;

        // Calculate label position along path based on labelOffset
        const horizontalLength = Math.abs(targetX - sourceX);
        const verticalLength = Math.abs(targetY - sourceY);
        const totalLength = horizontalLength + verticalLength;
        const offsetDistance = totalLength * labelOffset;

        if (offsetDistance <= horizontalLength) {
            // Label is on horizontal segment
            labelX = sourceX + (targetX - sourceX) * (offsetDistance / horizontalLength);
            labelY = sourceY;
        } else {
            // Label is on vertical segment
            labelX = targetX;
            const verticalOffset = offsetDistance - horizontalLength;
            labelY = sourceY + (targetY - sourceY) * (verticalOffset / verticalLength);
        }
    } else {
        // Vertical first, then horizontal
        path = `M ${sourceX},${sourceY} L ${sourceX},${targetY} L ${targetX},${targetY}`;

        // Calculate label position along path based on labelOffset
        const verticalLength = Math.abs(targetY - sourceY);
        const horizontalLength = Math.abs(targetX - sourceX);
        const totalLength = verticalLength + horizontalLength;
        const offsetDistance = totalLength * labelOffset;

        if (offsetDistance <= verticalLength) {
            // Label is on vertical segment
            labelX = sourceX;
            labelY = sourceY + (targetY - sourceY) * (offsetDistance / verticalLength);
        } else {
            // Label is on horizontal segment
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

    // Handle label click to select
    const handleLabelClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsLabelSelected(true);
    };

    // Handle keyboard arrow keys to move label
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
            // Deselect if clicking outside
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
                    {/* Rotate button */}
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

                    {/* Label - click to select, use arrows to move */}
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
