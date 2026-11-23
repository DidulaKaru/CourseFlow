// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProgramCourses } from '@/data/mockCourses';
import {
    NOT_PERMITTED_MESSAGE,
    SAVE_NETWORK_ERROR_MESSAGE,
    SESSION_ENDED_MESSAGE,
    saveCourse,
    savePrerequisiteRule,
} from '@/features/admin/api/courses';
import { selectIsAdminMode, useAuthStore } from '@/features/admin/store/authStore';
import { buildCourseUpdate, courseToFormValues } from '@/features/admin/utils/courseForm';
import type { PrerequisiteRule } from '@/types/curriculum';
import { jsonResponse, tokenResponse } from './authFixtures';

const fetchMock = vi.fn<typeof fetch>();
const course = getProgramCourses('computer-eng')[0];
const update = buildCourseUpdate(courseToFormValues(course));

describe('saveCourse (CF-212)', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        localStorage.clear();
        useAuthStore.setState({ token: 'token-1', expiresAt: Date.now() + 60_000, user: tokenResponse().user });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('PUTs the update as JSON with the admin token', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { ...course, updatedAt: null } }));

        await saveCourse(course.id, update);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(`/api/v1/courses/${course.id}`);
        expect(init?.method).toBe('PUT');
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer token-1');
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(JSON.parse(String(init?.body))).toEqual(update);
    });

    it('returns the saved course from the success envelope', async () => {
        const saved = { ...course, title: 'Renamed', updatedAt: '2026-11-22T10:00:00Z' };
        fetchMock.mockResolvedValue(jsonResponse({ success: true, data: saved }));

        expect(await saveCourse(course.id, update)).toEqual({ ok: true, course: saved });
    });

    it('maps 422 validation errors onto form fields', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ detail: [{ loc: ['body', 'totalCredits'], msg: 'Too many credits', type: 'value_error' }] }, 422)
        );

        expect(await saveCourse(course.id, update)).toEqual({
            ok: false,
            fieldErrors: { totalCredits: 'Too many credits' },
            formError: null,
        });
    });

    it.each([404, 409])('shows the server detail for a %i', async (status) => {
        fetchMock.mockResolvedValue(jsonResponse({ detail: 'Course codes are immutable.' }, status));

        expect(await saveCourse(course.id, update)).toEqual({
            ok: false,
            fieldErrors: {},
            formError: 'Course codes are immutable.',
        });
    });

    it('signs the user out on a 401', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ detail: 'Token expired' }, 401));

        const result = await saveCourse(course.id, update);

        expect(result).toEqual({ ok: false, fieldErrors: {}, formError: SESSION_ENDED_MESSAGE });
        expect(selectIsAdminMode(useAuthStore.getState())).toBe(false);
    });

    it('explains a 403 and keeps the session', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ detail: 'Forbidden' }, 403));

        expect(await saveCourse(course.id, update)).toEqual({ ok: false, fieldErrors: {}, formError: NOT_PERMITTED_MESSAGE });
        expect(selectIsAdminMode(useAuthStore.getState())).toBe(true);
    });

    it('reports a network failure without claiming anything was saved', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

        expect(await saveCourse(course.id, update)).toEqual({
            ok: false,
            fieldErrors: {},
            formError: SAVE_NETWORK_ERROR_MESSAGE,
        });
    });
});

describe('savePrerequisiteRule (CF-213)', () => {
    const rule: PrerequisiteRule = {
        type: 'OR',
        children: [
            { type: 'COURSE', courseId: 'EC3301' },
            { type: 'CREDIT_THRESHOLD', minCredits: 45 },
        ],
    };

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        useAuthStore.setState({ token: 'token-1', expiresAt: Date.now() + 60_000, user: tokenResponse().user });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('PUTs the tree itself as the body', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { ...course, prerequisiteRule: rule } }));

        const result = await savePrerequisiteRule('EC5202', rule);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/v1/courses/EC5202/prerequisites');
        expect(init?.method).toBe('PUT');
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1');
        expect(JSON.parse(String(init?.body))).toEqual(rule);
        expect(result.ok).toBe(true);
    });

    it('DELETEs to clear the rule', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { ...course, prerequisiteRule: null } }));

        await savePrerequisiteRule('EC5202', null);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/v1/courses/EC5202/prerequisites');
        expect(init?.method).toBe('DELETE');
        expect(init?.body).toBeUndefined();
    });

    it('places tree errors on their node and whole-rule errors in the form message', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse(
                {
                    detail: [
                        { loc: ['body', 'children', 0, 'courseId'], msg: "Unknown course 'EC3301': it does not exist in the catalog.", type: 'value_error' },
                        { loc: ['body', 'prerequisiteRule'], msg: 'This rule would create a circular dependency: EC5202 -> EC3301 -> EC5202.', type: 'value_error' },
                    ],
                },
                422
            )
        );

        expect(await savePrerequisiteRule('EC5202', rule)).toEqual({
            ok: false,
            issues: [{ path: ['children', 0, 'courseId'], message: "Unknown course 'EC3301': it does not exist in the catalog." }],
            formError: 'This rule would create a circular dependency: EC5202 -> EC3301 -> EC5202.',
        });
    });

    it('signs the user out on a 401', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ detail: 'Token expired' }, 401));

        expect(await savePrerequisiteRule('EC5202', rule)).toEqual({ ok: false, issues: [], formError: SESSION_ENDED_MESSAGE });
        expect(selectIsAdminMode(useAuthStore.getState())).toBe(false);
    });
});
