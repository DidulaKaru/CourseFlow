import type { components } from '@/types/api';

type TokenResponse = components['schemas']['TokenResponse'];

export const ADMIN_PERMISSIONS = [
    'courses:write',
    'prerequisites:write',
    'extraction:upload',
    'extraction:review',
    'extraction:commit',
];

export const REVIEWER_PERMISSIONS = ['extraction:upload', 'extraction:review', 'extraction:commit'];

export function tokenResponse(overrides: Partial<TokenResponse> = {}): TokenResponse {
    return {
        accessToken: 'token-1',
        tokenType: 'bearer',
        expiresIn: 3600,
        user: { username: 'registrar', role: 'ADMIN', permissions: ADMIN_PERMISSIONS },
        ...overrides,
    };
}

export function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
