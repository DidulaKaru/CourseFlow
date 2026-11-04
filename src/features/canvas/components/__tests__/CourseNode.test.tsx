import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import type { CourseLayoutNode } from '@/core/layout';
import { usePlannerStore } from '@/core/store';
import type { Course } from '@/types/curriculum';
import { CourseNode } from '../CourseNode';

// Configure act environment for React 19 testing in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setupNodeContainer(
    courseData: Partial<Course>,
    nodeDataOverrides: Partial<CourseLayoutNode['data']> = {}
) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const defaultCourse: Course = {
        id: 'CO544',
        code: 'CO544',
        title: 'Machine Learning',
        description: 'Supervised and unsupervised learning paradigms.',
        totalCredits: 3,
        durationSemesters: 1,
        recommendedSemester: 7,
        creditDistribution: [{ semesterIndex: 7, creditsAllocated: 3 }],
        type: 'ELECTIVE',
        prerequisiteRule: null,
        corequisites: [],
        offeredSemesters: ['FALL'],
        ...courseData,
    };

    const nodeData: CourseLayoutNode['data'] = {
        course: defaultCourse,
        isMultiSemester: (defaultCourse.durationSemesters ?? 1) > 1,
        durationSemesters: defaultCourse.durationSemesters,
        spanWidth: 240,
        semesterIndex: defaultCourse.recommendedSemester,
        slotIndex: 0,
        ...nodeDataOverrides,
    };

    act(() => {
        root.render(
            <ReactFlowProvider>
                <CourseNode
                    id={defaultCourse.id}
                    type="courseNode"
                    data={nodeData}
                    selected={false}
                    zIndex={1}
                    isConnectable={true}
                    positionAbsoluteX={0}
                    positionAbsoluteY={0}
                    dragging={false}
                    deletable={false}
                    selectable={true}
                    draggable={false}
                />
            </ReactFlowProvider>
        );
    });

    return {
        container,
        cleanup: () => {
            act(() => {
                root.unmount();
            });
            container.remove();
        },
    };
}

describe('CourseNode Component (CF-112)', () => {
    beforeEach(() => {
        usePlannerStore.getState().resetPlanner();
        document.body.innerHTML = '';
    });

    it('renders course code, title, credits, and type badge', () => {
        const { container, cleanup } = setupNodeContainer({
            code: 'CO1002',
            title: 'Programming Methodology',
            totalCredits: 3,
            type: 'CORE',
        });

        expect(container.textContent).toContain('CO1002');
        expect(container.textContent).toContain('Programming Methodology');
        expect(container.textContent).toContain('3 cr');
        expect(container.textContent).toContain('CORE');

        cleanup();
    });

    it('renders multi-semester spanning banner when durationSemesters > 1', () => {
        const { container, cleanup } = setupNodeContainer({
            code: 'CE4001',
            title: 'Comprehensive Design Project',
            totalCredits: 6,
            durationSemesters: 2,
            type: 'CAPSTONE',
        });

        expect(container.textContent).toContain('2-Sem Spanning');

        cleanup();
    });

    it('renders direct elective toggle button and updates store on click', () => {
        const { container, cleanup } = setupNodeContainer({
            id: 'CO544',
            code: 'CO544',
            type: 'ELECTIVE',
        });

        const toggleBtn = container.querySelector('button[title="Add elective to plan"]') as HTMLButtonElement;
        expect(toggleBtn).toBeDefined();

        act(() => {
            toggleBtn.click();
        });

        expect(usePlannerStore.getState().isElectiveSelected('CO544')).toBe(true);

        cleanup();
    });

    it('renders warning alert badge when prerequisite rules are unmet', () => {
        const { container, cleanup } = setupNodeContainer({
            id: 'MA1002',
            code: 'MA1002',
            type: 'CORE',
            prerequisiteRule: { type: 'COURSE', courseId: 'MA1001' },
        });

        expect(container.textContent).toContain('Warning: Unmet');

        cleanup();
    });

    it('renders completed badge and updates when completed course button is clicked', () => {
        const { container, cleanup } = setupNodeContainer({
            id: 'CO1001',
            code: 'CO1001',
            type: 'CORE',
            prerequisiteRule: null,
        });

        const completeBtn = container.querySelector('button[aria-label="Toggle completion for CO1001"]') as HTMLButtonElement;
        expect(completeBtn).toBeDefined();

        act(() => {
            completeBtn.click();
        });

        expect(usePlannerStore.getState().isCourseCompleted('CO1001')).toBe(true);

        cleanup();
    });

    it('renders target handle on left and source handle on right', () => {
        const { container, cleanup } = setupNodeContainer({
            code: 'CO2001',
            type: 'CORE',
        });

        const targetHandle = container.querySelector('.react-flow__handle-left');
        const sourceHandle = container.querySelector('.react-flow__handle-right');

        expect(targetHandle).toBeDefined();
        expect(sourceHandle).toBeDefined();

        cleanup();
    });
});
