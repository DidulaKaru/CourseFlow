import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { resolveApiUrl } from '@/core/api';
import type { components } from '@/types/api';

type LoginRequest = components['schemas']['LoginRequest'];
type TokenResponse = components['schemas']['TokenResponse'];
export type AuthenticatedUser = components['schemas']['AuthenticatedUser'];

export type AdminPermission =
    | 'courses:write'
    | 'prerequisites:write'
    | 'extraction:upload'
    | 'extraction:review'
    | 'extraction:commit';

export type LoginResult = { ok: true } | { ok: false; message: string };

export const INVALID_CREDENTIALS_MESSAGE = 'Incorrect username or password.';
export const NETWORK_ERROR_MESSAGE =
    "We couldn't reach the server. Check your connection and try again.";
export const SERVER_ERROR_MESSAGE = 'Something went wrong signing you in. Please try again.';

interface AuthState {
    token: string | null;
    /** Epoch milliseconds at which the access token stops being valid. */
    expiresAt: number | null;
    user: AuthenticatedUser | null;
    login: (username: string, password: string) => Promise<LoginResult>;
    refresh: () => Promise<boolean>;
    logout: () => void;
}

type PersistedSession = Pick<AuthState, 'token' | 'expiresAt' | 'user'>;

const SIGNED_OUT: PersistedSession = { token: null, expiresAt: null, user: null };

export function isSessionExpired(expiresAt: number | null, now: number = Date.now()): boolean {
    return expiresAt === null || expiresAt <= now;
}

function sessionFrom(response: TokenResponse): PersistedSession {
    return {
        token: response.accessToken,
        expiresAt: Date.now() + response.expiresIn * 1000,
        user: response.user,
    };
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            ...SIGNED_OUT,

            login: async (username, password) => {
                const credentials: LoginRequest = { username, password };
                let response: Response;
                try {
                    response = await fetch(resolveApiUrl('/api/v1/auth/login'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                        body: JSON.stringify(credentials),
                    });
                } catch {
                    return { ok: false, message: NETWORK_ERROR_MESSAGE };
                }
                if (response.status === 401) {
                    return { ok: false, message: INVALID_CREDENTIALS_MESSAGE };
                }
                if (!response.ok) {
                    return { ok: false, message: SERVER_ERROR_MESSAGE };
                }
                const body: TokenResponse = await response.json();
                set(sessionFrom(body));
                return { ok: true };
            },

            refresh: async () => {
                const { token, expiresAt } = get();
                if (token === null || isSessionExpired(expiresAt)) {
                    get().logout();
                    return false;
                }
                let response: Response;
                try {
                    response = await adminFetch('/api/v1/auth/refresh', { method: 'POST' });
                } catch {
                    return false;
                }
                // A 401 has already logged out inside adminFetch. A user who signed out (or
                // in again) while the request was in flight must not get the old session back.
                if (!response.ok || get().token !== token) return false;
                const body: TokenResponse = await response.json();
                set(sessionFrom(body));
                return true;
            },

            logout: () => set(SIGNED_OUT),
        }),
        {
            name: 'courseflow-admin-session',
            storage: createJSONStorage(() => localStorage),
            version: 1,
            partialize: ({ token, expiresAt, user }): PersistedSession => ({ token, expiresAt, user }),
            merge: (persisted, current) => {
                const session = persisted as Partial<PersistedSession> | undefined;
                if (!session || isSessionExpired(session.expiresAt ?? null)) return current;
                return { ...current, ...session };
            },
        }
    )
);

/**
 * fetch for faculty admin endpoints: attaches the bearer token and signs the user out
 * when the server rejects it. Student routes must never go through this.
 */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    const { token } = useAuthStore.getState();
    if (token !== null) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(resolveApiUrl(path), { ...init, headers });
    if (response.status === 401) useAuthStore.getState().logout();
    return response;
}

export const selectIsAdminMode = (state: AuthState): boolean =>
    state.token !== null && state.user !== null;

export const hasPermission =
    (permission: AdminPermission) =>
    (state: AuthState): boolean =>
        state.user?.permissions?.includes(permission) ?? false;
