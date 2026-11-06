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
});
