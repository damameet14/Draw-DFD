import { type NodeProps } from 'reactflow';
import { type ProcessNode as ProcessNodeType } from '../../data_flow_diagram_model/public_interface';
import { PlannedFlowHandles } from '../PlannedFlowHandles';
import { type HandlePlacement } from '../decomposedLevelLayout';
import styles from './DecomposedProcessNode.module.css';

/**
 * A process circle on a laid-out level.
 *
 * Size, position and every handle come from `planDecomposedLevelLayout`, so this
 * draws what it is given and nothing else — no resizing, no handle dragging.
 * Those belonged to the era when a decomposed level was arranged by hand, and
 * they cannot survive a layout that reroutes every flow from the arrangement.
 */
export const PlannedProcessNode = ({
    data,
}: NodeProps<ProcessNodeType & { layoutHandles?: HandlePlacement[] }>) => {
    const diameter = data.diameter ?? 200;
    const textSizeRem = (data.textSize ?? 16) / 16;

    return (
        <div
            className={styles.processNode}
            style={{ width: `${diameter}px`, height: `${diameter}px` }}
        >
            <PlannedFlowHandles nodeId={data.id} placements={data.layoutHandles ?? []} />

            <div className={styles.processCircle}>
                <div
                    className={styles.processHeader}
                    style={{ paddingTop: `${data.dividerPosition ?? 15}%` }}
                >
                    <span className={styles.processNumber} style={{ fontSize: `${textSizeRem}rem` }}>
                        {data.processNumber}
                    </span>
                </div>
                <div className={styles.processDivider}></div>
                <div className={styles.processBody}>
                    <span className={styles.processName} style={{ fontSize: `${textSizeRem}rem` }}>
                        {data.label}
                    </span>
                </div>
            </div>
        </div>
    );
};
