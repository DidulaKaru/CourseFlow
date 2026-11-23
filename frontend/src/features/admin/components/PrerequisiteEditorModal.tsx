import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CircleAlert, Loader2, X } from 'lucide-react';
import type { RuleIssue } from '@/core/algorithms/ast_evaluator';
import { usePlannerStore } from '@/core/store';
import { savePrerequisiteRule } from '@/features/admin/api/courses';
import { AstVisualEditor } from '@/features/admin/components/AstVisualEditor';
import { useModalDialog } from '@/features/admin/hooks/useModalDialog';
import { hasPermission, useAuthStore } from '@/features/admin/store/authStore';
import { useCatalogEditsStore, useProgramCourses } from '@/features/admin/store/catalogEditsStore';
import { findEditorIssues, toFriendlyIssue } from '@/features/admin/utils/ruleTree';
import type { Course, PrerequisiteRule } from '@/types/curriculum';

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const FIX_FIRST_MESSAGE = 'Fix the highlighted conditions to save this rule.';

/**
 * Prerequisite rule editor (CF-213). Mounted once at the app root; opens for
 * `useCatalogEditsStore.editingPrerequisitesCourseId`, only for accounts with `prerequisites:write`.
 */
export function PrerequisiteEditorModal() {
    const courseId = useCatalogEditsStore((state) => state.editingPrerequisitesCourseId);
    const closePrerequisiteEditor = useCatalogEditsStore((state) => state.closePrerequisiteEditor);
    const canEdit = useAuthStore(hasPermission('prerequisites:write'));
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const courses = useProgramCourses(activeProgramId);

    const course = courses.find((candidate) => candidate.id === courseId);
    if (!canEdit || !course) return null;

    return (
        <PrerequisiteEditorDialog
            key={course.id}
            course={course}
            catalog={courses}
            programId={activeProgramId}
            onClose={closePrerequisiteEditor}
        />
    );
}

interface PrerequisiteEditorDialogProps {
    course: Course;
    catalog: Course[];
    programId: string;
    onClose: () => void;
}

function PrerequisiteEditorDialog({ course, catalog, programId, onClose }: PrerequisiteEditorDialogProps) {
    const applyCourseEdit = useCatalogEditsStore((state) => state.applyCourseEdit);
    const { dialogRef, initialFocusRef, onKeyDown } = useModalDialog<HTMLButtonElement>(onClose);

    const [rule, setRule] = useState<PrerequisiteRule | null>(course.prerequisiteRule);
    const [serverIssues, setServerIssues] = useState<RuleIssue[]>([]);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [attempt, setAttempt] = useState(0);

    const catalogIds = useMemo(() => new Set(catalog.map((entry) => entry.id)), [catalog]);
    const clientIssues = useMemo(
        () => (rule === null ? [] : findEditorIssues(rule, course.id, catalogIds)),
        [rule, course.id, catalogIds]
    );
    const issues = useMemo(
        () => [...clientIssues, ...serverIssues].map(toFriendlyIssue),
        [clientIssues, serverIssues]
    );

    // After a failed save, bring the first problem into view (it may be deep in a long tree).
    useEffect(() => {
        if (attempt === 0) return;
        const firstInvalid = dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="group"].border-danger');
        firstInvalid?.focus({ preventScroll: true });
        firstInvalid?.scrollIntoView?.({ block: 'center' });
    }, [attempt, dialogRef]);

    const handleChange = (next: PrerequisiteRule | null) => {
        setRule(next);
        setServerIssues([]);
        setFormError(null);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSaving) return;
        if (clientIssues.length > 0) {
            setFormError(FIX_FIRST_MESSAGE);
            setAttempt((count) => count + 1);
            return;
        }

        setIsSaving(true);
        setFormError(null);
        const result = await savePrerequisiteRule(course.id, rule);
        if (result.ok) {
            // The server stores exactly the tree it validated, so the local catalog takes the same tree.
            applyCourseEdit(programId, { ...course, prerequisiteRule: rule });
            onClose();
            return;
        }
        setServerIssues(result.issues);
        setFormError(result.formError ?? FIX_FIRST_MESSAGE);
        setIsSaving(false);
        setAttempt((count) => count + 1);
    };

    return (
        <div
            className="fixed inset-0 z-60 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            data-testid="prerequisite-editor-backdrop"
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="prerequisite-editor-title"
                onKeyDown={onKeyDown}
                className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-surface text-ink shadow-lg sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3 border-b border-line p-4 sm:px-6">
                    <div className="min-w-0">
                        <h2 id="prerequisite-editor-title" className="text-xl font-bold">
                            Edit prerequisites
                        </h2>
                        <p className="truncate text-sm text-ink-muted">
                            <span className="font-medium tracking-wide tabular-nums">{course.code}</span> · {course.title}
                        </p>
                    </div>
                    <button
                        ref={initialFocusRef}
                        type="button"
                        onClick={onClose}
                        className={`-mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted ${FOCUS_RING}`}
                        aria-label="Close prerequisite editor"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 overflow-y-auto p-4 sm:px-6">
                        <AstVisualEditor
                            value={rule}
                            onChange={handleChange}
                            courseId={course.id}
                            catalog={catalog}
                            issues={issues}
                        />
                    </div>

                    <div className="border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                        {formError !== null && (
                            <p
                                role="alert"
                                className="mb-3 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger"
                            >
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>{formError}</span>
                            </p>
                        )}
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={onClose}
                                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted ${FOCUS_RING}`}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
                            >
                                {isSaving && (
                                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                )}
                                {isSaving ? 'Saving…' : 'Save rule'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
