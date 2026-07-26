import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, XCircle } from 'lucide-react';
import { useDiagramStore } from '../diagram_state/public_interface';
import {
    type DFDDiagram,
    type ValidationResult,
} from '../data_flow_diagram_model/public_interface';
import styles from './ValidationFindingsPanel.module.css';

const SEVERITY_ORDER: Record<ValidationResult['severity'], number> = {
    error: 0,
    warning: 1,
    info: 2,
};

const SEVERITY_ICON = {
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
} as const;

/**
 * Names the node or edge a finding points at, so the list reads as "Process 1.0"
 * rather than as an opaque identifier. Falls back to the identifier when the
 * element has already been deleted, which happens for the brief window in which
 * a dangling-edge finding outlives its node.
 */
function describeFindingTarget(finding: ValidationResult, diagram: DFDDiagram): string | null {
    if (finding.nodeId) {
        const node = diagram.nodes.find((candidate) => candidate.id === finding.nodeId);
        if (!node) return finding.nodeId;

        if (node.type === 'process') return `Process ${node.processNumber || '?'} ${node.label}`.trim();
        if (node.type === 'datastore') return `Store ${node.storeCode || '?'} ${node.label}`.trim();
        return node.label || finding.nodeId;
    }

    if (finding.edgeId) {
        const edge = diagram.edges.find((candidate) => candidate.id === finding.edgeId);
        if (!edge) return finding.edgeId;
        return edge.label ? `Flow "${edge.label}"` : 'Unnamed flow';
    }

    return null;
}

interface ValidationFindingsPanelProps {
    findings: ValidationResult[];
    focusedElementId: string | null;
    onFocusElement: (elementId: string | null) => void;
}

/**
 * Surfaces the findings produced by `diagram_validation` for the level on
 * screen, and lets a user jump from a finding to the element that caused it.
 *
 * Lives in the application shell rather than in the canvas because it is
 * chrome around the diagram, not part of it.
 */
export function ValidationFindingsPanel({
    findings,
    focusedElementId,
    onFocusElement,
}: ValidationFindingsPanelProps) {
    const diagram = useDiagramStore((state) => state.diagram);
    const [isExpanded, setIsExpanded] = useState(false);

    const sortedFindings = useMemo(
        () => [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
        [findings]
    );

    const errorCount = findings.filter((finding) => finding.severity === 'error').length;
    const warningCount = findings.filter((finding) => finding.severity === 'warning').length;

    if (findings.length === 0) {
        return (
            <div className={styles.panel}>
                <div className={`${styles.summary} ${styles.summaryClean}`}>
                    <CheckCircle2 size={16} />
                    <span>No issues on this level</span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            <button
                className={`${styles.summary} ${errorCount > 0 ? styles.summaryError : styles.summaryWarning}`}
                onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
                aria-expanded={isExpanded}
            >
                {errorCount > 0 ? <XCircle size={16} /> : <AlertTriangle size={16} />}
                <span>
                    {errorCount > 0 && `${errorCount} error${errorCount === 1 ? '' : 's'}`}
                    {errorCount > 0 && warningCount > 0 && ', '}
                    {warningCount > 0 && `${warningCount} warning${warningCount === 1 ? '' : 's'}`}
                </span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>

            {isExpanded && (
                <ul className={styles.findingList}>
                    {sortedFindings.map((finding) => {
                        const SeverityIcon = SEVERITY_ICON[finding.severity];
                        const targetId = finding.nodeId ?? finding.edgeId ?? null;
                        const targetDescription = describeFindingTarget(finding, diagram);
                        const isFocused = targetId !== null && targetId === focusedElementId;

                        return (
                            <li key={finding.id}>
                                <button
                                    className={`${styles.finding} ${styles[finding.severity]} ${isFocused ? styles.findingFocused : ''}`}
                                    onClick={() => onFocusElement(isFocused ? null : targetId)}
                                    // A diagram-wide finding has nothing to focus.
                                    disabled={targetId === null}
                                >
                                    <SeverityIcon size={14} className={styles.findingIcon} />
                                    <span className={styles.findingText}>
                                        <span className={styles.findingMessage}>{finding.message}</span>
                                        <span className={styles.findingMeta}>
                                            <code>{finding.ruleCode}</code>
                                            {targetDescription && <> · {targetDescription}</>}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
