import { useEffect } from 'react';
import { useAuthStore } from '@/features/admin/store/authStore';

/** Tokens last 60 minutes; renew with five left so an active editor is never cut off. */
export const REFRESH_LEAD_MS = 5 * 60 * 1000;

/** Keeps the admin session alive until the token expires, then returns the app to Student Mode. */
export function useAdminSessionLifecycle(): void {
    const expiresAt = useAuthStore((state) => state.expiresAt);
    const refresh = useAuthStore((state) => state.refresh);
    const logout = useAuthStore((state) => state.logout);

    useEffect(() => {
        if (expiresAt === null) return;

        const msLeft = expiresAt - Date.now();
        const refreshTimer = setTimeout(() => void refresh(), Math.max(msLeft - REFRESH_LEAD_MS, 0));
        const expiryTimer = setTimeout(logout, Math.max(msLeft, 0));
        return () => {
            clearTimeout(refreshTimer);
            clearTimeout(expiryTimer);
        };
    }, [expiresAt, refresh, logout]);
}
