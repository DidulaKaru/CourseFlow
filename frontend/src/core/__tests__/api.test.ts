import { describe, expect, it, afterEach, vi } from 'vitest';
import { getApiBaseUrl, resolveApiUrl, checkBackendHealth } from '../api';

describe('API URL Resolver (Cloudflare to Vercel Integration)', () => {
    const originalEnv = import.meta.env.VITE_API_BASE_URL;

    afterEach(() => {
        // Reset env
        (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL = originalEnv;
        vi.restoreAllMocks();
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

describe('checkBackendHealth', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns health payload when backend endpoint responds successfully', async () => {
        const mockHealth = { status: 'healthy', service: 'courseflow-backend', version: '0.1.0' };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => mockHealth,
        } as Response);

        const result = await checkBackendHealth();
        expect(result).toEqual(mockHealth);
    });

    it('returns null silently when backend responds with an error status', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: false,
            status: 500,
        } as Response);

        const result = await checkBackendHealth();
        expect(result).toBeNull();
    });

    it('returns null silently without throwing when fetch experiences network failure', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error / offline'));

        const result = await checkBackendHealth();
        expect(result).toBeNull();
    });

    it('uses AbortController signal with timeout to prevent hanging requests', async () => {
        let signalPassed: AbortSignal | undefined;
        vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init) => {
            signalPassed = init?.signal as AbortSignal;
            return Promise.resolve({
                ok: true,
                json: async () => ({ status: 'ok', service: 'test', version: '1.0.0' }),
            } as Response);
        });

        await checkBackendHealth();
        expect(signalPassed).toBeInstanceOf(AbortSignal);
        expect(signalPassed?.aborted).toBe(false);
    });
});
