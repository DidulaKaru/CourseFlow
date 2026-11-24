import type { components } from '@/types/api';
import type { Course, CourseType, SemesterTerm } from '@/types/curriculum';

export type CourseUpdate = components['schemas']['CourseUpdate'];
export type AdminCourse = components['schemas']['AdminCourse'];

// Bounds mirror backend/app/schemas/curriculum.py (CourseUpdate).
export const MIN_CREDITS = 1;
export const MAX_CREDITS = 12;
export const SEMESTER_COUNT = 8;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_OBJECTIVES = 50;
const MAX_OBJECTIVE_LENGTH = 1_000;

export const COURSE_TYPES: readonly CourseType[] = ['CORE', 'ELECTIVE', 'LAB', 'CAPSTONE'];
export const SEMESTER_TERMS: readonly SemesterTerm[] = ['FALL', 'SPRING', 'BOTH'];

/** Form state. Numbers stay strings so a field can be empty while the user types. */
export interface CourseFormValues {
    title: string;
    description: string;
    totalCredits: string;
    type: CourseType;
    recommendedSemester: string;
    durationSemesters: string;
    offeredSemesters: SemesterTerm[];
    lectureHours: string;
    labHours: string;
    tutorialHours: string;
    syllabusObjectives: string[];
    corequisites: string[];
    /** One entry per semester the course runs, starting at recommendedSemester. */
    distributionCredits: string[];
}

export type CourseFormField = keyof CourseFormValues;
export type CourseFormErrors = Partial<Record<CourseFormField, string>>;

export function courseToFormValues(course: Course): CourseFormValues {
    const start = course.recommendedSemester;
    const distributionCredits = Array.from({ length: course.durationSemesters }, (_, offset) => {
        const entry = course.creditDistribution.find((d) => d.semesterIndex === start + offset);
        return entry ? String(entry.creditsAllocated) : '';
    });
    return {
        title: course.title,
        description: course.description,
        totalCredits: String(course.totalCredits),
        type: course.type,
        recommendedSemester: String(start),
        durationSemesters: String(course.durationSemesters),
        offeredSemesters: [...course.offeredSemesters],
        lectureHours: course.contactHours ? String(course.contactHours.lecture) : '',
        labHours: course.contactHours ? String(course.contactHours.lab) : '',
        tutorialHours: course.contactHours ? String(course.contactHours.tutorial) : '',
        syllabusObjectives: [...(course.syllabusObjectives ?? [])],
        corequisites: [...course.corequisites],
        distributionCredits,
    };
}

/** Keeps the per-semester credit rows in step with a new duration. */
export function resizeDistribution(credits: string[], duration: number): string[] {
    if (duration <= credits.length) return credits.slice(0, duration);
    return [...credits, ...Array<string>(duration - credits.length).fill('')];
}

