import { useEffect, useRef, useState } from 'react';
import { FileUp, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { MIS_UPLOADS_HASH } from '@/core/hashRoute';
import { AdminLoginModal } from '@/features/admin/components/AdminLoginModal';
import { hasPermission, selectIsAdminMode, useAuthStore } from '@/features/admin/store/authStore';

const TRIGGER_CLASS =
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Top-bar entry to Faculty Admin Mode: a lock while signed out, an "Admin mode" badge with sign-out once signed in. */
export function AdminAccessControl() {
    const isAdminMode = useAuthStore(selectIsAdminMode);
    return isAdminMode ? <AdminModeMenu /> : <FacultySignInButton />;
}

function FacultySignInButton() {
    const [isLoginOpen, setIsLoginOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                className={`${TRIGGER_CLASS} min-w-11 border-line bg-surface px-0 text-ink hover:bg-surface-muted`}
                aria-label="Faculty sign in"
                title="Faculty sign in"
                data-testid="admin-access-button"
            >
                <Lock className="h-4 w-4" aria-hidden="true" />
            </button>
            {isLoginOpen && <AdminLoginModal onClose={() => setIsLoginOpen(false)} />}
        </>
    );
}

function AdminModeMenu() {
    const username = useAuthStore((state) => state.user?.username);
    const logout = useAuthStore((state) => state.logout);
    const canUpload = useAuthStore(hasPermission('extraction:upload'));

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isMenuOpen) return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMenuOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isMenuOpen]);

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setIsMenuOpen((open) => !open)}
                className={`${TRIGGER_CLASS} border-accent bg-accent-soft text-accent-strong`}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                aria-label="Admin mode menu"
                data-testid="admin-mode-badge"
            >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Admin mode</span>
            </button>
            {isMenuOpen && (
                <div
                    role="menu"
                    className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-line bg-surface p-2 text-ink shadow-lg"
                >
                    <p className="truncate px-2 py-1.5 text-sm text-ink-muted">
                        Signed in as <span className="font-medium text-ink">{username}</span>
                    </p>
                    {canUpload && (
                        <a
                            href={MIS_UPLOADS_HASH}
                            role="menuitem"
                            onClick={() => setIsMenuOpen(false)}
                            className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-sm font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            <FileUp className="h-4 w-4" aria-hidden="true" />
                            Syllabus uploads
                        </a>
                    )}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={logout}
                        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-sm font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}
