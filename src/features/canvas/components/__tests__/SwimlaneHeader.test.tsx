import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';

import { usePlannerStore } from '@/core/store';
import type { Course } from '@/types/curriculum';
import { SwimlaneHeader, SwimlaneHeaders } from '../SwimlaneHeader';

// Configure act environment for React 19 testing in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SwimlaneHeader Component (CF-113)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders valid status pill and green meter when credits are between 18 and 24', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<SwimlaneHeader semesterIndex={1} credits={19} minCredits={18} maxCredits={24} />);
        });

        expect(container.textContent).toContain('Semester 1');
        expect(container.textContent).toContain('19 cr');
        expect(container.textContent).toContain('Valid Load');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('renders underload warning badge with alert icon when credits < 18', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<SwimlaneHeader semesterIndex={2} credits={15} minCredits={18} maxCredits={24} />);
        });

        expect(container.textContent).toContain('Semester 2');
        expect(container.textContent).toContain('15 / 18 cr');
        expect(container.textContent).toContain('Load < 18 cr');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('renders overload warning badge when credits > 24', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<SwimlaneHeader semesterIndex={3} credits={26} minCredits={18} maxCredits={24} />);
        });

        expect(container.textContent).toContain('Semester 3');
        expect(container.textContent).toContain('26 / 24 cr');
        expect(container.textContent).toContain('Load > 24 cr');

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});

describe('SwimlaneHeaders Integration & Real-Time Elective Updates (CF-113)', () => {
    beforeEach(() => {
        usePlannerStore.getState().resetPlanner();
        document.body.innerHTML = '';
    });

    const testCourses: Course[] = [
        // S1: 15 Core credits (Underload initially)
        {
            id: 'C1_A',
            code: 'C1_A',
            title: 'Course 1A',
            description: '',
            totalCredits: 15,
            durationSemesters: 1,
            recommendedSemester: 1,
            creditDistribution: [{ semesterIndex: 1, creditsAllocated: 15 }],
            type: 'CORE',
            prerequisiteRule: null,
            corequisites: [],
            offeredSemesters: ['FALL'],
        },
        // S1: 3 Elective credits (reaches 18 credits when selected)
        {
            id: 'E1_A',
            code: 'E1_A',
            title: 'Elective 1A',
            description: '',
            totalCredits: 3,
            durationSemesters: 1,
            recommendedSemester: 1,
            creditDistribution: [{ semesterIndex: 1, creditsAllocated: 3 }],
            type: 'ELECTIVE',
            prerequisiteRule: null,
            corequisites: [],
            offeredSemesters: ['FALL'],
        },
        // Multi-semester Capstone: splits 3 credits in S7 and 3 credits in S8
        {
            id: 'CAP_4001',
            code: 'CAP_4001',
            title: 'Capstone Design',
            description: '',
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
        },
    ];

    it('renders all 8 semester headers and updates credit sum in real time on elective toggle', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <ReactFlowProvider>
                    <SwimlaneHeaders courses={testCourses} />
                </ReactFlowProvider>
            );
        });

        // Initially, E1_A is not selected -> S1 credits = 15 (< 18 min)
        const s1Header = container.querySelector('[data-testid="swimlane-header-1"]') as HTMLElement;
        expect(s1Header).toBeDefined();
        expect(s1Header.textContent).toContain('15 / 18 cr');
        expect(s1Header.textContent).toContain('Load < 18 cr');

        // Toggle elective E1_A in store
        act(() => {
            usePlannerStore.getState().toggleElective('E1_A');
        });

        // Re-render to observe real-time reaction
        act(() => {
            root.render(
                <ReactFlowProvider>
                    <SwimlaneHeaders courses={testCourses} />
                </ReactFlowProvider>
            );
        });

        // Now S1 credits = 15 + 3 = 18 cr -> Valid Load!
        expect(s1Header.textContent).toContain('18 cr');
        expect(s1Header.textContent).toContain('Valid Load');

        // S7 and S8 accurately account for multi-semester capstone split credits (3 credits each)
        const s7Header = container.querySelector('[data-testid="swimlane-header-7"]') as HTMLElement;
        const s8Header = container.querySelector('[data-testid="swimlane-header-8"]') as HTMLElement;
        expect(s7Header.textContent).toContain('3 / 18 cr');
        expect(s8Header.textContent).toContain('3 / 18 cr');

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
