// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import App from '@/App';
import { MIS_UPLOADS_HASH, PLANNER_HASH } from '@/core/hashRoute';
import { usePlannerStore } from '@/core/store';
import { REVIEWER_PERMISSIONS, tokenResponse } from '@/features/admin/__tests__/authFixtures';
import { useAuthStore } from '@/features/admin/store/authStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const uploadsPage = () => document.querySelector('[data-testid="mis-ingestion-page"]');
const planner = () => document.querySelector('[data-testid="top-nav"]');

function goTo(hash: string) {
    act(() => {
        window.location.hash = hash;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
}

describe('syllabus uploads route (CF-214)', () => {
    let root: Root;

    beforeEach(() => {
        localStorage.clear();
        useAuthStore.getState().logout();
        // The list view keeps React Flow (which needs ResizeObserver) out of jsdom.
        usePlannerStore.setState({ activeProgramId: 'computer-eng', mobileViewMode: 'list' });
        window.location.hash = '';
        document.body.innerHTML = '';
        const container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(<App />));
    });

    afterEach(() => {
        act(() => root.unmount());
        window.location.hash = '';
    });

    it('keeps students on the planner even at the uploads address', () => {
        goTo(MIS_UPLOADS_HASH);

        expect(uploadsPage()).toBeNull();
        expect(planner()).not.toBeNull();
    });

    it('opens the uploads page for a faculty reviewer and goes back to the planner', () => {
        act(() =>
            useAuthStore.setState({
                token: 'token-1',
                expiresAt: Date.now() + 60_000,
                user: { username: 'reviewer', role: 'FACULTY_REVIEWER', permissions: REVIEWER_PERMISSIONS },
            })
        );
        goTo(MIS_UPLOADS_HASH);
        expect(uploadsPage()).not.toBeNull();

        goTo(PLANNER_HASH);
        expect(uploadsPage()).toBeNull();
        expect(planner()).not.toBeNull();
    });

    it('returns an admin to the planner when the session ends on the uploads page', () => {
        act(() => useAuthStore.setState({ token: 'token-1', expiresAt: Date.now() + 60_000, user: tokenResponse().user }));
        goTo(MIS_UPLOADS_HASH);
        expect(uploadsPage()).not.toBeNull();

        act(() => useAuthStore.getState().logout());

        expect(uploadsPage()).toBeNull();
        expect(planner()).not.toBeNull();
    });
});
