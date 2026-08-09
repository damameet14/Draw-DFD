import { type NodeProps } from 'reactflow';
import { type DataStoreNode as DataStoreNodeType } from '../../data_flow_diagram_model/public_interface';
import { PlannedFlowHandles } from '../PlannedFlowHandles';
import { type HandlePlacement } from '../decomposedLevelLayout';
import styles from './DecomposedDataStoreNode.module.css';

/**
 * A data store on a laid-out level: open-ended above and below, with its flows
 * meeting it down the side that faces the process column.
 *
 * It grows taller as flows are added to it, because each one needs its own
 * height along that side — the same reason the process circles grow.
 */
export const PlannedDataStoreNode = ({
    data,
}: NodeProps<
    DataStoreNodeType & { width?: number; height?: number; layoutHandles?: HandlePlacement[] }
>) => (
    <div
        className={styles.dataStoreNode}
        style={{ width: `${data.width ?? 240}px`, height: `${data.height ?? 60}px` }}
    >
        <PlannedFlowHandles nodeId={data.id} placements={data.layoutHandles ?? []} />
        <div className={styles.storeLabel}>{data.label}</div>
    </div>
);
