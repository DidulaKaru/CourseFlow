// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    INVALID_CREDENTIALS_MESSAGE,
    NETWORK_ERROR_MESSAGE,
    adminFetch,
    hasPermission,
    selectIsAdminMode,
    useAuthStore,
} from '@/features/admin/store/authStore';
import {
    REVIEWER_PERMISSIONS,
    jsonResponse,
    tokenResponse,
} from './authFixtures';

const fetchMock = vi.fn<typeof fetch>();
const NOW = 1_700_000_000_000;

function signedIn(overrides: Parameters<typeof tokenResponse>[0] = {}) {
    const session = tokenResponse(overrides);
    useAuthStore.setState({
        token: session.accessToken,
        expiresAt: NOW + session.expiresIn * 1000,
        user: session.user,
    });
}

describe('useAuthStore (CF-211)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        localStorage.clear();
        useAuthStore.getState().logout();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('login', () => {
        it('stores the token, user and an expiry computed from expiresIn', async () => {
            fetchMock.mockResolvedValue(jsonResponse(tokenResponse({ expiresIn: 3600 })));

            const result = await useAuthStore.getState().login('registrar', 'secret');

            expect(result).toEqual({ ok: true });
            const state = useAuthStore.getState();
            expect(state.token).toBe('token-1');
            expect(state.expiresAt).toBe(NOW + 3600 * 1000);
            expect(state.user?.role).toBe('ADMIN');
            expect(selectIsAdminMode(state)).toBe(true);
        });

        it('posts the credentials as JSON to the v1 login endpoint without a bearer token', async () => {
            fetchMock.mockResolvedValue(jsonResponse(tokenResponse()));

            await useAuthStore.getState().login('registrar', 'secret');

            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('/api/v1/auth/login');
            expect(init?.method).toBe('POST');
            expect(JSON.parse(String(init?.body))).toEqual({ username: 'registrar', password: 'secret' });
            expect(new Headers(init?.headers).has('Authorization')).toBe(false);
        });

        it('returns the server message for rejected credentials and stays signed out', async () => {
            fetchMock.mockResolvedValue(
                jsonResponse({ detail: 'Incorrect username or password.' }, 401)
            );

            const result = await useAuthStore.getState().login('registrar', 'wrong');

            expect(result).toEqual({ ok: false, message: INVALID_CREDENTIALS_MESSAGE });
            expect(selectIsAdminMode(useAuthStore.getState())).toBe(false);
        });

        it('explains a network failure without signing in', async () => {
            fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

            const result = await useAuthStore.getState().login('registrar', 'secret');

            expect(result).toEqual({ ok: false, message: NETWORK_ERROR_MESSAGE });
            expect(useAuthStore.getState().token).toBeNull();
        });
    });

    describe('logout', () => {
        it('clears the session and the persisted copy', async () => {
            fetchMock.mockResolvedValue(jsonResponse(tokenResponse()));
            await useAuthStore.getState().login('registrar', 'secret');
            expect(localStorage.getItem('courseflow-admin-session')).toContain('token-1');

            useAuthStore.getState().logout();

            const state = useAuthStore.getState();
            expect(state).toMatchObject({ token: null, expiresAt: null, user: null });
            expect(localStorage.getItem('courseflow-admin-session')).not.toContain('token-1');
        });
    });

    describe('refresh', () => {
        it('swaps in the new token and expiry', async () => {
            signedIn();
            fetchMock.mockResolvedValue(
                jsonResponse(tokenResponse({ accessToken: 'token-2', expiresIn: 7200 }))
            );

            const refreshed = await useAuthStore.getState().refresh();

            expect(refreshed).toBe(true);
            expect(useAuthStore.getState().token).toBe('token-2');
            expect(useAuthStore.getState().expiresAt).toBe(NOW + 7200 * 1000);
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('/api/v1/auth/refresh');
            expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1');
        });

        it('signs out when the server rejects the token', async () => {
            signedIn();
            fetchMock.mockResolvedValue(jsonResponse({ detail: 'Invalid token' }, 401));

            expect(await useAuthStore.getState().refresh()).toBe(false);
            expect(selectIsAdminMode(useAuthStore.getState())).toBe(false);
        });

        it('signs out without calling the server when the token has already expired', async () => {
            signedIn();
            vi.setSystemTime(NOW + 3600 * 1000);

            expect(await useAuthStore.getState().refresh()).toBe(false);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(useAuthStore.getState().token).toBeNull();
        });

        it('keeps the session when the network drops, so the expiry timer decides', async () => {
            signedIn();
            fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

            expect(await useAuthStore.getState().refresh()).toBe(false);
            expect(useAuthStore.getState().token).toBe('token-1');
        });

        it('does not resurrect a session the user signed out of while it was in flight', async () => {
            signedIn();
            fetchMock.mockImplementation(async () => {
                useAuthStore.getState().logout();
                return jsonResponse(tokenResponse({ accessToken: 'token-2' }));
            });

            expect(await useAuthStore.getState().refresh()).toBe(false);
            expect(useAuthStore.getState().token).toBeNull();
        });
    });

    describe('adminFetch', () => {
        it('sends the bearer token', async () => {
            signedIn();
            fetchMock.mockResolvedValue(jsonResponse({ success: true }));

            await adminFetch('/api/v1/courses/1', { method: 'PUT' });

            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('/api/v1/courses/1');
            expect(init?.method).toBe('PUT');
            expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1');
        });

        it('returns the app to Student Mode when any admin call answers 401', async () => {
            signedIn();
            fetchMock.mockResolvedValue(jsonResponse({ detail: 'Token expired' }, 401));

            const response = await adminFetch('/api/v1/courses/1');

            expect(response.status).toBe(401);
            expect(selectIsAdminMode(useAuthStore.getState())).toBe(false);
        });

        it('keeps the session on a 403 because the user is signed in but not permitted', async () => {
            signedIn();
            fetchMock.mockResolvedValue(jsonResponse({ detail: 'Forbidden' }, 403));

            await adminFetch('/api/v1/courses/1');

            expect(selectIsAdminMode(useAuthStore.getState())).toBe(true);
        });
    });

    describe('rehydration', () => {
        function persist(expiresAt: number) {
            localStorage.setItem(
                'courseflow-admin-session',
                JSON.stringify({
                    state: { token: 'stored-token', expiresAt, user: tokenResponse().user },
                    version: 1,
                })
            );
        }

        it('restores a session that has not expired', async () => {
            persist(NOW + 60_000);

            await useAuthStore.persist.rehydrate();

            expect(useAuthStore.getState().token).toBe('stored-token');
        });

        it('signs out immediately when the stored session has expired', async () => {
            persist(NOW - 1);

            await useAuthStore.persist.rehydrate();

            expect(useAuthStore.getState().token).toBeNull();
            expect(selectIsAdminMode(useAuthStore.getState())).toBe(false);
        });
    });

    describe('hasPermission', () => {
        it('gives a faculty reviewer extraction controls but not course editing', () => {
            signedIn({
                user: {
                    username: 'reviewer',
                    role: 'FACULTY_REVIEWER',
                    permissions: REVIEWER_PERMISSIONS,
                },
            });
            const state = useAuthStore.getState();

            expect(hasPermission('extraction:review')(state)).toBe(true);
            expect(hasPermission('courses:write')(state)).toBe(false);
        });

        it('grants nothing in Student Mode', () => {
            expect(hasPermission('extraction:review')(useAuthStore.getState())).toBe(false);
        });
    });
});
