import { useId, useMemo } from 'react';
import { BookOpen, FolderPlus, Gauge } from 'lucide-react';
import { formatPrerequisiteRule } from '@/core/algorithms/ast_evaluator';
import type { RuleIssue } from '@/core/algorithms/ast_evaluator';
import { AstRuleNode } from '@/features/admin/components/AstRuleNode';
import type { RuleTreeActions } from '@/features/admin/components/AstRuleNode';
import {
    NEW_COURSE_CONDITION,
    NEW_CREDIT_CONDITION,
    addAtRoot,
    addChild,
    newGroup,
    removeNode,
    setOperator,
    updateNode,
} from '@/features/admin/utils/ruleTree';
import type { Course, PrerequisiteRule } from '@/types/curriculum';

interface AstVisualEditorProps {
    value: PrerequisiteRule | null;
    onChange: (rule: PrerequisiteRule | null) => void;
    /** The course that owns the rule; it is left out of the course suggestions. */
    courseId: string;
    /** Courses in the active program, offered as suggestions for course conditions. */
    catalog: Course[];
    issues: RuleIssue[];
}

const ROOT_BUTTON =
    'inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * Visual builder for a prerequisite AST (CF-213). Controlled: it never saves, it only reports the
 * new tree, which always has the `PrerequisiteRule` contract shape.
 */
export function AstVisualEditor({ value, onChange, courseId, catalog, issues }: AstVisualEditorProps) {
    const courseListId = useId();
    const suggestions = useMemo(() => catalog.filter((course) => course.id !== courseId), [catalog, courseId]);
    const courseTitles = useMemo(() => new Map(catalog.map((course) => [course.id, course.title])), [catalog]);

    const actions = useMemo<RuleTreeActions | null>(() => {
        if (value === null) return null;
        return {
            replace: (path, node) => onChange(updateNode(value, path, node)),
            remove: (path) => onChange(removeNode(value, path)),
            addChild: (path, child) => onChange(addChild(value, path, child)),
            setOperator: (path, operator) => onChange(setOperator(value, path, operator)),
        };
    }, [value, onChange]);

    const isSingleCondition = value !== null && value.type !== 'AND' && value.type !== 'OR';

    const rootButtons = (
        <div className="flex flex-wrap gap-2">
            <button type="button" className={ROOT_BUTTON} onClick={() => onChange(addAtRoot(value, { ...NEW_COURSE_CONDITION }))}>
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Add course
            </button>
            <button type="button" className={ROOT_BUTTON} onClick={() => onChange(addAtRoot(value, { ...NEW_CREDIT_CONDITION }))}>
                <Gauge className="h-4 w-4" aria-hidden="true" />
                Add credit threshold
            </button>
            <button type="button" className={ROOT_BUTTON} onClick={() => onChange(addAtRoot(value, newGroup('OR')))}>
                <FolderPlus className="h-4 w-4" aria-hidden="true" />
                Add group
            </button>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="rounded-xl bg-surface-muted p-3">
                <p className="text-sm font-medium text-ink-muted" id={`${courseListId}-preview-label`}>
                    Rule preview
                </p>
                <output
                    aria-labelledby={`${courseListId}-preview-label`}
                    aria-live="polite"
                    className="mt-1 block break-words text-base font-medium tracking-wide text-ink"
                    data-testid="rule-preview"
                >
                    {value === null ? 'No prerequisites' : formatPrerequisiteRule(value)}
                </output>
            </div>

            {value === null || actions === null ? (
                <div className="space-y-3">
                    <p className="text-sm text-ink-muted">
                        No prerequisites, so students can take this course any time. Add a condition to set one.
                    </p>
                    {rootButtons}
                </div>
            ) : (
                <>
                    <AstRuleNode
                        node={value}
                        path={[]}
                        actions={actions}
                        issues={issues}
                        courseListId={courseListId}
                        courseTitles={courseTitles}
                    />
                    {isSingleCondition && (
                        <div className="space-y-2">
                            <p className="text-sm text-ink-muted">Add another condition (students will need both):</p>
                            {rootButtons}
                        </div>
                    )}
                </>
            )}

            <datalist id={courseListId}>
                {suggestions.map((course) => (
                    <option key={course.id} value={course.id}>
                        {course.title}
                    </option>
                ))}
            </datalist>
        </div>
    );
}
