// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { AdminAccessControl } from '@/features/admin/components/AdminAccessControl';
import { INVALID_CREDENTIALS_MESSAGE, useAuthStore } from '@/features/admin/store/authStore';
import { jsonResponse, tokenResponse } from './authFixtures';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn<typeof fetch>();

function typeInto(input: HTMLInputElement, value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
        setValue?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('AdminAccessControl (CF-211)', () => {
    let container: HTMLDivElement;
    let root: Root;

    const byId = <T extends HTMLElement>(id: string) =>
        document.querySelector<T>(`[data-testid="${id}"]`);
    const dialog = () => document.querySelector('[role="dialog"]');
    const alertText = () => document.querySelector('[role="alert"]')?.textContent;

    async function submitLogin(username: string, password: string) {
        typeInto(document.querySelector<HTMLInputElement>('#admin-username')!, username);
        typeInto(document.querySelector<HTMLInputElement>('#admin-password')!, password);
        await act(async () => {
            document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
        });
    }

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        localStorage.clear();
        useAuthStore.getState().logout();
        document.body.innerHTML = '';
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(<AdminAccessControl />));
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.unstubAllGlobals();
    });

    it('offers a labelled lock button and no admin badge in Student Mode', () => {
        const lock = byId('admin-access-button');

        expect(lock?.getAttribute('aria-label')).toBe('Faculty sign in');
        expect(byId('admin-mode-badge')).toBeNull();
        expect(dialog()).toBeNull();
    });

    it('opens the sign-in dialog from the lock button and closes it with Escape', () => {
        act(() => byId('admin-access-button')!.click());
        expect(dialog()).not.toBeNull();
        expect(document.activeElement?.id).toBe('admin-username');

        act(() => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            );
        });
        expect(dialog()).toBeNull();
    });

    it('shows an inline error for bad credentials and keeps the username for another try', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ detail: 'Incorrect username or password.' }, 401)
        );
        act(() => byId('admin-access-button')!.click());

        await submitLogin('registrar', 'wrong');

        expect(alertText()).toContain(INVALID_CREDENTIALS_MESSAGE);
        expect(dialog()).not.toBeNull();
        expect(document.querySelector<HTMLInputElement>('#admin-username')?.value).toBe('registrar');
        expect(document.querySelector<HTMLInputElement>('#admin-password')?.value).toBe('');
        expect(byId('admin-mode-badge')).toBeNull();
    });

    it('does not submit until both fields are filled', () => {
        act(() => byId('admin-access-button')!.click());

        expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('switches to Admin Mode on valid credentials and back to Student Mode on sign out', async () => {
        fetchMock.mockResolvedValue(jsonResponse(tokenResponse()));
        act(() => byId('admin-access-button')!.click());

        await submitLogin('registrar', 'secret');

        expect(dialog()).toBeNull();
        expect(byId('admin-mode-badge')?.textContent).toContain('Admin mode');
        expect(byId('admin-access-button')).toBeNull();

        act(() => byId('admin-mode-badge')!.click());
        expect(document.querySelector('[role="menu"]')?.textContent).toContain('registrar');
        act(() => document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());

        expect(byId('admin-mode-badge')).toBeNull();
        expect(byId('admin-access-button')).not.toBeNull();
        expect(useAuthStore.getState().token).toBeNull();
    });

    it('returns to Student Mode and closes the menu when the token is rejected elsewhere', () => {
        act(() =>
            useAuthStore.setState({
                token: 'token-1',
                expiresAt: Date.now() + 60_000,
                user: tokenResponse().user,
            })
        );
        expect(byId('admin-mode-badge')).not.toBeNull();
        act(() => byId('admin-mode-badge')!.click());
        expect(document.querySelector('[role="menu"]')).not.toBeNull();

        act(() => useAuthStore.getState().logout());

        expect(byId('admin-mode-badge')).toBeNull();
        expect(document.querySelector('[role="menu"]')).toBeNull();
    });
});
