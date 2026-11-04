import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { usePlannerStore } from '@/core/store';
import type { Course } from '@/types/curriculum';
import { ModuleDetailsDrawer } from '../ModuleDetailsDrawer';

// Configure act environment for React 19 testing in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ModuleDetailsDrawer Component (CF-114)', () => {
    beforeEach(() => {
        usePlannerStore.getState().resetPlanner();
        document.body.innerHTML = '';
    });

    const mockCourse: Course = {
        id: 'CO544',
        code: 'CO544',
        title: 'Machine Learning',
        description: 'Supervised, unsupervised, and deep learning architectures.',
        totalCredits: 3,
        durationSemesters: 1,
        recommendedSemester: 7,
        creditDistribution: [{ semesterIndex: 7, creditsAllocated: 3 }],
        type: 'ELECTIVE',
        prerequisiteRule: {
            type: 'COURSE',
            courseId: 'CO2001',
        },
        corequisites: ['CO544L'],
        offeredSemesters: ['FALL'],
    };

    const mockCapstone: Course = {
        id: 'CE4001',
        code: 'CE4001',
        title: 'Comprehensive Design Project',
        description: 'Year-long capstone engineering research.',
        totalCredits: 6,
        durationSemesters: 2,
        recommendedSemester: 7,
        creditDistribution: [
            { semesterIndex: 7, creditsAllocated: 3 },
            { semesterIndex: 8, creditsAllocated: 3 },
        ],
        type: 'CAPSTONE',
        prerequisiteRule: null,
        corequisites: [],
        offeredSemesters: ['BOTH'],
    };

    it('returns null when no course is being inspected', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<ModuleDetailsDrawer />);
        });

        expect(container.innerHTML).toBe('');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('renders course metadata, syllabus objectives, and contact hours when open', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            usePlannerStore.getState().openCourseDrawer(mockCourse);
            root.render(<ModuleDetailsDrawer />);
        });

        expect(container.textContent).toContain('CO544');
        expect(container.textContent).toContain('Machine Learning');
        expect(container.textContent).toContain('3 Credits');
        expect(container.textContent).toContain('Elective Module');
        expect(container.textContent).toContain('Supervised, unsupervised, and deep learning architectures.');
        expect(container.textContent).toContain('Lectures');
        expect(container.textContent).toContain('Tutorials');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('renders prerequisite AST rule and dependency component chips with status', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            usePlannerStore.getState().openCourseDrawer(mockCourse);
            root.render(<ModuleDetailsDrawer />);
        });

        // Formatted rule expression
        expect(container.textContent).toContain('CO2001');
        // Unmet initially because CO2001 is missing
        expect(container.textContent).toContain('Missing');

        // Now mark CO2001 completed
        act(() => {
            usePlannerStore.getState().toggleCompletedCourse('CO2001');
            root.render(<ModuleDetailsDrawer />);
        });

        expect(container.textContent).toContain('Completed');
        expect(container.textContent).toContain('Satisfied');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('renders co-requisite chips and multi-semester credit distribution timeline', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            usePlannerStore.getState().openCourseDrawer(mockCapstone);
            root.render(<ModuleDetailsDrawer />);
        });

        expect(container.textContent).toContain('Multi-Semester Credit Distribution Timeline');
        expect(container.textContent).toContain('Semester 7');
        expect(container.textContent).toContain('Semester 8');
        expect(container.textContent).toContain('3 Credits');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('allows toggling elective study plan selection and course completion', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            usePlannerStore.getState().openCourseDrawer(mockCourse);
            root.render(<ModuleDetailsDrawer />);
        });

        const electiveBtn = container.querySelector('[data-testid="drawer-elective-toggle"]') as HTMLButtonElement;
        const completeBtn = container.querySelector('[data-testid="drawer-completion-toggle"]') as HTMLButtonElement;

        expect(electiveBtn).toBeDefined();
        expect(completeBtn).toBeDefined();

        // Add elective to plan
        act(() => {
            electiveBtn.click();
        });
        expect(usePlannerStore.getState().isElectiveSelected('CO544')).toBe(true);

        // Mark course completed
        act(() => {
            completeBtn.click();
        });
        expect(usePlannerStore.getState().isCourseCompleted('CO544')).toBe(true);

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('closes drawer on backdrop click and on close button click', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            usePlannerStore.getState().openCourseDrawer(mockCourse);
            root.render(<ModuleDetailsDrawer />);
        });

        expect(usePlannerStore.getState().isDrawerOpen).toBe(true);

        // Click close button
        const closeBtn = container.querySelector('[data-testid="drawer-close-button"]') as HTMLButtonElement;
        act(() => {
            closeBtn.click();
        });
        expect(usePlannerStore.getState().isDrawerOpen).toBe(false);

        // Reopen and click backdrop
        act(() => {
            usePlannerStore.getState().openCourseDrawer(mockCourse);
            root.render(<ModuleDetailsDrawer />);
        });
        expect(usePlannerStore.getState().isDrawerOpen).toBe(true);

        const backdrop = container.querySelector('[data-testid="drawer-backdrop"]') as HTMLElement;
        act(() => {
            backdrop.click();
        });
        expect(usePlannerStore.getState().isDrawerOpen).toBe(false);

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('closes drawer on Escape keydown', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            usePlannerStore.getState().openCourseDrawer(mockCourse);
            root.render(<ModuleDetailsDrawer />);
        });

        expect(usePlannerStore.getState().isDrawerOpen).toBe(true);

        // Trigger Escape key
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });

        expect(usePlannerStore.getState().isDrawerOpen).toBe(false);

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
