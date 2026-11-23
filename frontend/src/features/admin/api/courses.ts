import type { RuleIssue } from '@/core/algorithms/ast_evaluator';
import { adminFetch } from '@/features/admin/store/authStore';
import { mapValidationDetail } from '@/features/admin/utils/courseForm';
import type { AdminCourse, CourseFormErrors, CourseUpdate } from '@/features/admin/utils/courseForm';
import type { PrerequisiteRule } from '@/types/curriculum';

export type SaveCourseResult =
    | { ok: true; course: AdminCourse }
    | { ok: false; fieldErrors: CourseFormErrors; formError: string | null };

export type SavePrerequisitesResult =
    | { ok: true; course: AdminCourse }
    | { ok: false; issues: RuleIssue[]; formError: string | null };

export const SESSION_ENDED_MESSAGE = 'Your session has ended. Sign in again to save your changes.';
export const NOT_PERMITTED_MESSAGE = "Your account isn't permitted to edit courses.";
export const SAVE_NETWORK_ERROR_MESSAGE =
    "We couldn't reach the server, so nothing was saved. Check your connection and try again.";
const SAVE_FAILED_MESSAGE = 'Something went wrong saving this course. Please try again.';

type CourseRequestOutcome =
    | { kind: 'saved'; course: AdminCourse }
    | { kind: 'invalid'; detail: unknown }
    | { kind: 'failed'; message: string };

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function detailOf(body: unknown): unknown {
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>).detail : undefined;
}

/** Sends an admin course mutation. A 401 has already signed the user out inside adminFetch. */
async function sendCourseRequest(path: string, init: RequestInit): Promise<CourseRequestOutcome> {
    let response: Response;
    try {
        response = await adminFetch(path, init);
    } catch {
        return { kind: 'failed', message: SAVE_NETWORK_ERROR_MESSAGE };
    }

    const body = await readJson(response);
    if (response.ok) {
        const saved = (body as { data?: AdminCourse } | null)?.data;
        return saved ? { kind: 'saved', course: saved } : { kind: 'failed', message: SAVE_FAILED_MESSAGE };
    }
    switch (response.status) {
        case 401:
            return { kind: 'failed', message: SESSION_ENDED_MESSAGE };
        case 403:
            return { kind: 'failed', message: NOT_PERMITTED_MESSAGE };
        case 422:
            return { kind: 'invalid', detail: detailOf(body) };
        default: {
            const detail = detailOf(body);
            return { kind: 'failed', message: typeof detail === 'string' ? detail : SAVE_FAILED_MESSAGE };
        }
    }
}

const coursePath = (courseId: string) => `/api/v1/courses/${encodeURIComponent(courseId)}`;

/** PUT /api/v1/courses/{id}. */
export async function saveCourse(courseId: string, update: CourseUpdate): Promise<SaveCourseResult> {
    const outcome = await sendCourseRequest(coursePath(courseId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
    });
    switch (outcome.kind) {
        case 'saved':
            return { ok: true, course: outcome.course };
        case 'invalid':
            return { ok: false, ...mapValidationDetail(outcome.detail) };
        case 'failed':
            return { ok: false, fieldErrors: {}, formError: outcome.message };
    }
}

/** PUT /api/v1/courses/{id}/prerequisites with the AST as the body, or DELETE to clear the rule. */
export async function savePrerequisiteRule(
    courseId: string,
    rule: PrerequisiteRule | null
): Promise<SavePrerequisitesResult> {
    const outcome = await sendCourseRequest(
        `${coursePath(courseId)}/prerequisites`,
        rule === null
            ? { method: 'DELETE' }
            : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rule) }
    );
    switch (outcome.kind) {
        case 'saved':
            return { ok: true, course: outcome.course };
        case 'invalid':
            return { ok: false, ...mapRuleValidationDetail(outcome.detail) };
        case 'failed':
            return { ok: false, issues: [], formError: outcome.message };
    }
}

/**
 * 422 `detail[]` from the prerequisites endpoint: entries whose `loc` reaches into the tree become
 * node issues; anything about the rule as a whole (such as a circular dependency) is a form message.
 */
export function mapRuleValidationDetail(detail: unknown): { issues: RuleIssue[]; formError: string | null } {
    const issues: RuleIssue[] = [];
    const general: string[] = [];
    const entries = Array.isArray(detail) ? detail : [];

    for (const entry of entries) {
        if (typeof entry !== 'object' || entry === null) continue;
        const { loc, msg } = entry as { loc?: unknown; msg?: unknown };
        if (!Array.isArray(loc) || typeof msg !== 'string') continue;
        const path = loc.slice(1).filter((step): step is string | number => typeof step === 'string' || typeof step === 'number');
        if (path.some((step) => typeof step === 'number') || (path.length > 0 && path[0] !== 'prerequisiteRule')) {
            issues.push({ path, message: msg });
        } else {
            general.push(msg);
        }
    }

    if (issues.length === 0 && general.length === 0) general.push('The server rejected this rule.');
    return { issues, formError: general.length > 0 ? general.join(' ') : null };
}
