// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { usePlannerStore } from '@/core/store';
import { getProgramCourses } from '@/data/mockCourses';
import { PrerequisiteEditorModal } from '@/features/admin/components/PrerequisiteEditorModal';
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
const editor = () => query('[role="dialog"][aria-labelledby="prerequisite-editor-title"]');
const preview = () => query('[data-testid="rule-preview"]')?.textContent;
const input = (id: string) => {
    const element = query<HTMLInputElement>(`#${id}`);
    if (!element) throw new Error(`#${id} not rendered`);
    return element;
};
const click = (element: Element | null | undefined) => act(() => (element as HTMLElement | null)?.click());
const buttonNamed = (name: string, within: ParentNode = document) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent?.trim() === name || button.getAttribute('aria-label') === name
    );

function signIn(permissions?: string[]) {
    const user = permissions
        ? { username: 'reviewer', role: 'FACULTY_REVIEWER' as const, permissions }
        : tokenResponse().user;
    act(() => useAuthStore.setState({ token: 'token-1', expiresAt: Date.now() + 60_000, user }));
}

describe('PrerequisiteEditorModal (CF-213)', () => {
    let root: Root;

    function openEditor(programId: string, courseId: string) {
        act(() => {
            usePlannerStore.setState({ activeProgramId: programId });
            usePlannerStore.getState().openCourseDrawer(courseIn(programId, courseId));
        });
        click(query('[data-testid="drawer-edit-prerequisites"]'));
    }

    async function save() {
        await act(async () => {
            query<HTMLButtonElement>('[role="dialog"] button[type="submit"]')?.click();
        });
    }

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        fetchMock.mockImplementation(async () => jsonResponse({ success: true, data: { id: 'x', updatedAt: null } }));
        localStorage.clear();
        useAuthStore.getState().logout();
        useCatalogEditsStore.setState({ courseEdits: {}, editingCourseId: null, editingPrerequisitesCourseId: null });
        usePlannerStore.setState({ activeProgramId: 'computer-eng', inspectedCourse: null, isDrawerOpen: false });
        document.body.innerHTML = '';
        const container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() =>
            root.render(
                <>
                    <ModuleDetailsDrawer />
                    <PrerequisiteEditorModal />
                </>
            )
        );
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.unstubAllGlobals();
    });

    it('is only offered to accounts that can write prerequisites', () => {
        act(() => usePlannerStore.getState().openCourseDrawer(courseIn('computer-eng', 'EC5202')));
        expect(query('[data-testid="drawer-edit-prerequisites"]')).toBeNull();

        signIn(REVIEWER_PERMISSIONS);
        expect(query('[data-testid="drawer-edit-prerequisites"]')).toBeNull();

        act(() => useCatalogEditsStore.getState().openPrerequisiteEditor('EC5202'));
        expect(editor()).toBeNull();
    });

    it('opens with the current rule shown as a tree and a live formula', () => {
        signIn();
        openEditor('computer-eng', 'EC5202');

        expect(editor()).not.toBeNull();
        expect(preview()).toBe('EC3301 AND EC4304');
        expect(input('rule-0-course').value).toBe('EC3301');
        expect(input('rule-1-course').value).toBe('EC4304');
    });

    it('updates the formula as the group logic and conditions change (EE)', () => {
        signIn();
        openEditor('electrical-eng', 'EE4305');
        expect(preview()).toBe('EE3204 AND EE3205');

        const anyOf = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((radio) =>
            radio.textContent?.includes('(OR)')
        );
        click(anyOf);
        expect(preview()).toBe('EE3204 OR EE3205');
        expect(anyOf?.getAttribute('aria-checked')).toBe('true');

        click(buttonNamed('Add credit threshold', query('[role="group"]') ?? document));
        typeInto(input('rule-2-credits'), '60');
        expect(preview()).toBe('EE3204 OR EE3205 OR ≥ 60 Credits');
    });

    it('validates immediately and will not save an incomplete rule', async () => {
        signIn();
        openEditor('computer-eng', 'EC5202');

        click(buttonNamed('Add course', query('[role="group"]') ?? document));
        expect(input('rule-2-course').getAttribute('aria-invalid')).toBe('true');
        expect(query('#rule-2-errors')?.textContent).toContain('Choose a course.');

        typeInto(input('rule-1-course'), 'EC5202');
        expect(query('#rule-1-errors')?.textContent).toContain("A course can't require itself.");

        await save();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(query('[role="alert"]')?.textContent).toContain('Fix the highlighted conditions to save this rule.');
    });

    it('saves the tree to the API and the drawer and canvas pick it up', async () => {
        signIn();
        openEditor('computer-eng', 'EC5202');

        click(buttonNamed('Remove course EC4304'));
        click(buttonNamed('Add credit threshold', query('[role="group"]') ?? document));
        typeInto(input('rule-1-credits'), '45');
        await save();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/v1/courses/EC5202/prerequisites');
        expect(init?.method).toBe('PUT');
        const expected = {
            type: 'AND',
            children: [
                { type: 'COURSE', courseId: 'EC3301' },
                { type: 'CREDIT_THRESHOLD', minCredits: 45 },
            ],
        };
        expect(JSON.parse(String(init?.body))).toEqual(expected);
        expect(editor()).toBeNull();
        expect(useCatalogEditsStore.getState().courseEdits['computer-eng'].EC5202.prerequisiteRule).toEqual(expected);
        expect(query('[data-testid="module-details-drawer"]')?.textContent).toContain('EC3301 AND ≥ 45 Credits');
    });

    it('clears every prerequisite with DELETE', async () => {
        signIn();
        openEditor('computer-eng', 'CE2201');
        expect(preview()).toBe('ME1202');

        click(buttonNamed('Remove course ME1202'));
        expect(preview()).toBe('No prerequisites');
        await save();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/v1/courses/CE2201/prerequisites');
        expect(init?.method).toBe('DELETE');
        expect(useCatalogEditsStore.getState().courseEdits['computer-eng'].CE2201.prerequisiteRule).toBeNull();
    });

    it('starts a rule from nothing and joins a second condition with AND', () => {
        signIn();
        const noRule = getProgramCourses('computer-eng').find((entry) => entry.prerequisiteRule === null);
        if (!noRule) throw new Error('expected a course without prerequisites');
        openEditor('computer-eng', noRule.id);
        expect(preview()).toBe('No prerequisites');

        click(buttonNamed('Add course'));
        typeInto(input('rule-root-course'), 'is1402');
        expect(input('rule-root-course').value).toBe('IS1402');
        expect(preview()).toBe('IS1402');

        click(buttonNamed('Add credit threshold'));
        typeInto(input('rule-1-credits'), '30');
        expect(preview()).toBe('IS1402 AND ≥ 30 Credits');
    });

    it('shows a circular dependency reported by the server without closing', async () => {
        signIn();
        openEditor('computer-eng', 'EC5202');
        fetchMock.mockResolvedValue(
            jsonResponse(
                {
                    detail: [
                        {
                            loc: ['body', 'prerequisiteRule'],
                            msg: 'This rule would create a circular dependency: EC5202 -> EC3301 -> EC5202.',
                            type: 'value_error',
                        },
                    ],
                },
                422
            )
        );

        await save();

        expect(query('[role="alert"]')?.textContent).toContain('circular dependency');
        expect(editor()).not.toBeNull();
    });

    it('closes on Escape and leaves the drawer open', () => {
        signIn();
        openEditor('computer-eng', 'EC5202');

        act(() => {
            input('rule-0-course').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });

        expect(editor()).toBeNull();
        expect(usePlannerStore.getState().isDrawerOpen).toBe(true);
    });
});
