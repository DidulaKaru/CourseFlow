import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { CircleAlert, Loader2, X } from 'lucide-react';
import { useAuthStore } from '@/features/admin/store/authStore';

interface AdminLoginModalProps {
    onClose: () => void;
}

const INPUT_CLASS =
    'w-full min-h-11 rounded-xl border border-ink-subtle bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function AdminLoginModal({ onClose }: AdminLoginModalProps) {
    const login = useAuthStore((state) => state.login);

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const dialogRef = useRef<HTMLDivElement>(null);
    const usernameRef = useRef<HTMLInputElement>(null);

    // Focus moves into the dialog on open and returns to whatever opened it on close.
    useEffect(() => {
        const opener = document.activeElement;
        usernameRef.current?.focus();
        return () => {
            if (opener instanceof HTMLElement) opener.focus();
        };
    }, []);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            onClose();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
            'input, button:not(:disabled)'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setError(null);
        const result = await login(username.trim(), password);
        if (result.ok) {
            onClose();
            return;
        }
        setError(result.message);
        setPassword('');
        setIsSubmitting(false);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:px-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            data-testid="admin-login-backdrop"
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-login-title"
                onKeyDown={handleKeyDown}
                className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink shadow-lg sm:rounded-2xl sm:p-6"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="admin-login-title" className="text-xl font-bold">
                            Faculty sign in
                        </h2>
                        <p className="mt-1 text-sm text-ink-muted">
                            For faculty and curriculum staff. Students don't need to sign in to plan
                            their degree.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="-mr-2 -mt-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label="Close sign in"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
                    <div>
                        <label htmlFor="admin-username" className="block text-sm font-medium">
                            Username
                        </label>
                        <input
                            ref={usernameRef}
                            id="admin-username"
                            type="text"
                            autoComplete="username"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            required
                            className={`${INPUT_CLASS} mt-1`}
                        />
                    </div>
                    <div>
                        <label htmlFor="admin-password" className="block text-sm font-medium">
                            Password
                        </label>
                        <input
                            id="admin-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                            className={`${INPUT_CLASS} mt-1`}
                        />
                    </div>

                    {error !== null && (
                        <p
                            role="alert"
                            className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger"
                        >
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{error}</span>
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting || username.trim() === '' || password === ''}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none"aria-hidden="true" />}
                        {isSubmitting ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
            </div>
        </div>
    );
}
