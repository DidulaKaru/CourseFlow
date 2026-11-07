import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SemesterFeed } from '../SemesterFeed';
import { usePlannerStore } from '@/core/store';

describe('SemesterFeed Component (Mobile List View)', () => {
    beforeEach(() => {
        localStorage.clear();
        usePlannerStore.getState().resetPlanner();
        usePlannerStore.getState().setActiveProgram('computer-eng');
    });

    it('renders all 8 semesters with Roman numeral headers', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<SemesterFeed />);
        });

        expect(container.textContent).toContain('Semester 1');
        expect(container.textContent).toContain('Semester 8');
        expect(container.textContent).toContain('I');
        expect(container.textContent).toContain('VIII');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('renders elective modules with toggle plan button', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<SemesterFeed />);
        });

        // Semester 7 or 8 has electives
        const addButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
            b.textContent?.includes('Add to Plan')
        );
        expect(addButtons.length).toBeGreaterThan(0);

        // Click to add to plan
        act(() => {
            addButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Store should have 1 selected elective
        expect(usePlannerStore.getState().selectedElectiveIds.length).toBe(1);

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('renders sticky semester quick-jump navigation links for rapid mobile scrolling', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<SemesterFeed />);
        });

        // Quick jump bar has links for S1 through S8
        for (let i = 1; i <= 8; i++) {
            const link = container.querySelector(`a[href="#semester-${i}"]`);
            expect(link).not.toBeNull();
            expect(link?.textContent).toContain(`S${i}`);
        }

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('supports keyboard navigation parity on feed course cards', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<SemesterFeed />);
        });

        const cards = container.querySelectorAll('[role="article"]');
        expect(cards.length).toBeGreaterThan(0);

        const firstCard = cards[0] as HTMLDivElement;
        expect(firstCard.tabIndex).toBe(0);
        expect(firstCard.getAttribute('aria-label')).toBeTruthy();
        expect(firstCard.className).toContain('focus-visible:ring-1');

        expect(usePlannerStore.getState().isDrawerOpen).toBe(false);

        // Press Enter to open drawer
        act(() => {
            firstCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });
        expect(usePlannerStore.getState().isDrawerOpen).toBe(true);

        // Close drawer
        act(() => {
            usePlannerStore.getState().closeCourseDrawer();
        });
        expect(usePlannerStore.getState().isDrawerOpen).toBe(false);

        // Press Space to open drawer
        act(() => {
            firstCard.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        });
        expect(usePlannerStore.getState().isDrawerOpen).toBe(true);

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
