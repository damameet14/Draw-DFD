import { type FC } from 'react';
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

    // Get the actual edge from the store to get the latest arrow direction
    const edge = diagram.edges.find(e => e.id === id);
    const storedDirection = edge?.arrowDirection as 'horizontal-first' | 'vertical-first' | undefined;

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

    // Create path based on direction
    if (currentDirection === 'horizontal-first') {
        // Horizontal first, then vertical
        path = `M ${sourceX},${sourceY} L ${targetX},${sourceY} L ${targetX},${targetY}`;
        labelX = (sourceX + targetX) / 2;
        labelY = sourceY;
    } else {
        // Vertical first, then horizontal
        path = `M ${sourceX},${sourceY} L ${sourceX},${targetY} L ${targetX},${targetY}`;
        labelX = sourceX;
        labelY = (sourceY + targetY) / 2;
    }

    // Toggle arrow direction
    const handleToggleDirection = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        const newDirection = currentDirection === 'horizontal-first' ? 'vertical-first' : 'horizontal-first';
        console.log(`Toggling edge ${id} from ${currentDirection} to ${newDirection}`);

        updateEdge(id, { arrowDirection: newDirection });
    };

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

                    {/* Label */}
                    {label && (
                        <div
                            style={{
                                background: '#ffffff',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#1e293b',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none'
                            }}
                        >
                            {label}
                        </div>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
