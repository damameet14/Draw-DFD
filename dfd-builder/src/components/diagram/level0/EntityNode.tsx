import { Handle, Position, type NodeProps, NodeResizer, useUpdateNodeInternals } from 'reactflow';
import { useEffect, useRef, useContext } from 'react';
import { type EntityNode as EntityNodeType } from '../../../core/types';
import { useDiagramStore } from '../../../store/useDiagramStore';
import styles from './EntityNode.module.css';
import { UIVisibilityContext } from '../../../App';
import { getEntityLayoutInfo } from './ProcessNode';

type Side = 'top' | 'right' | 'bottom' | 'left';

export const EntityNode = ({ data, selected }: NodeProps<EntityNodeType>) => {
    const { diagram, updateNode } = useDiagramStore();
    const updateNodeInternals = useUpdateNodeInternals();
    const { showHandles } = useContext(UIVisibilityContext);
    const nodeRef = useRef<HTMLDivElement>(null);

    const width = data.width || 120;
    const height = data.height || 120;

    // Determine this entity's index and layout info
    const entityNodes = diagram.nodes.filter(n => n.type === 'entity' && n.level === 0);
    const entityIndex = entityNodes.findIndex(n => n.id === data.id);
    const totalEntities = entityNodes.length;

    // Get layout info (quadrant, handle sides) from the pure function
    const layoutInfo = entityIndex >= 0 ? getEntityLayoutInfo(entityIndex, totalEntities) : null;
    const inSide: Side = layoutInfo?.entityInSide || 'right';
    const outSide: Side = layoutInfo?.entityOutSide || 'bottom';

    // Get flows connected to this entity
    const incomingFlows = diagram.edges.filter(e =>
        e.targetNodeId === data.id && e.sourceNodeId !== data.id
    );
    const outgoingFlows = diagram.edges.filter(e =>
        e.sourceNodeId === data.id && e.targetNodeId !== data.id
    );

    interface EntityHandle {
        id: string;
        side: Side;
        offset: number;
        type: 'source' | 'target';
    }

    const rawHandles: EntityHandle[] = [];

    // Incoming flows (Process → Entity) = target handles = OUT side on Entity
    incomingFlows.forEach((flow, idx) => {
        const count = incomingFlows.length;
        const offset = count === 1 ? 50 : 20 + (idx * 60 / Math.max(1, count - 1));
        rawHandles.push({ id: flow.id, side: outSide, offset, type: 'target' });
    });

    // Outgoing flows (Entity → Process) = source handles = IN side on Entity
    outgoingFlows.forEach((flow, idx) => {
        const count = outgoingFlows.length;
        const offset = count === 1 ? 50 : 20 + (idx * 60 / Math.max(1, count - 1));
        rawHandles.push({ id: flow.id, side: inSide, offset, type: 'source' });
    });

    // DISTRIBUTE HANDLES LOGIC
    const distributedHandles: EntityHandle[] = [];
    const minSpacingPx = 25;

    (['top', 'right', 'bottom', 'left'] as Side[]).forEach(side => {
        const sideHandles = rawHandles
            .filter(h => h.side === side)
            .sort((a, b) => {
                if (Math.abs(a.offset - b.offset) > 0.1) return a.offset - b.offset;
                return a.id.localeCompare(b.id);
            });

        if (sideHandles.length === 0) return;

        const sideLength = (side === 'top' || side === 'bottom') ? width : height;
        let positionsPx = sideHandles.map(h => (h.offset / 100) * sideLength);

        let changed = true;
        let iterations = 0;

        while (changed && iterations < 10) {
            changed = false;
            iterations++;

            for (let i = 0; i < positionsPx.length - 1; i++) {
                const current = positionsPx[i];
                const next = positionsPx[i + 1];
                const diff = next - current;

                if (diff < minSpacingPx) {
                    const center = (current + next) / 2;
                    const halfSpace = minSpacingPx / 2.0;
                    positionsPx[i] = center - halfSpace;
                    positionsPx[i + 1] = center + halfSpace;
                    changed = true;
                }
            }

            positionsPx.sort((a, b) => a - b);
        }

        sideHandles.forEach((h, i) => {
            const visualOffset = (positionsPx[i] / sideLength) * 100;
            distributedHandles.push({ ...h, offset: visualOffset });
        });
    });

    // Update node internals when handles change
    useEffect(() => {
        const t = setTimeout(() => {
            updateNodeInternals(data.id);
        }, 50);
        return () => clearTimeout(t);
    }, [distributedHandles.length, width, height, data.id, updateNodeInternals, diagram.edges, entityIndex]);

    // Auto-resize if needed
    useEffect(() => {
        let newWidth = width;
        let newHeight = height;
        let shouldResize = false;
        const minPadding = 20;

        const countMap = { top: 0, right: 0, bottom: 0, left: 0 };
        distributedHandles.forEach(h => countMap[h.side]++);

        const requiredW = Math.max(
            (countMap.top * minSpacingPx) + minPadding,
            (countMap.bottom * minSpacingPx) + minPadding,
            120
        );

        const requiredH = Math.max(
            (countMap.left * minSpacingPx) + minPadding,
            (countMap.right * minSpacingPx) + minPadding,
            120
        );

        if (requiredW > width || requiredH > height) {
            const newSize = Math.max(requiredW, requiredH, width, height);
            newWidth = newSize;
            newHeight = newSize;
            shouldResize = true;
        }

        if (shouldResize) {
            const timer = setTimeout(() => {
                updateNode(data.id, { width: newWidth, height: newHeight });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [distributedHandles.length, width, height, data.id, updateNode]);

    const getHandleStyleAndPosition = (side: Side, offset: number) => {
        const clampedOffset = Math.max(0, Math.min(100, offset));

        let style: any = {};
        let position: Position;

        switch (side) {
            case 'top':
                style = { top: 0, left: `${clampedOffset}%` };
                position = Position.Top;
                break;
            case 'bottom':
                style = { bottom: 0, left: `${clampedOffset}%` };
                position = Position.Bottom;
                break;
            case 'left':
                style = { left: 0, top: `${clampedOffset}%` };
                position = Position.Left;
                break;
            case 'right':
                style = { right: 0, top: `${clampedOffset}%` };
                position = Position.Right;
                break;
        }

        return { style, position };
    };

    const onResize = (_event: any, params: any) => {
        const size = Math.max(params.width, params.height);
        updateNode(data.id, { width: size, height: size });
    };

    return (
        <div
            ref={nodeRef}
            className={`${styles.entityNode} ${selected ? styles.selected : ''}`}
            style={{ width: `${width}px`, height: `${height}px` }}
        >
            <NodeResizer
                isVisible={selected}
                minWidth={100}
                minHeight={100}
                onResize={onResize}
                keepAspectRatio={true}
                handleStyle={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                }}
            />

            {showHandles && distributedHandles.map(handle => {
                const { style, position } = getHandleStyleAndPosition(handle.side, handle.offset);
                return (
                    <Handle
                        key={handle.id}
                        type={handle.type}
                        position={position}
                        id={handle.id}
                        style={{
                            ...style,
                            width: 10,
                            height: 10,
                            background: handle.type === 'source' ? '#34d399' : '#60a5fa',
                            border: '2px solid #fff',
                            zIndex: 10,
                            cursor: 'default',
                            transition: 'all 0.2s'
                        }}
                    />
                );
            })}

            <div className={styles.entityLabel}>{data.label}</div>
        </div>
    );
};
