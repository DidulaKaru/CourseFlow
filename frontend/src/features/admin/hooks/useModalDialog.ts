import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not(:disabled)';

/**
 * Keyboard and focus behaviour shared by the admin modals: focus moves to `initialFocusRef` on open
 * and back to the opener on close, Tab stays inside the dialog, and Escape closes it.
 */
export function useModalDialog<T extends HTMLElement>(onClose: () => void) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const initialFocusRef = useRef<T>(null);

    useEffect(() => {
        const opener = document.activeElement;
        initialFocusRef.current?.focus();
        return () => {
            if (opener instanceof HTMLElement) opener.focus();
        };
    }, []);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            // The drawer underneath closes on a window-level Escape; this one belongs to the dialog.
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
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

    return { dialogRef, initialFocusRef, onKeyDown };
}