function parseWholeNumber(value: string): number | null {
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function inRange(value: number | null, min: number, max: number): value is number {
    return value !== null && value >= min && value <= max;
}

export function validateCourseForm(
    values: CourseFormValues,
    courseId: string,
    catalogIds: ReadonlySet<string>
): CourseFormErrors {
    const errors: CourseFormErrors = {};

    const title = values.title.trim();
    if (title === '') errors.title = 'Enter a course title.';
    else if (title.length > MAX_TITLE_LENGTH) errors.title = `Keep the title under ${MAX_TITLE_LENGTH} characters.`;

    if (values.description.length > MAX_DESCRIPTION_LENGTH) {
        errors.description = `Keep the description under ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters.`;
    }

    const credits = parseWholeNumber(values.totalCredits);
    if (!inRange(credits, MIN_CREDITS, MAX_CREDITS)) {
        errors.totalCredits = `Enter whole credits from ${MIN_CREDITS} to ${MAX_CREDITS}.`;
    }

    const start = parseWholeNumber(values.recommendedSemester);
    if (!inRange(start, 1, SEMESTER_COUNT)) {
        errors.recommendedSemester = `Choose a semester from 1 to ${SEMESTER_COUNT}.`;
    }

    const duration = parseWholeNumber(values.durationSemesters);
    if (!inRange(duration, 1, SEMESTER_COUNT)) {
        errors.durationSemesters = `Choose a duration from 1 to ${SEMESTER_COUNT} semesters.`;
    } else if (inRange(start, 1, SEMESTER_COUNT) && start + duration - 1 > SEMESTER_COUNT) {
        const longest = SEMESTER_COUNT - start + 1;
        errors.durationSemesters = `A course starting in semester ${start} can last at most ${longest} semester${longest === 1 ? '' : 's'}.`;
    }

    for (const field of ['lectureHours', 'labHours', 'tutorialHours'] as const) {
        if (values[field].trim() !== '' && parseWholeNumber(values[field]) === null) {
            errors[field] = 'Enter whole hours, or leave it empty.';
        }
    }

    const objectives = values.syllabusObjectives.filter((objective) => objective.trim() !== '');
    if (objectives.length > MAX_OBJECTIVES) {
        errors.syllabusObjectives = `List at most ${MAX_OBJECTIVES} objectives.`;
    } else if (objectives.some((objective) => objective.trim().length > MAX_OBJECTIVE_LENGTH)) {
        errors.syllabusObjectives = `Keep each objective under ${MAX_OBJECTIVE_LENGTH.toLocaleString()} characters.`;
    }

    if (values.corequisites.includes(courseId)) {
        errors.corequisites = "A course can't be its own corequisite.";
    } else {
        const unknown = values.corequisites.find((id) => !catalogIds.has(id));
        if (unknown) errors.corequisites = `${unknown} isn't in this program's catalog.`;
    }

    const durationValid = errors.durationSemesters === undefined && duration !== null;
    if (durationValid && duration > 1 && errors.totalCredits === undefined && credits !== null) {
        const split = values.distributionCredits.map(parseWholeNumber);
        if (split.some((value) => value === null)) {
            errors.distributionCredits = 'Enter whole credits for every semester (0 is allowed).';
        } else {
            const allocated = split.reduce<number>((sum, value) => sum + (value ?? 0), 0);
            if (allocated !== credits) {
                errors.distributionCredits = `The semesters add up to ${allocated} credits, but the course has ${credits}.`;
            }
        }
    }

    return errors;
}

/** Request body for PUT /courses/{id}: only the editable fields the API accepts. */
export function buildCourseUpdate(values: CourseFormValues): CourseUpdate {
    const start = Number(values.recommendedSemester);
    const duration = Number(values.durationSemesters);
    const hours = [values.lectureHours, values.labHours, values.tutorialHours];
    const hasContactHours = hours.some((value) => value.trim() !== '');
    const toHours = (value: string) => parseWholeNumber(value) ?? 0;

    const body: CourseUpdate = {
        title: values.title.trim(),
        description: values.description.trim(),
        totalCredits: Number(values.totalCredits),
        durationSemesters: duration,
        recommendedSemester: start,
        type: values.type,
        offeredSemesters: values.offeredSemesters,
        corequisites: values.corequisites,
        syllabusObjectives: values.syllabusObjectives
            .map((objective) => objective.trim())
            .filter((objective) => objective !== ''),
        contactHours: hasContactHours
            ? {
                  lecture: toHours(values.lectureHours),
                  lab: toHours(values.labHours),
                  tutorial: toHours(values.tutorialHours),
              }
            : null,
    };
    // Single-semester splits are derived on the server; multi-semester ones must be sent.
    if (duration > 1) {
        body.creditDistribution = values.distributionCredits.map((credits, offset) => ({
            semesterIndex: start + offset,
            creditsAllocated: Number(credits),
        }));
    }
    return body;
}

/** Applies a saved AdminCourse to the catalog course. The prerequisite rule is edited elsewhere (CF-213). */
export function courseFromAdminCourse(existing: Course, saved: AdminCourse): Course {
    return {
        ...existing,
        title: saved.title,
        description: saved.description,
        totalCredits: saved.totalCredits,
        durationSemesters: saved.durationSemesters,
        recommendedSemester: saved.recommendedSemester,
        creditDistribution: saved.creditDistribution ?? [],
        type: saved.type,
        corequisites: saved.corequisites ?? [],
        offeredSemesters: saved.offeredSemesters ?? [],
        syllabusObjectives: saved.syllabusObjectives ?? [],
        contactHours: saved.contactHours ?? undefined,
    };
}

const SERVER_FIELD_MAP: Record<string, CourseFormField> = {
    title: 'title',
    description: 'description',
    totalCredits: 'totalCredits',
    durationSemesters: 'durationSemesters',
    recommendedSemester: 'recommendedSemester',
    type: 'type',
    offeredSemesters: 'offeredSemesters',
    corequisites: 'corequisites',
    syllabusObjectives: 'syllabusObjectives',
    creditDistribution: 'distributionCredits',
};

const CONTACT_HOURS_FIELD_MAP: Record<string, CourseFormField> = {
    lecture: 'lectureHours',
    lab: 'labHours',
    tutorial: 'tutorialHours',
};

interface ValidationIssue {
    loc: (string | number)[];
    msg: string;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
    if (typeof value !== 'object' || value === null) return false;
    const issue = value as Record<string, unknown>;
    return Array.isArray(issue.loc) && typeof issue.msg === 'string';
}

/** Maps a 422 `detail: [{ loc, msg }]` onto form fields; anything unmapped becomes a form-level message. */
export function mapValidationDetail(detail: unknown): {
    fieldErrors: CourseFormErrors;
    formError: string | null;
} {
    const fieldErrors: CourseFormErrors = {};
    const unmapped: string[] = [];
    const issues = Array.isArray(detail) ? detail.filter(isValidationIssue) : [];

    for (const issue of issues) {
        const [, name, child] = issue.loc.map(String);
        const field =
            name === 'contactHours'
                ? (CONTACT_HOURS_FIELD_MAP[child] ?? 'lectureHours')
                : SERVER_FIELD_MAP[name];
        if (field === undefined) unmapped.push(issue.msg);
        else fieldErrors[field] ??= issue.msg;
    }

    if (issues.length === 0) unmapped.push('The server rejected these changes.');
    return { fieldErrors, formError: unmapped.length > 0 ? unmapped.join(' ') : null };
}
