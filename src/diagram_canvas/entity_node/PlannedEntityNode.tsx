import { type NodeProps } from 'reactflow';
import { type EntityNode as EntityNodeType } from '../../data_flow_diagram_model/public_interface';
import { PlannedFlowHandles } from '../PlannedFlowHandles';
import { type HandlePlacement } from '../decomposedLevelLayout';
import styles from './DecomposedEntityNode.module.css';

/**
 * An external entity — or a referenced process, which is drawn the same way — on
 * a laid-out level. Size, position and handles all come from the level layout.
 */
export const PlannedEntityNode = ({
    data,
}: NodeProps<EntityNodeType & { layoutHandles?: HandlePlacement[] }>) => (
    <div
        className={styles.entityNode}
        style={{ width: `${data.width ?? 200}px`, height: `${data.height ?? 90}px` }}
    >
        <PlannedFlowHandles nodeId={data.id} placements={data.layoutHandles ?? []} />
        <div className={styles.entityLabel}>{data.label}</div>
    </div>
);
