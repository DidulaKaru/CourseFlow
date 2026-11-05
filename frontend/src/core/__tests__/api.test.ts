import { describe, expect, it, afterEach } from 'vitest';
import { getApiBaseUrl, resolveApiUrl } from '../api';

describe('API URL Resolver (Cloudflare to Vercel Integration)', () => {
    const originalEnv = import.meta.env.VITE_API_BASE_URL;

    afterEach(() => {
        // Reset env
        (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL = originalEnv;
    });

    it('defaults to empty string when VITE_API_BASE_URL is not set (local proxy mode)', () => {
        delete (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL;
        expect(getApiBaseUrl()).toBe('');
        expect(resolveApiUrl('/api/health')).toBe('/api/health');
    });

    it('resolves remote Vercel base URL when configured in environment', () => {
        (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL = 'https://courseflow-backend.vercel.app';
        expect(getApiBaseUrl()).toBe('https://courseflow-backend.vercel.app');
        expect(resolveApiUrl('/api/health')).toBe('https://courseflow-backend.vercel.app/api/health');
    });

    it('strips trailing slashes from base URL gracefully', () => {
        (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL = 'https://courseflow-backend.vercel.app///';
        expect(getApiBaseUrl()).toBe('https://courseflow-backend.vercel.app');
        expect(resolveApiUrl('api/plans/validate')).toBe('https://courseflow-backend.vercel.app/api/plans/validate');
    });
});
