import { Handle, Position, type NodeProps } from 'reactflow';
import { type ProcessNode as ProcessNodeType } from '../../core/types';
import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './ProcessNode.module.css';

type QuadrantConfig = {
    inCircleSection: { start: number, end: number }; // Angles for IN handles on circle
    outCircleSection: { start: number, end: number }; // Angles for OUT handles on circle
};

const QUADRANT_CONFIGS: Record<string, QuadrantConfig> = {
    'top-left': {
        inCircleSection: { start: 340, end: 360 },      // Top of circle (near north)
        outCircleSection: { start: 250, end: 290 }      // Left side of circle (west)
    },
    'top-right': {
        inCircleSection: { start: 0, end: 20 },         // Top-right of circle  
        outCircleSection: { start: 70, end: 110 }       // Right side of circle (east)
    },
    'bottom-left': {
        inCircleSection: { start: 200, end: 240 },      // Left-bottom of circle
        outCircleSection: { start: 160, end: 200 }      // Bottom of circle (south)
    },
    'bottom-right': {
        inCircleSection: { start: 120, end: 160 },      // Right-bottom of circle
        outCircleSection: { start: 160, end: 200 }      // Bottom of circle (south)
    }
};

export const ProcessNode = ({ data, selected }: NodeProps<ProcessNodeType>) => {
    const { diagram } = useDiagramStore();

    // Get all flows connected to this process
    const incomingFlows = diagram.edges.filter(e => e.targetNodeId === data.id);
    const outgoingFlows = diagram.edges.filter(e => e.sourceNodeId === data.id);

    // Group flows by entity and assign quadrants based on entity order
    const entityFlows = new Map<string, {
        incoming: string[],
        outgoing: string[],
        quadrant: string,
        index: number
    }>();

    // Get all entity nodes
    const entityNodes = diagram.nodes.filter(n => n.type === 'entity');
    const quadrantOrder = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

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
        const entityData = entityFlows.get(flow.sourceNodeId);
        if (entityData) {
            entityData.incoming.push(flow.id);
        }
    });

    outgoingFlows.forEach(flow => {
        const entityData = entityFlows.get(flow.targetNodeId);
        if (entityData) {
            entityData.outgoing.push(flow.id);
        }
    });

    // Generate handles based on quadrant configuration
    const handles: Array<{
        id: string,
        angle: number,
        type: 'source' | 'target'
    }> = [];

    entityFlows.forEach((entityData) => {
        const config = QUADRANT_CONFIGS[entityData.quadrant];

        // IN handles (incoming to process)
        const inCount = entityData.incoming.length;
        if (inCount > 0) {
            const sectionSize = config.inCircleSection.end - config.inCircleSection.start;
            entityData.incoming.forEach((flowId, index) => {
                const angle = config.inCircleSection.start +
                    (sectionSize * (index + 1)) / (inCount + 1);
                handles.push({ id: flowId, angle, type: 'target' });
            });
        }

        // OUT handles (outgoing from process)
        const outCount = entityData.outgoing.length;
        if (outCount > 0) {
            const sectionSize = config.outCircleSection.end - config.outCircleSection.start;
            entityData.outgoing.forEach((flowId, index) => {
                const angle = config.outCircleSection.start +
                    (sectionSize * (index + 1)) / (outCount + 1);
                handles.push({ id: flowId, angle, type: 'source' });
            });
        }
    });

    // Convert angle to position on circle
    const circleRadius = 100; // 200px diameter / 2
    const getHandlePosition = (angle: number) => {
        const rad = (angle - 90) * (Math.PI / 180); // -90 to start from top
        const x = circleRadius + circleRadius * Math.cos(rad);
        const y = circleRadius + circleRadius * Math.sin(rad);
        return { top: `${y}px`, left: `${x}px` };
    };

    return (
        <div className={`${styles.processNode} ${selected ? styles.selected : ''}`}>
            {/* Dynamic handles */}
            {handles.map(handle => {
                const pos = getHandlePosition(handle.angle);
                return (
                    <Handle
                        key={handle.id}
                        type={handle.type}
                        position={Position.Top}
                        id={handle.id}
                        style={{
                            ...pos,
                            width: 10,
                            height: 10,
                            background: handle.type === 'source' ? '#34d399' : '#60a5fa',
                            border: '2px solid #fff',
                            position: 'absolute',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10
                        }}
                    />
                );
            })}

            <div className={styles.processNumber}>{data.processNumber}</div>
            <div className={styles.processLabel}>{data.label}</div>
        </div>
    );
};
