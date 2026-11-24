// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { usePlannerStore } from '@/core/store';
import { getProgramCourses } from '@/data/mockCourses';
import { CourseEditorModal } from '@/features/admin/components/CourseEditorModal';
import { EditCourseButton } from '@/features/admin/components/EditCourseButton';
import { useAuthStore } from '@/features/admin/store/authStore';
import { useCatalogEditsStore } from '@/features/admin/store/catalogEditsStore';
import { ModuleDetailsDrawer } from '@/features/drawer/ModuleDetailsDrawer';
import type { Course } from '@/types/curriculum';
import { REVIEWER_PERMISSIONS, jsonResponse, tokenResponse } from './authFixtures';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn<typeof fetch>();

function courseIn(programId: string, courseId: string): Course {
    const course = getProgramCourses(programId).find((candidate) => candidate.id === courseId);
    if (!course) throw new Error(`${courseId} missing from ${programId}`);
    return course;
}

function typeInto(input: HTMLInputElement, value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
        setValue?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

const query = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const editor = () => query('[role="dialog"][aria-labelledby="course-editor-title"]');
const input = (id: string) => {
    const element = query<HTMLInputElement>(`#${id}`);
    if (!element) throw new Error(`#${id} not rendered`);
    return element;
};

function signIn(permissions?: string[]) {
    const user = permissions
        ? { username: 'reviewer', role: 'FACULTY_REVIEWER' as const, permissions }
        : tokenResponse().user;
    act(() => useAuthStore.setState({ token: 'token-1', expiresAt: Date.now() + 60_000, user }));
}

describe('CourseEditorModal (CF-212)', () => {
    let root: Root;

    function openDrawer(programId: string, courseId: string) {
        act(() => {
            usePlannerStore.setState({ activeProgramId: programId });
            usePlannerStore.getState().openCourseDrawer(courseIn(programId, courseId));
        });
    }

    async function save() {
        await act(async () => {
            query<HTMLButtonElement>('button[type="submit"]')?.click();
        });
    }

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        localStorage.clear();
        useAuthStore.getState().logout();
        useCatalogEditsStore.setState({ courseEdits: {}, editingCourseId: null });
        usePlannerStore.setState({ activeProgramId: 'computer-eng', inspectedCourse: null, isDrawerOpen: false });
        document.body.innerHTML = '';
        const container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() =>
            root.render(
                <>
                    <ModuleDetailsDrawer />
                    <CourseEditorModal />
                </>
            )
        );
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.unstubAllGlobals();
    });

    it('hides the edit action from students and never opens the editor for them', () => {
        openDrawer('computer-eng', 'CE1101');
        expect(query('[data-testid="drawer-edit-course"]')).toBeNull();

        act(() => useCatalogEditsStore.getState().openCourseEditor('CE1101'));
        expect(editor()).toBeNull();
    });

    it('hides the edit action from faculty reviewers, who cannot edit courses', () => {
        signIn(REVIEWER_PERMISSIONS);
        openDrawer('computer-eng', 'CE1101');

        expect(query('[data-testid="drawer-edit-course"]')).toBeNull();
    });

    it('opens from the drawer with the course code locked', () => {
        signIn();
        openDrawer('computer-eng', 'CE1101');

        act(() => query<HTMLButtonElement>('[data-testid="drawer-edit-course"]')?.click());

        expect(editor()).not.toBeNull();
        const code = input('course-code');
        expect(code.value).toBe('CE1101');
        expect(code.readOnly).toBe(true);
        expect(document.activeElement).toBe(input('course-title'));
    });

    it('blocks an invalid credit value before calling the server', async () => {
        signIn();
        openDrawer('computer-eng', 'CE1101');
        act(() => useCatalogEditsStore.getState().openCourseEditor('CE1101'));

        typeInto(input('course-totalCredits'), '13');
        await save();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(input('course-totalCredits').getAttribute('aria-invalid')).toBe('true');
        expect(query('#course-totalCredits-error')?.textContent).toBe('Enter whole credits from 1 to 12.');
        expect(document.activeElement).toBe(input('course-totalCredits'));
        expect(editor()).not.toBeNull();
    });

    it('saves, closes and shows the new values in the open drawer (EE)', async () => {
        signIn();
        const course = courseIn('electrical-eng', 'EEE7803');
        openDrawer('electrical-eng', course.id);
        act(() => useCatalogEditsStore.getState().openCourseEditor(course.id));
        fetchMock.mockImplementation(async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            return jsonResponse({ success: true, data: { ...course, ...body, updatedAt: '2026-11-22T10:00:00Z' } });
        });

        typeInto(input('course-title'), 'Final Year Project (revised)');
        typeInto(input('course-totalCredits'), '10');
        typeInto(input('course-distribution-0'), '6');
        await save();

        const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(sent.creditDistribution).toEqual([
            { semesterIndex: 7, creditsAllocated: 6 },
            { semesterIndex: 8, creditsAllocated: 4 },
        ]);
        expect(editor()).toBeNull();
        expect(query('#drawer-course-title')?.textContent).toBe('Final Year Project (revised)');
        expect(query('[data-testid="module-details-drawer"]')?.textContent).toContain('10 Credits');
        const saved = useCatalogEditsStore.getState().courseEdits['electrical-eng'][course.id];
        expect(saved.prerequisiteRule).toEqual(course.prerequisiteRule);
    });

    it('shows a server validation error next to the field it belongs to', async () => {
        signIn();
        openDrawer('computer-eng', 'CE1101');
        act(() => useCatalogEditsStore.getState().openCourseEditor('CE1101'));
        fetchMock.mockResolvedValue(
            jsonResponse(
                { detail: [{ loc: ['body', 'title'], msg: 'String should have at most 200 characters', type: 'string_too_long' }] },
                422
            )
        );

        await save();

        expect(query('#course-title-error')?.textContent).toBe('String should have at most 200 characters');
        expect(query('[role="alert"]')?.textContent).toContain('Check the highlighted fields.');
        expect(editor()).not.toBeNull();
    });

    it('closes the editor on Escape and leaves the drawer open', () => {
        signIn();
        openDrawer('computer-eng', 'CE1101');
        act(() => useCatalogEditsStore.getState().openCourseEditor('CE1101'));

        act(() => {
            input('course-title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });

        expect(editor()).toBeNull();
        expect(usePlannerStore.getState().isDrawerOpen).toBe(true);
    });

    it('closes when the admin is signed out mid-edit', () => {
        signIn();
        act(() => useCatalogEditsStore.getState().openCourseEditor('CE1101'));
        expect(editor()).not.toBeNull();

        act(() => useAuthStore.getState().logout());

        expect(editor()).toBeNull();
    });
});

describe('EditCourseButton on canvas cards (CF-212)', () => {
    let root: Root;
    const course = courseIn('computer-eng', 'CE1101');

    beforeEach(() => {
        useAuthStore.getState().logout();
        useCatalogEditsStore.setState({ courseEdits: {}, editingCourseId: null });
        document.body.innerHTML = '';
        const container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
    });

    it('renders nothing in Student Mode', () => {
        act(() => root.render(<EditCourseButton course={course} placement="node" />));

        expect(query('[data-testid="edit-course-CE1101"]')).toBeNull();
    });

    it('opens the editor without opening the drawer behind it', () => {
        signIn();
        const cardClick = vi.fn();
        act(() =>
            root.render(
                <div onClick={cardClick}>
                    <EditCourseButton course={course} placement="node" />
                </div>
            )
        );

        const button = query<HTMLButtonElement>('[data-testid="edit-course-CE1101"]');
        expect(button?.getAttribute('aria-label')).toBe('Edit CE1101');
        act(() => button?.click());

        expect(useCatalogEditsStore.getState().editingCourseId).toBe('CE1101');
        expect(cardClick).not.toHaveBeenCalled();
    });
});
