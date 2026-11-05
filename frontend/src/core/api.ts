/**
 * API client configuration and URL resolver.
 *
 * Supports seamless transitions between:
 * - Local Development: Vite dev server proxy routes `/api` to `http://localhost:8000`.
 * - Cloudflare Pages -> Vercel: Resolves `VITE_API_BASE_URL` pointing to the deployed Vercel backend.
 */

/**
 * Resolves the backend API base URL.
 * - In production on Cloudflare Pages: uses `VITE_API_BASE_URL` environment variable.
 * - In local development: defaults to empty string (relying on Vite proxy).
 */
export function getApiBaseUrl(): string {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
        return envUrl.trim().replace(/\/+$/, '');
    }
    return '';
}

/**
 * Constructs a fully qualified URL for backend endpoints.
 */
export function resolveApiUrl(path: string): string {
    const base = getApiBaseUrl();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
}

/**
 * Checks backend health status.
 */
export async function checkBackendHealth(): Promise<{ status: string; service: string; version: string } | null> {
    try {
        const url = resolveApiUrl('/api/health');
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}
