import { Handle, Position, type NodeProps } from 'reactflow';
import { type EntityNode as EntityNodeType } from '../../core/types';
import { useDiagramStore } from '../../store/useDiagramStore';
import styles from './EntityNode.module.css';

type QuadrantHandleConfig = {
    inSide: Position;   // Which side of rectangle for IN handles (entity→process)
    outSide: Position;  // Which side of rectangle for OUT handles (process→entity)
};

const QUADRANT_HANDLE_CONFIGS: Record<string, QuadrantHandleConfig> = {
    'top-left': {
        inSide: Position.Right,      // IN: entity RIGHT → process
        outSide: Position.Bottom     // OUT: process → entity BOTTOM
    },
    'top-right': {
        inSide: Position.Left,       // IN: entity LEFT → process
        outSide: Position.Bottom     // OUT: process → entity BOTTOM
    },
    'bottom-left': {
        inSide: Position.Right,      // IN: entity RIGHT → process
        outSide: Position.Top        // OUT: process → entity TOP
    },
    'bottom-right': {
        inSide: Position.Right,      // IN: entity RIGHT → process
        outSide: Position.Top        // OUT: process → entity TOP
    }
};

export const EntityNode = ({ data, selected }: NodeProps<EntityNodeType>) => {
    const { diagram } = useDiagramStore();

    // Determine this entity's quadrant based on order
    const entityNodes = diagram.nodes.filter(n => n.type === 'entity');
    const entityIndex = entityNodes.findIndex(n => n.id === data.id);
    const quadrantOrder = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const quadrant = quadrantOrder[entityIndex % 4];
    const config = QUADRANT_HANDLE_CONFIGS[quadrant];

    console.log(`EntityNode ${data.label}:`, { quadrant, config });

    // Get flows connected to this entity
    const incomingFlows = diagram.edges.filter(e =>
        e.targetNodeId === data.id && e.sourceNodeId !== data.id
    );
    const outgoingFlows = diagram.edges.filter(e =>
        e.sourceNodeId === data.id && e.targetNodeId !== data.id
    );

    console.log(`${data.label} flows:`, {
        incoming: incomingFlows.map(f => ({ id: f.id, label: f.label, from: f.sourceNodeId })),
        outgoing: outgoingFlows.map(f => ({ id: f.id, label: f.label, to: f.targetNodeId }))
    });

    // Generate handle configurations
    const handles: Array<{
        id: string,
        position: Position,
        type: 'source' | 'target'
    }> = [];

    // Flows FROM process TO entity - these are TARGET handles on BOTTOM
    incomingFlows.forEach(flow => {
        console.log(`Creating TARGET handle for ${flow.label} at ${config.outSide}`);
        handles.push({
            id: flow.id,
            position: config.outSide,  // OUT from process = Bottom of entity
            type: 'target'
        });
    });

    // Flows FROM entity TO process - these are SOURCE handles on RIGHT
    outgoingFlows.forEach(flow => {
        console.log(`Creating SOURCE handle for ${flow.label} at ${config.inSide}`);
        handles.push({
            id: flow.id,
            position: config.inSide,   // IN to process = Right of entity
            type: 'source'
        });
    });

    console.log(`${data.label} handles:`, handles);

    // Calculate handle spacing
    const getHandleStyle = (position: Position, index: number, total: number) => {
        const isHorizontal = position === Position.Left || position === Position.Right;
        const offset = ((index + 1) / (total + 1)) * 100; // Percentage

        if (isHorizontal) {
            return { top: `${offset}%` };
        } else {
            return { left: `${offset}%` };
        }
    };

    // Group handles by position for spacing
    const handlesByPosition = new Map<Position, typeof handles>();
    handles.forEach(h => {
        if (!handlesByPosition.has(h.position)) {
            handlesByPosition.set(h.position, []);
        }
        handlesByPosition.get(h.position)!.push(h);
    });

    return (
        <div className={`${styles.entityNode} ${selected ? styles.selected : ''}`}>
            {/* Dynamic handles */}
            {Array.from(handlesByPosition.entries()).map(([position, posHandles]) =>
                posHandles.map((handle, index) => (
                    <Handle
                        key={handle.id}
                        type={handle.type}
                        position={handle.position}
                        id={handle.id}
                        style={{
                            ...getHandleStyle(position, index, posHandles.length),
                            width: 10,
                            height: 10,
                            background: handle.type === 'source' ? '#34d399' : '#60a5fa',
                            border: '2px solid #fff',
                            zIndex: 10
                        }}
                    />
                ))
            )}

            <div className={styles.entityLabel}>{data.label}</div>
        </div>
    );
};
