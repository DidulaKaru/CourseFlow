import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { CircleAlert, Loader2, Lock, Plus, Trash2, X } from 'lucide-react';
import { usePlannerStore } from '@/core/store';
import { saveCourse } from '@/features/admin/api/courses';
import { hasPermission, useAuthStore } from '@/features/admin/store/authStore';
import { useCatalogEditsStore, useProgramCourses } from '@/features/admin/store/catalogEditsStore';
import {
    COURSE_TYPES,
    MAX_CREDITS,
    MIN_CREDITS,
    SEMESTER_COUNT,
    SEMESTER_TERMS,
    buildCourseUpdate,
    courseFromAdminCourse,
    courseToFormValues,
    resizeDistribution,
    validateCourseForm,
} from '@/features/admin/utils/courseForm';
import type { CourseFormErrors, CourseFormField, CourseFormValues } from '@/features/admin/utils/courseForm';
import type { Course, CourseType, SemesterTerm } from '@/types/curriculum';

const TYPE_LABELS: Record<CourseType, string> = {
    CORE: 'Core',
    ELECTIVE: 'Elective',
    LAB: 'Lab',
    CAPSTONE: 'Capstone',
};

const TERM_LABELS: Record<SemesterTerm, string> = {
    FALL: 'Fall',
    SPRING: 'Spring',
    BOTH: 'Both',
};

const SEMESTERS = Array.from({ length: SEMESTER_COUNT }, (_, index) => index + 1);

