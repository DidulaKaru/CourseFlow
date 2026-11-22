/**
 * Resolves the backend origin the Vite dev server proxies `/api` requests to.
 *
 * - Native local dev (`npm run dev`): backend runs on the host at localhost:8000.
 * - Docker Compose: `localhost` inside the frontend container is the container
 *   itself, so compose sets `VITE_PROXY_TARGET=http://backend:8000` (the backend
 *   service hostname on the compose network).
 */
export const DEFAULT_API_PROXY_TARGET = 'http://localhost:8000';

export function resolveApiProxyTarget(env: Record<string, string | undefined>): string {
    const target = env.VITE_PROXY_TARGET?.trim();
    return target ? target.replace(/\/+$/, '') : DEFAULT_API_PROXY_TARGET;
}
