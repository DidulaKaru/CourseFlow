// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import {
    REFRESH_LEAD_MS,
    useAdminSessionLifecycle,
} from '@/features/admin/hooks/useAdminSessionLifecycle';
import { selectIsAdminMode, useAuthStore } from '@/features/admin/store/authStore';
import { jsonResponse, tokenResponse } from './authFixtures';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn<typeof fetch>();
const NOW = 1_700_000_000_000;
const HOUR_MS = 3600 * 1000;

function Probe() {
    useAdminSessionLifecycle();
    return null;
}

function signInUntil(expiresAt: number) {
    useAuthStore.setState({
        token: 'token-1',
        expiresAt,
        user: tokenResponse().user,
    });
}

describe('useAdminSessionLifecycle (CF-211)', () => {
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        fetchMock.mockImplementation(async () =>
            jsonResponse(tokenResponse({ accessToken: 'token-2', expiresIn: 3600 }))
        );
        localStorage.clear();
        useAuthStore.getState().logout();
        root = createRoot(document.createElement('div'));
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('refreshes the token shortly before it expires', async () => {
        signInUntil(NOW + HOUR_MS);
        act(() => root.render(<Probe />));

        await act(() => vi.advanceTimersByTimeAsync(HOUR_MS - REFRESH_LEAD_MS - 1));
        expect(fetchMock).not.toHaveBeenCalled();

        await act(() => vi.advanceTimersByTimeAsync(1));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(useAuthStore.getState().token).toBe('token-2');
        expect(selectIsAdminMode(useAuthStore.getState())).toBe(true);
    });

    it('signs out at expiry when the refresh could not reach the server', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        signInUntil(NOW + HOUR_MS);
        act(() => root.render(<Probe />));

        await act(() => vi.advanceTimersByTimeAsync(HOUR_MS - 1));
        expect(useAuthStore.getState().token).toBe('token-1');

        await act(() => vi.advanceTimersByTimeAsync(1));
        expect(selectIsAdminMode(useAuthStore.getState())).toBe(false);
    });

    it('refreshes right away when less than the lead time is left on a restored session', async () => {
        signInUntil(NOW + REFRESH_LEAD_MS / 2);
        act(() => root.render(<Probe />));

        await act(() => vi.advanceTimersByTimeAsync(0));

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(useAuthStore.getState().token).toBe('token-2');
    });

    it('schedules nothing in Student Mode', async () => {
        act(() => root.render(<Probe />));

        await act(() => vi.advanceTimersByTimeAsync(HOUR_MS * 2));

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
