import { adminFetch } from '@/features/admin/store/authStore';
import { mapValidationDetail } from '@/features/admin/utils/courseForm';
import type { AdminCourse, CourseFormErrors, CourseUpdate } from '@/features/admin/utils/courseForm';

export type SaveCourseResult =
    | { ok: true; course: AdminCourse }
    | { ok: false; fieldErrors: CourseFormErrors; formError: string | null };

export const SESSION_ENDED_MESSAGE = 'Your session has ended. Sign in again to save your changes.';
export const NOT_PERMITTED_MESSAGE = "Your account isn't permitted to edit courses.";
export const SAVE_NETWORK_ERROR_MESSAGE =
    "We couldn't reach the server, so nothing was saved. Check your connection and try again.";
const SAVE_FAILED_MESSAGE = 'Something went wrong saving this course. Please try again.';

function failure(formError: string): SaveCourseResult {
    return { ok: false, fieldErrors: {}, formError };
}

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function detailMessage(body: unknown): string | null {
    if (typeof body !== 'object' || body === null) return null;
    const detail = (body as Record<string, unknown>).detail;
    return typeof detail === 'string' ? detail : null;
}

/** PUT /api/v1/courses/{id}. A 401 has already signed the user out inside adminFetch. */
export async function saveCourse(courseId: string, update: CourseUpdate): Promise<SaveCourseResult> {
    let response: Response;
    try {
        response = await adminFetch(`/api/v1/courses/${encodeURIComponent(courseId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
        });
    } catch {
        return failure(SAVE_NETWORK_ERROR_MESSAGE);
    }

    const body = await readJson(response);
    if (response.ok) {
        const saved = (body as { data: AdminCourse } | null)?.data;
        return saved ? { ok: true, course: saved } : failure(SAVE_FAILED_MESSAGE);
    }
    switch (response.status) {
        case 401:
            return failure(SESSION_ENDED_MESSAGE);
        case 403:
            return failure(NOT_PERMITTED_MESSAGE);
        case 422: {
            const detail = (body as { detail?: unknown } | null)?.detail;
            return { ok: false, ...mapValidationDetail(detail) };
        }
        default:
            return failure(detailMessage(body) ?? SAVE_FAILED_MESSAGE);
    }
}
