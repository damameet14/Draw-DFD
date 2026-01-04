import { type FC } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from 'reactflow';

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
    style
}) => {
    // Create L-shaped path
    // If source is on circle (no specific side), go horizontal first then vertical
    // If source is on rectangle side, follow that orientation
    let path = '';
    let labelX = 0;
    let labelY = 0;

    // Circle handles use Position.Top, rectangle handles use actual positions
    // For circle→entity (OUT): horizontal first, then vertical
    // For entity→circle (IN): match the rectangle's handle position orientation

    if (sourcePosition === 'top' && (targetPosition === 'top' || targetPosition === 'bottom')) {
        // Circle → Entity (OUT arrow): go HORIZONTAL first, then VERTICAL
        path = `M ${sourceX},${sourceY} L ${targetX},${sourceY} L ${targetX},${targetY}`;
        labelX = (sourceX + targetX) / 2;
        labelY = sourceY;
    } else if (sourcePosition === 'right' || sourcePosition === 'left') {
        // Entity → Circle (IN arrow): go HORIZONTAL first, then VERTICAL  
        path = `M ${sourceX},${sourceY} L ${targetX},${sourceY} L ${targetX},${targetY}`;
        labelX = (sourceX + targetX) / 2;
        labelY = sourceY;
    } else if (sourcePosition === 'bottom') {
        // Vertical first, then horizontal
        path = `M ${sourceX},${sourceY} L ${sourceX},${targetY} L ${targetX},${targetY}`;
        labelX = sourceX;
        labelY = (sourceY + targetY) / 2;
    } else {
        // Default: horizontal first
        path = `M ${sourceX},${sourceY} L ${targetX},${sourceY} L ${targetX},${targetY}`;
        labelX = (sourceX + targetX) / 2;
        labelY = sourceY;
    }

    return (
        <>
            <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            background: '#ffffff',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#1e293b',
                            pointerEvents: 'all',
                        }}
                        className="nodrag nopan"
                    >
                        {label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};
