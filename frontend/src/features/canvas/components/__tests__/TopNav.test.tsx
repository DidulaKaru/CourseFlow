import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { usePlannerStore } from '@/core/store';
import { mockComputerEngineeringProgram, mockCourses } from '@/data/mockCourses';
import { TopNav } from '../TopNav';

// Configure act environment for React 19 testing in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('TopNav Component (CF-115)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        usePlannerStore.setState({
            activeProgramId: 'computer-eng',
            selectedElectiveIds: [],
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

    it('dynamically updates credit count when electives are toggled', () => {
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
        expect(counter?.textContent).toContain('120');

        // Toggle an elective (3 credits)
        act(() => {
            usePlannerStore.getState().toggleElective('IS3322');
        });

        // Counter must immediately reflect the increase!
        expect(counter?.textContent).toContain('123');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('reflects eligibility when planned credits meet or exceed required credits', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        // Select all electives so planned credits reach 150
        const allElectiveIds = mockCourses
            .filter((c) => c.type === 'ELECTIVE')
            .map((c) => c.id);

        usePlannerStore.setState({ selectedElectiveIds: allElectiveIds });

        act(() => {
            root.render(
                <TopNav
                    courses={mockCourses}
                    totalCreditsRequired={150}
                />
            );
        });

        const counter = container.querySelector('[data-testid="graduation-credit-counter"]');
        expect(counter?.className).toContain('bg-emerald-950/40');
        expect(counter?.textContent).toContain('150');

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

    it('applies responsive single-row layout at xl breakpoint and flexible brand container', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<TopNav />);
        });

        // Left brand container has min-w-0 flex-1
        const brandContainer = container.querySelector('.h-14 > div:first-child') as HTMLDivElement;
        expect(brandContainer).not.toBeNull();
        expect(brandContainer.className).toContain('min-w-0');
        expect(brandContainer.className).toContain('flex-1');

        // Desktop graduation counter container uses xl:flex instead of 2xl:flex
        const desktopCounterParent = container.querySelector('[data-testid="graduation-credit-counter"]')?.parentElement;
        expect(desktopCounterParent).not.toBeNull();
        expect(desktopCounterParent?.className).toContain('hidden');
        expect(desktopCounterParent?.className).toContain('xl:flex');

        // Sub-horizon container uses xl:hidden instead of 2xl:hidden
        const subHorizon = container.querySelector('[data-testid="graduation-credit-counter-mobile"]')?.parentElement;
        expect(subHorizon).not.toBeNull();
        expect(subHorizon?.className).toContain('xl:hidden');

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
