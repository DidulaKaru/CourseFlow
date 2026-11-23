import { BookOpen, CircleAlert, FolderPlus, Gauge, Trash2 } from 'lucide-react';
import type { RuleIssue } from '@/core/algorithms/ast_evaluator';
import { canAddChild, issueNodePath, newGroup, NEW_COURSE_CONDITION, NEW_CREDIT_CONDITION, samePath } from '@/features/admin/utils/ruleTree';
import type { GroupOperator, NodePath } from '@/features/admin/utils/ruleTree';
import type { PrerequisiteRule } from '@/types/curriculum';

export interface RuleTreeActions {
    replace: (path: NodePath, node: PrerequisiteRule) => void;
    remove: (path: NodePath) => void;
    addChild: (path: NodePath, child: PrerequisiteRule) => void;
    setOperator: (path: NodePath, operator: GroupOperator) => void;
}

interface AstRuleNodeProps {
    node: PrerequisiteRule;
    path: NodePath;
    actions: RuleTreeActions;
    issues: RuleIssue[];
    /** `<datalist>` of the program's courses, shared by every course field. */
    courseListId: string;
    courseTitles: ReadonlyMap<string, string>;
}

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const SMALL_BUTTON = `inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;
const OPERATOR_LABELS: Record<GroupOperator, string> = { AND: 'All of these', OR: 'Any of these' };

const nodeId = (path: NodePath) => `rule-${path.length === 0 ? 'root' : path.join('-')}`;

function NodeIssues({ id, issues }: { id: string; issues: RuleIssue[] }) {
    if (issues.length === 0) return null;
    return (
        <ul id={id} className="mt-1 space-y-1">
            {issues.map((issue) => (
                <li key={issue.message} className="flex items-start gap-1.5 text-sm text-danger">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{issue.message}</span>
                </li>
            ))}
        </ul>
    );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface ${FOCUS_RING}`}
            aria-label={label}
        >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
    );
}

/** One node of the prerequisite tree: a course, a credit threshold, or an AND / OR group of further nodes. */
export function AstRuleNode({ node, path, actions, issues, courseListId, courseTitles }: AstRuleNodeProps) {
    const id = nodeId(path);
    const ownIssues = issues.filter((issue) => samePath(issueNodePath(issue), path));
    const errorId = `${id}-errors`;
    const invalid = ownIssues.length > 0;

    if (node.type === 'COURSE') {
        const title = courseTitles.get(node.courseId);
        return (
            <div className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                        <label htmlFor={`${id}-course`} className="flex items-center gap-1.5 text-sm font-medium text-ink">
                            <BookOpen className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                            Course
                        </label>
                        <input
                            id={`${id}-course`}
                            list={courseListId}
                            value={node.courseId}
                            placeholder="Type a code, e.g. CO2210"
                            autoCapitalize="characters"
                            spellCheck={false}
                            onChange={(event) =>
                                actions.replace(path, { type: 'COURSE', courseId: event.target.value.trim().toUpperCase() })
                            }
                            aria-invalid={invalid}
                            aria-describedby={invalid ? errorId : undefined}
                            className={`mt-1 w-full min-h-11 rounded-xl border bg-surface px-3 text-base font-medium tracking-wide text-ink placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-subtle ${FOCUS_RING} ${invalid ? 'border-danger' : 'border-ink-subtle'}`}
                        />
                    </div>
                    <RemoveButton label={`Remove course ${node.courseId || 'condition'}`} onClick={() => actions.remove(path)} />
                </div>
                {title && <p className="mt-1 text-sm text-ink-muted">{title}</p>}
                <NodeIssues id={errorId} issues={ownIssues} />
            </div>
        );
    }

    if (node.type === 'CREDIT_THRESHOLD') {
        return (
            <div className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                        <label htmlFor={`${id}-credits`} className="flex items-center gap-1.5 text-sm font-medium text-ink">
                            <Gauge className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                            Minimum credits earned
                        </label>
                        <input
                            id={`${id}-credits`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={Number.isNaN(node.minCredits) ? '' : node.minCredits}
                            onChange={(event) =>
                                actions.replace(path, {
                                    type: 'CREDIT_THRESHOLD',
                                    minCredits: event.target.value === '' ? Number.NaN : Number(event.target.value),
                                })
                            }
                            aria-invalid={invalid}
                            aria-describedby={invalid ? errorId : undefined}
                            className={`mt-1 w-full min-h-11 rounded-xl border bg-surface px-3 text-base text-ink ${FOCUS_RING} ${invalid ? 'border-danger' : 'border-ink-subtle'}`}
                        />
                    </div>
                    <RemoveButton label="Remove credit threshold" onClick={() => actions.remove(path)} />
                </div>
                <NodeIssues id={errorId} issues={ownIssues} />
            </div>
        );
    }

    const operator = node.type;
    const canAddCondition = canAddChild(path, 'condition');
    const canAddGroup = canAddChild(path, 'group');

    return (
        <div
            role="group"
            aria-labelledby={`${id}-heading`}
            className={`rounded-2xl border bg-surface-muted p-3 ${invalid ? 'border-danger' : 'border-line'}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span id={`${id}-heading`} className="sr-only">
                    {OPERATOR_LABELS[operator]} ({operator}) group
                </span>
                <div className="inline-flex rounded-xl border border-ink-subtle bg-surface p-0.5" role="radiogroup" aria-label="Group logic">
                    {(['AND', 'OR'] as const).map((option) => (
                        <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={operator === option}
                            onClick={() => actions.setOperator(path, option)}
                            className={`min-h-11 rounded-lg px-3 text-sm font-medium ${FOCUS_RING} ${
                                operator === option ? 'bg-accent text-white' : 'text-ink hover:bg-surface-muted'
                            }`}
                        >
                            {OPERATOR_LABELS[option]} <span className="tabular-nums">({option})</span>
                        </button>
                    ))}
                </div>
                <RemoveButton label={`Remove ${operator} group`} onClick={() => actions.remove(path)} />
            </div>

            <ol className="mt-3 space-y-2 border-l-2 border-line-strong pl-3">
                {node.children.map((child, index) => (
                    <li key={index}>
                        {index > 0 && (
                            <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted" aria-hidden="true">
                                {operator}
                            </p>
                        )}
                        <AstRuleNode
                            node={child}
                            path={[...path, index]}
                            actions={actions}
                            issues={issues}
                            courseListId={courseListId}
                            courseTitles={courseTitles}
                        />
                    </li>
                ))}
            </ol>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!canAddCondition}
                    onClick={() => actions.addChild(path, { ...NEW_COURSE_CONDITION })}
                    className={SMALL_BUTTON}
                >
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    Add course
                </button>
                <button
                    type="button"
                    disabled={!canAddCondition}
                    onClick={() => actions.addChild(path, { ...NEW_CREDIT_CONDITION })}
                    className={SMALL_BUTTON}
                >
                    <Gauge className="h-4 w-4" aria-hidden="true" />
                    Add credit threshold
                </button>
                <button
                    type="button"
                    disabled={!canAddGroup}
                    onClick={() => actions.addChild(path, newGroup(operator === 'AND' ? 'OR' : 'AND'))}
                    className={SMALL_BUTTON}
                >
                    <FolderPlus className="h-4 w-4" aria-hidden="true" />
                    Add group
                </button>
            </div>
            <NodeIssues id={errorId} issues={ownIssues} />
        </div>
    );
}
