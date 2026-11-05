import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CourseSearchModal } from '../CourseSearchModal';
import { usePlannerStore } from '@/core/store';

describe('CourseSearchModal Component', () => {
    beforeEach(() => {
        localStorage.clear();
        usePlannerStore.getState().resetPlanner();
        usePlannerStore.getState().setActiveProgram('computer-eng');
    });

    it('renders nothing when isOpen is false', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<CourseSearchModal isOpen={false} onClose={() => {}} />);
        });

        expect(container.textContent).toBe('');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('renders search input and course results when isOpen is true', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<CourseSearchModal isOpen={true} onClose={() => {}} />);
        });

        expect(container.querySelector('input')).not.toBeNull();
        expect(container.textContent).toContain('All Modules');
        expect(container.textContent).toContain('CE1101');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('filters courses dynamically when search query is entered', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<CourseSearchModal isOpen={true} onClose={() => {}} />);
        });

        const input = container.querySelector('input');
        expect(input).not.toBeNull();

        act(() => {
            if (input) {
                input.value = 'Environmental';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        // CE1101 is Basic Concepts in Environmental Engineering
        expect(container.textContent).toContain('CE1101');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('calls onClose when close button is clicked', () => {
        const handleClose = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<CourseSearchModal isOpen={true} onClose={handleClose} />);
        });

        const closeBtn = container.querySelector('[data-testid="search-modal-close"]');
        expect(closeBtn).not.toBeNull();

        act(() => {
            closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(handleClose).toHaveBeenCalledTimes(1);

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('calls onClose when clicking outside on the backdrop', () => {
        const handleClose = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<CourseSearchModal isOpen={true} onClose={handleClose} />);
        });

        const backdrop = container.querySelector('[data-testid="search-modal-backdrop"]');
        expect(backdrop).not.toBeNull();

        act(() => {
            backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(handleClose).toHaveBeenCalledTimes(1);

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
