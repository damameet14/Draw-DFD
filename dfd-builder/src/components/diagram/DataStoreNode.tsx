import { Handle, Position, type NodeProps } from 'reactflow';
import { type DataStoreNode as DataStoreNodeType } from '../../core/types';
import styles from './DataStoreNode.module.css';

export const DataStoreNode = ({ data, selected }: NodeProps<DataStoreNodeType>) => {
    return (
        <div className={`${styles.dataStoreNode} ${selected ? styles.selected : ''}`}>
            <Handle type="target" position={Position.Top} style={{ width: 8, height: 8, background: '#60a5fa' }} />
            <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: '#60a5fa' }} />

            <div className={styles.storeId}>{data.storeCode}</div>
            <div className={styles.storeLabel}>{data.label}</div>

            <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: '#34d399' }} />
            <Handle type="source" position={Position.Bottom} style={{ width: 8, height: 8, background: '#34d399' }} />
        </div>
    );
};