const FOCUS_RING =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const CONTROL_CLASS = `w-full min-h-11 rounded-xl border bg-surface px-3 text-base text-ink ${FOCUS_RING}`;
const SECONDARY_BUTTON_CLASS = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted ${FOCUS_RING}`;

const fieldId = (field: CourseFormField) => `course-${field}`;
const errorId = (field: CourseFormField) => `course-${field}-error`;

function controlProps(field: CourseFormField, errors: CourseFormErrors, extraClass = '') {
    const invalid = errors[field] !== undefined;
    return {
        id: fieldId(field),
        'aria-invalid': invalid,
        'aria-describedby': invalid ? errorId(field) : undefined,
        className: `${CONTROL_CLASS} ${invalid ? 'border-danger' : 'border-ink-subtle'} ${extraClass}`,
    };
}

interface FieldProps {
    field: CourseFormField;
    label: string;
    hint?: string;
    errors: CourseFormErrors;
    children: ReactNode;
}

function Field({ field, label, hint, errors, children }: FieldProps) {
    return (
        <div>
            <label htmlFor={fieldId(field)} className="block text-sm font-medium text-ink">
                {label}
            </label>
            {hint && <p className="text-sm text-ink-muted">{hint}</p>}
            <div className="mt-1">{children}</div>
            <FieldError field={field} errors={errors} />
        </div>
    );
}

function FieldError({ field, errors }: { field: CourseFormField; errors: CourseFormErrors }) {
    const message = errors[field];
    if (message === undefined) return null;
    return (
        <p id={errorId(field)} className="mt-1 flex items-start gap-1.5 text-sm text-danger">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{message}</span>
        </p>
    );
}

function SectionHeading({ children }: { children: ReactNode }) {
    return <h3 className="text-base font-semibold text-ink">{children}</h3>;
}

/**
 * Admin course editor (CF-212). Mounted once at the app root; opens for the course in
 * `useCatalogEditsStore.editingCourseId` and only for accounts with `courses:write`.
 */
export function CourseEditorModal() {
    const editingCourseId = useCatalogEditsStore((state) => state.editingCourseId);
    const closeCourseEditor = useCatalogEditsStore((state) => state.closeCourseEditor);
    const canEdit = useAuthStore(hasPermission('courses:write'));
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const courses = useProgramCourses(activeProgramId);

    const course = courses.find((candidate) => candidate.id === editingCourseId);
    if (!canEdit || !course) return null;

    return (
        <CourseEditorDialog
            key={course.id}
            course={course}
            catalog={courses}
            programId={activeProgramId}
            onClose={closeCourseEditor}
        />
    );
}

interface CourseEditorDialogProps {
    course: Course;
    catalog: Course[];
    programId: string;
    onClose: () => void;
}

function CourseEditorDialog({ course, catalog, programId, onClose }: CourseEditorDialogProps) {
    const applyCourseEdit = useCatalogEditsStore((state) => state.applyCourseEdit);

    const [values, setValues] = useState<CourseFormValues>(() => courseToFormValues(course));
    const [errors, setErrors] = useState<CourseFormErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const dialogRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLInputElement>(null);

    const catalogIds = useMemo(() => new Set(catalog.map((entry) => entry.id)), [catalog]);
    const corequisiteOptions = useMemo(
        () => catalog.filter((entry) => entry.id !== course.id && !values.corequisites.includes(entry.id)),
        [catalog, course.id, values.corequisites]
    );
    const courseCodes = useMemo(
        () => new Map(catalog.map((entry) => [entry.id, entry.code])),
        [catalog]
    );

    useEffect(() => {
        const opener = document.activeElement;
        titleRef.current?.focus();
        return () => {
            if (opener instanceof HTMLElement) opener.focus();
        };
    }, []);

    // On a phone the first error is often scrolled out of view; focusing it brings it back.
    useEffect(() => {
        if (Object.keys(errors).length === 0) return;
        const firstInvalid = dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        firstInvalid?.focus({ preventScroll: true });
        // Centre it so the message underneath is visible too (not implemented in jsdom).
        firstInvalid?.scrollIntoView?.({ block: 'center' });
    }, [errors]);

    const update = <K extends CourseFormField>(field: K, value: CourseFormValues[K]) =>
        setValues((current) => ({ ...current, [field]: value }));

    const updateDuration = (duration: string) =>
        setValues((current) => ({
            ...current,
            durationSemesters: duration,
            distributionCredits: resizeDistribution(current.distributionCredits, Number(duration)),
        }));

    const updateListItem = (field: 'syllabusObjectives' | 'distributionCredits', index: number, value: string) =>
        setValues((current) => ({
            ...current,
            [field]: current[field].map((item, itemIndex) => (itemIndex === index ? value : item)),
        }));

    const toggleTerm = (term: SemesterTerm) =>
        update(
            'offeredSemesters',
            values.offeredSemesters.includes(term)
                ? values.offeredSemesters.filter((existing) => existing !== term)
                : SEMESTER_TERMS.filter((candidate) => candidate === term || values.offeredSemesters.includes(candidate))
        );

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            // The drawer underneath closes on a window-level Escape; this one belongs to the editor.
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
            'input:not([disabled]), select, textarea, button:not(:disabled)'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSaving) return;

        const clientErrors = validateCourseForm(values, course.id, catalogIds);
        setErrors(clientErrors);
        if (Object.keys(clientErrors).length > 0) {
            setFormError('Check the highlighted fields.');
            return;
        }

        setIsSaving(true);
        setFormError(null);
        const result = await saveCourse(course.id, buildCourseUpdate(values));
        if (result.ok) {
            applyCourseEdit(programId, courseFromAdminCourse(course, result.course));
            onClose();
            return;
        }
        setErrors(result.fieldErrors);
        setFormError(result.formError ?? 'Check the highlighted fields.');
        setIsSaving(false);
    };

    const duration = Number(values.durationSemesters);
    const start = Number(values.recommendedSemester);

    return (
        <div
            className="fixed inset-0 z-60 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            data-testid="course-editor-backdrop"
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="course-editor-title"
                onKeyDown={handleKeyDown}
                className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-surface text-ink shadow-lg sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3 border-b border-line p-4 sm:px-6">
                    <div className="min-w-0">
                        <h2 id="course-editor-title" className="text-xl font-bold">
                            Edit course
                        </h2>
                        <p className="truncate text-sm text-ink-muted">
                            <span className="font-medium tracking-wide tabular-nums">{course.code}</span> · {course.title}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`-mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted ${FOCUS_RING}`}
                        aria-label="Close course editor"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:px-6">
                        <section className="space-y-4">
                            <div>
                                <label htmlFor="course-code" className="block text-sm font-medium text-ink">
                                    Course code
                                </label>
                                <div className="mt-1 flex min-h-11 items-center gap-2 rounded-xl bg-surface-muted px-3 text-base text-ink-muted">
                                    <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <input
                                        id="course-code"
                                        value={course.code}
                                        readOnly
                                        aria-describedby="course-code-hint"
                                        className="w-full bg-transparent font-medium tracking-wide text-ink focus-visible:outline-none"
                                    />
                                </div>
                                <p id="course-code-hint" className="mt-1 text-sm text-ink-muted">
                                    Codes are permanent because prerequisite rules point to them.
                                </p>
                            </div>

                            <Field field="title" label="Title" errors={errors}>
                                <input
                                    ref={titleRef}
                                    type="text"
                                    value={values.title}
                                    onChange={(event) => update('title', event.target.value)}
                                    {...controlProps('title', errors)}
                                />
                            </Field>

                            <Field field="description" label="Description" errors={errors}>
                                <textarea
                                    rows={4}
                                    value={values.description}
                                    onChange={(event) => update('description', event.target.value)}
                                    {...controlProps('description', errors, 'py-2')}
                                />
                            </Field>
                        </section>

                        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Field field="totalCredits" label="Total credits" hint={`${MIN_CREDITS} to ${MAX_CREDITS}`} errors={errors}>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={MIN_CREDITS}
                                    max={MAX_CREDITS}
                                    value={values.totalCredits}
                                    onChange={(event) => update('totalCredits', event.target.value)}
                                    {...controlProps('totalCredits', errors)}
                                />
                            </Field>

                            <Field field="type" label="Course type" errors={errors}>
                                <select
                                    value={values.type}
                                    onChange={(event) => update('type', event.target.value as CourseType)}
                                    {...controlProps('type', errors)}
                                >
                                    {COURSE_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {TYPE_LABELS[type]}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field field="recommendedSemester" label="Recommended semester" errors={errors}>
                                <select
                                    value={values.recommendedSemester}
                                    onChange={(event) => update('recommendedSemester', event.target.value)}
                                    {...controlProps('recommendedSemester', errors)}
                                >
                                    {SEMESTERS.map((semester) => (
                                        <option key={semester} value={String(semester)}>
                                            Semester {semester}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field field="durationSemesters" label="Duration" errors={errors}>
                                <select
                                    value={values.durationSemesters}
                                    onChange={(event) => updateDuration(event.target.value)}
                                    {...controlProps('durationSemesters', errors)}
                                >
                                    {SEMESTERS.map((semesters) => (
                                        <option key={semesters} value={String(semesters)}>
                                            {semesters} semester{semesters === 1 ? '' : 's'}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </section>

                        {duration > 1 && (
                            <fieldset className="space-y-2" aria-describedby={errors.distributionCredits ? errorId('distributionCredits') : undefined}>
                                <legend className="text-base font-semibold text-ink">Credit split</legend>
                                <p className="text-sm text-ink-muted">
                                    How the total credits count toward each semester the course runs.
                                </p>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {values.distributionCredits.map((credits, offset) => (
                                        <div key={offset}>
                                            <label
                                                htmlFor={`course-distribution-${offset}`}
                                                className="block text-sm font-medium text-ink"
                                            >
                                                Semester {start + offset}
                                            </label>
                                            <input
                                                id={`course-distribution-${offset}`}
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                value={credits}
                                                onChange={(event) =>
                                                    updateListItem('distributionCredits', offset, event.target.value)
                                                }
                                                aria-invalid={errors.distributionCredits !== undefined}
                                                className={`${CONTROL_CLASS} mt-1 ${errors.distributionCredits ? 'border-danger' : 'border-ink-subtle'}`}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <FieldError field="distributionCredits" errors={errors} />
                            </fieldset>
                        )}

                        <fieldset className="space-y-2">
                            <legend className="text-base font-semibold text-ink">Offered in</legend>
                            <div className="flex flex-wrap gap-2">
                                {SEMESTER_TERMS.map((term) => {
                                    const checked = values.offeredSemesters.includes(term);
                                    return (
                                        <label
                                            key={term}
                                            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
                                                checked
                                                    ? 'border-accent bg-accent-soft text-accent-strong'
                                                    : 'border-ink-subtle bg-surface text-ink'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleTerm(term)}
                                                className="h-4 w-4 accent-accent"
                                            />
                                            {TERM_LABELS[term]}
                                        </label>
                                    );
                                })}
                            </div>
                            <FieldError field="offeredSemesters" errors={errors} />
                        </fieldset>

                        <fieldset className="space-y-2">
                            <legend className="text-base font-semibold text-ink">Contact hours</legend>
                            <p className="text-sm text-ink-muted">Hours per semester, not per week.</p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <Field field="lectureHours" label="Lecture" errors={errors}>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        value={values.lectureHours}
                                        onChange={(event) => update('lectureHours', event.target.value)}
                                        {...controlProps('lectureHours', errors)}
                                    />
                                </Field>
                                <Field field="labHours" label="Lab" errors={errors}>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        value={values.labHours}
                                        onChange={(event) => update('labHours', event.target.value)}
                                        {...controlProps('labHours', errors)}
                                    />
                                </Field>
                                <Field field="tutorialHours" label="Tutorial" errors={errors}>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        value={values.tutorialHours}
                                        onChange={(event) => update('tutorialHours', event.target.value)}
                                        {...controlProps('tutorialHours', errors)}
                                    />
                                </Field>
                            </div>
                        </fieldset>

                        <section className="space-y-2">
                            <SectionHeading>Syllabus objectives</SectionHeading>
                            {values.syllabusObjectives.length === 0 && (
                                <p className="text-sm text-ink-muted">No objectives yet. Add the first one below.</p>
                            )}
                            <ol className="space-y-2">
                                {values.syllabusObjectives.map((objective, index) => (
                                    <li key={index} className="flex items-center gap-2">
                                        <label htmlFor={`course-objective-${index}`} className="sr-only">
                                            Objective {index + 1}
                                        </label>
                                        <input
                                            id={`course-objective-${index}`}
                                            type="text"
                                            value={objective}
                                            onChange={(event) =>
                                                updateListItem('syllabusObjectives', index, event.target.value)
                                            }
                                            className={`${CONTROL_CLASS} border-ink-subtle`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                update(
                                                    'syllabusObjectives',
                                                    values.syllabusObjectives.filter((_, itemIndex) => itemIndex !== index)
                                                )
                                            }
                                            className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted ${FOCUS_RING}`}
                                            aria-label={`Remove objective ${index + 1}`}
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ol>
                            <button
                                type="button"
                                onClick={() => update('syllabusObjectives', [...values.syllabusObjectives, ''])}
                                className={SECONDARY_BUTTON_CLASS}
                            >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Add objective
                            </button>
                            <FieldError field="syllabusObjectives" errors={errors} />
                        </section>

                        <section className="space-y-2">
                            <SectionHeading>Corequisites</SectionHeading>
                            <p className="text-sm text-ink-muted">Courses that must be taken in the same semester.</p>
                            {values.corequisites.length > 0 && (
                                <ul className="flex flex-wrap gap-2">
                                    {values.corequisites.map((id) => (
                                        <li key={id}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    update(
                                                        'corequisites',
                                                        values.corequisites.filter((existing) => existing !== id)
                                                    )
                                                }
                                                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface-muted px-4 text-sm font-medium tracking-wide text-ink hover:bg-line ${FOCUS_RING}`}
                                                aria-label={`Remove corequisite ${courseCodes.get(id) ?? id}`}
                                            >
                                                {courseCodes.get(id) ?? id}
                                                <X className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <label htmlFor={fieldId('corequisites')} className="sr-only">
                                Add a corequisite
                            </label>
                            <select
                                value=""
                                onChange={(event) => {
                                    if (event.target.value !== '') {
                                        update('corequisites', [...values.corequisites, event.target.value]);
                                    }
                                }}
                                {...controlProps('corequisites', errors)}
                            >
                                <option value="">Add a corequisite…</option>
                                {corequisiteOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.code} · {option.title}
                                    </option>
                                ))}
                            </select>
                            <FieldError field="corequisites" errors={errors} />
                        </section>
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
                            <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLASS}>
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
                                {isSaving ? 'Saving…' : 'Save changes'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
