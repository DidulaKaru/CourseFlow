import { describe, expect, it } from 'vitest';
import { DEFAULT_API_PROXY_TARGET, resolveApiProxyTarget } from '@/core/devProxy';

// CF-121 regression lock: inside Docker Compose the frontend container must proxy
// /api to the `backend` service, not to its own localhost.
describe('resolveApiProxyTarget', () => {
    it('defaults to the host backend for native local dev', () => {
        expect(resolveApiProxyTarget({})).toBe(DEFAULT_API_PROXY_TARGET);
        expect(DEFAULT_API_PROXY_TARGET).toBe('http://localhost:8000');
    });

    it('uses VITE_PROXY_TARGET when provided (Docker Compose backend service)', () => {
        expect(resolveApiProxyTarget({ VITE_PROXY_TARGET: 'http://backend:8000' })).toBe('http://backend:8000');
    });

    it('ignores blank values and strips trailing slashes', () => {
        expect(resolveApiProxyTarget({ VITE_PROXY_TARGET: '   ' })).toBe(DEFAULT_API_PROXY_TARGET);
        expect(resolveApiProxyTarget({ VITE_PROXY_TARGET: 'http://backend:8000//' })).toBe('http://backend:8000');
    });
});
