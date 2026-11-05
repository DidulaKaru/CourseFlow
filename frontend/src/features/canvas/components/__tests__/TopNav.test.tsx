import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { usePlannerStore } from '@/core/store';
import { mockComputerEngineeringProgram, mockCourses } from '@/data/mockCourses';
import { TopNav } from '../TopNav';

// Configure act environment for React 19 testing in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock PDFDownloadLink to prevent asynchronous PDF blob compilation outside act()
vi.mock('@react-pdf/renderer', () => ({
    PDFDownloadLink: ({ children }: { children: (props: { loading: boolean }) => React.ReactNode }) =>
        children({ loading: false }),
    Font: { register: vi.fn() },
    StyleSheet: { create: (styles: unknown) => styles },
}));

describe('TopNav Component (CF-115)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        usePlannerStore.setState({
            activeProgramId: 'computer-eng',
            selectedElectiveIds: [],
            completedCourseIds: [],
            inspectedCourse: null,
            isDrawerOpen: false,
        });
    });

    it('renders CourseFlow brand logo and title', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<TopNav />);
        });

        expect(container.textContent).toContain('Course');
        expect(container.textContent).toContain('Flow');
        expect(container.querySelector('[data-testid="degree-selector"]')).not.toBeNull();

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('displays graduation credit progress counter (N / 150 Credits)', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <TopNav
                    courses={mockCourses}
                    program={mockComputerEngineeringProgram}
                    totalCreditsRequired={150}
                />
            );
        });

        const counter = container.querySelector('[data-testid="graduation-credit-counter"]');
        expect(counter).not.toBeNull();
        expect(counter?.textContent).toContain('150 Credits');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('updates graduation total dynamically in real time when electives are toggled without page refresh or remount', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        // Mount TopNav once
        act(() => {
            root.render(
                <TopNav
                    courses={mockCourses}
                    program={mockComputerEngineeringProgram}
                    totalCreditsRequired={150}
                />
            );
        });

        const plannedDisplay = container.querySelector('[data-testid="planned-credits-display"]');
        expect(plannedDisplay).not.toBeNull();

        // 1. Initially, no electives are selected (only mandatory core modules count = 120 cr)
        const initialCredits = Number(plannedDisplay?.textContent);
        expect(initialCredits).toBe(120);

        // 2. Toggle elective IS3322 (3 credits) in Zustand store - DO NOT re-render manually
        act(() => {
            usePlannerStore.getState().toggleElective('IS3322');
        });

        // Assert that TopNav reactively updated in the DOM immediately
        expect(plannedDisplay?.textContent).toBe(String(initialCredits + 3));

        // 3. Toggle another elective (IS4224, 2 credits)
        act(() => {
            usePlannerStore.getState().toggleElective('IS4224');
        });
        expect(plannedDisplay?.textContent).toBe(String(initialCredits + 5));

        // 4. Untoggle elective IS3322 -> immediately decrements without refresh
        act(() => {
            usePlannerStore.getState().toggleElective('IS3322');
        });
        expect(plannedDisplay?.textContent).toBe(String(initialCredits + 2));

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('reflects eligibility in real time when planned credits reach required threshold via live store updates', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <TopNav
                    courses={mockCourses}
                    program={mockComputerEngineeringProgram}
                    totalCreditsRequired={150}
                />
            );
        });

        const counter = container.querySelector('[data-testid="graduation-credit-counter"]');
        expect(counter?.className).not.toContain('bg-emerald-950/40');

        // Select all electives dynamically while mounted
        const allElectives = mockCourses.filter((c) => c.type === 'ELECTIVE');
        const allElectiveIds = allElectives.map((c) => c.id);
        const expectedTotalPlanned = 120 + allElectives.reduce((sum, c) => sum + c.totalCredits, 0);

        act(() => {
            usePlannerStore.getState().setSelectedElectives(allElectiveIds);
        });

        // Verify the DOM updated to eligible status reactively without remounting
        expect(counter?.className).toContain('bg-emerald-950/40');
        expect(container.querySelector('[data-testid="planned-credits-display"]')?.textContent).toBe(
            String(expectedTotalPlanned)
        );

        // Reset planner -> immediately reverts to non-eligible
        act(() => {
            usePlannerStore.getState().resetPlanner();
        });
        expect(counter?.className).not.toContain('bg-emerald-950/40');
        expect(container.querySelector('[data-testid="planned-credits-display"]')?.textContent).toBe('120');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('renders children action slots (e.g. export plan button)', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <TopNav>
                    <button type="button" data-testid="custom-action-button">
                        Export Plan
                    </button>
                </TopNav>
            );
        });

        const button = container.querySelector('[data-testid="custom-action-button"]');
        expect(button).not.toBeNull();
        expect(button?.textContent).toBe('Export Plan');

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
