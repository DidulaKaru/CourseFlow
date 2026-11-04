import { beforeEach, describe, expect, it } from 'vitest';
import type { Course } from '@/types/curriculum';
import {
    calculateSemesterCredits,
    calculateTotalPlannedCredits,
    usePlannerStore,
} from '../store';

// Helper to create test courses
function createCourse(
    id: string,
    recommendedSemester: number,
    options: Partial<Course> = {}
): Course {
    const credits = options.totalCredits ?? 3;
    return {
        id,
        code: id,
        title: `Course ${id}`,
        description: `Description for ${id}`,
        totalCredits: credits,
        durationSemesters: 1,
        recommendedSemester,
        creditDistribution: [{ semesterIndex: recommendedSemester, creditsAllocated: credits }],
        type: 'CORE',
        prerequisiteRule: null,
        corequisites: [],
        offeredSemesters: ['FALL'],
        ...options,
    };
}

describe('Local-First Zustand Store (CF-104)', () => {
    beforeEach(() => {
        localStorage.clear();
        usePlannerStore.getState().resetPlanner();
        usePlannerStore.getState().setActiveProgram('computer-eng');
    });

    describe('Default Guest Mode State', () => {
        it('initializes with default zero-login guest-mode values', () => {
            const state = usePlannerStore.getState();
            expect(state.activeProgramId).toBe('computer-eng');
            expect(state.selectedElectiveIds).toEqual([]);
            expect(state.completedCourseIds).toEqual([]);
            expect(state.isDrawerOpen).toBe(false);
            expect(state.inspectedCourse).toBeNull();
        });
    });

    describe('Program Selection & Reset', () => {
        it('updates active degree program', () => {
            usePlannerStore.getState().setActiveProgram('electrical-eng');
            expect(usePlannerStore.getState().activeProgramId).toBe('electrical-eng');
        });

        it('resets selections while preserving active degree program', () => {
            const store = usePlannerStore.getState();
            store.setActiveProgram('electrical-eng');
            store.toggleElective('EE301');
            store.toggleCompletedCourse('EE101');

            usePlannerStore.getState().resetPlanner();
            const state = usePlannerStore.getState();
            expect(state.activeProgramId).toBe('electrical-eng');
            expect(state.selectedElectiveIds).toEqual([]);
            expect(state.completedCourseIds).toEqual([]);
            expect(state.isDrawerOpen).toBe(false);
            expect(state.inspectedCourse).toBeNull();
        });
    });

    describe('Elective & Completed Course Toggles', () => {
        it('toggles elective selections idempotently', () => {
            const store = usePlannerStore.getState();
            expect(store.isElectiveSelected('CO544')).toBe(false);

            store.toggleElective('CO544');
            expect(usePlannerStore.getState().selectedElectiveIds).toContain('CO544');
            expect(usePlannerStore.getState().isElectiveSelected('CO544')).toBe(true);

            usePlannerStore.getState().toggleElective('CO544');
            expect(usePlannerStore.getState().selectedElectiveIds).not.toContain('CO544');
            expect(usePlannerStore.getState().isElectiveSelected('CO544')).toBe(false);
        });

        it('supports bulk setting of electives with deduplication', () => {
            usePlannerStore.getState().setSelectedElectives(['CO544', 'CO545', 'CO544']);
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO544', 'CO545']);
        });

        it('toggles completed course status idempotently', () => {
            const store = usePlannerStore.getState();
            expect(store.isCourseCompleted('CO221')).toBe(false);

            store.toggleCompletedCourse('CO221');
            expect(usePlannerStore.getState().completedCourseIds).toContain('CO221');
            expect(usePlannerStore.getState().isCourseCompleted('CO221')).toBe(true);

            usePlannerStore.getState().toggleCompletedCourse('CO221');
            expect(usePlannerStore.getState().completedCourseIds).not.toContain('CO221');
            expect(usePlannerStore.getState().isCourseCompleted('CO221')).toBe(false);
        });

        it('supports bulk setting of completed courses with deduplication', () => {
            usePlannerStore.getState().setCompletedCourses(['CO101', 'CO102', 'CO101']);
            expect(usePlannerStore.getState().completedCourseIds).toEqual(['CO101', 'CO102']);
        });
    });

    describe('Slide-Over Drawer State', () => {
        it('opens and closes course details drawer with inspected course', () => {
            const course = createCourse('CO544', 7, { title: 'Machine Learning' });

            usePlannerStore.getState().openCourseDrawer(course);
            let state = usePlannerStore.getState();
            expect(state.isDrawerOpen).toBe(true);
            expect(state.inspectedCourse).toEqual(course);

            usePlannerStore.getState().closeCourseDrawer();
            state = usePlannerStore.getState();
            expect(state.isDrawerOpen).toBe(false);
            expect(state.inspectedCourse).toBeNull();
        });
    });

    describe('LocalStorage Persistence (Zero-Login Client State)', () => {
        it('persists activeProgramId, selectedElectiveIds, and completedCourseIds to localStorage', () => {
            const store = usePlannerStore.getState();
            store.setActiveProgram('electrical-eng');
            store.toggleElective('EE501');
            store.toggleCompletedCourse('EE101');

            // Inspect localStorage partition
            const rawStorage = localStorage.getItem('courseflow-local-planner');
            expect(rawStorage).toBeDefined();
            expect(rawStorage).not.toBeNull();

            const parsed = JSON.parse(rawStorage!);
            expect(parsed.state.activeProgramId).toBe('electrical-eng');
            expect(parsed.state.selectedElectiveIds).toContain('EE501');
            expect(parsed.state.completedCourseIds).toContain('EE101');

            // Drawer transient UI state must NOT be in localStorage
            expect(parsed.state.isDrawerOpen).toBeUndefined();
            expect(parsed.state.inspectedCourse).toBeUndefined();
        });
    });

    describe('Credit Summation & Multi-Semester Capstone Splits', () => {
        const sampleCourses: Course[] = [
            createCourse('CORE1', 1, { totalCredits: 3 }),
            createCourse('CORE2', 1, { totalCredits: 4 }),
            createCourse('ELEC1', 1, { totalCredits: 3, type: 'ELECTIVE' }),
            createCourse('CORE_S2', 2, { totalCredits: 3 }),
            // Multi-semester 6-credit capstone spanning Semesters 7 & 8
            createCourse('CAPSTONE', 7, {
                totalCredits: 6,
                durationSemesters: 2,
                type: 'CAPSTONE',
                creditDistribution: [
                    { semesterIndex: 7, creditsAllocated: 3 },
                    { semesterIndex: 8, creditsAllocated: 3 },
                ],
            }),
        ];

        it('sums mandatory core courses and ignores unselected electives', () => {
            // S1 without elective: CORE1 (3) + CORE2 (4) = 7
            expect(calculateSemesterCredits(1, sampleCourses, [])).toBe(7);
            expect(usePlannerStore.getState().getSemesterCredits(1, sampleCourses)).toBe(7);
        });

        it('includes elective credits when student selects them', () => {
            usePlannerStore.getState().toggleElective('ELEC1');
            // S1 with ELEC1 selected: CORE1 (3) + CORE2 (4) + ELEC1 (3) = 10
            expect(calculateSemesterCredits(1, sampleCourses, ['ELEC1'])).toBe(10);
            expect(usePlannerStore.getState().getSemesterCredits(1, sampleCourses)).toBe(10);
        });

        it('correctly allocates split credits for multi-semester capstone modules', () => {
            // Capstone allocates 3 credits to S7 and 3 credits to S8
            expect(calculateSemesterCredits(7, sampleCourses, [])).toBe(3);
            expect(calculateSemesterCredits(8, sampleCourses, [])).toBe(3);
        });

        it('calculates total planned credits across degree catalog', () => {
            // Without ELEC1: CORE1 (3) + CORE2 (4) + CORE_S2 (3) + CAPSTONE (6) = 16
            expect(calculateTotalPlannedCredits(sampleCourses, [])).toBe(16);

            // With ELEC1: 16 + 3 = 19
            expect(calculateTotalPlannedCredits(sampleCourses, ['ELEC1'])).toBe(19);
        });

        it('evaluates graduation progress against 150-credit requirement', () => {
            const store = usePlannerStore.getState();
            store.toggleCompletedCourse('CORE1');
            store.toggleElective('ELEC1');

            const progress = store.getGraduationProgress(sampleCourses, 150);
            expect(progress.earnedCredits).toBe(3); // CORE1
            expect(progress.plannedCredits).toBe(19);
            expect(progress.requiredCredits).toBe(150);
            expect(progress.isEligible).toBe(false);
        });
    });

    describe('Study Plan JSON Portability (ADR-001)', () => {
        it('exports plan with schema version and timestamps', () => {
            const store = usePlannerStore.getState();
            store.setActiveProgram('computer-eng');
            store.toggleElective('CO544');
            store.toggleCompletedCourse('CO221');

            const exportedJson = store.exportPlan();
            const data = JSON.parse(exportedJson);

            expect(data.version).toBe('1.0');
            expect(data.activeProgramId).toBe('computer-eng');
            expect(data.selectedElectiveIds).toEqual(['CO544']);
            expect(data.completedCourseIds).toEqual(['CO221']);
            expect(data.exportedAt).toBeDefined();
        });

        it('imports study plan and rehydrates state correctly', () => {
            const validPlan = JSON.stringify({
                version: '1.0',
                activeProgramId: 'electrical-eng',
                selectedElectiveIds: ['EE401', 'EE402'],
                completedCourseIds: ['EE101', 'EE102'],
                exportedAt: new Date().toISOString(),
            });

            const success = usePlannerStore.getState().importPlan(validPlan);
            expect(success).toBe(true);

            const state = usePlannerStore.getState();
            expect(state.activeProgramId).toBe('electrical-eng');
            expect(state.selectedElectiveIds).toEqual(['EE401', 'EE402']);
            expect(state.completedCourseIds).toEqual(['EE101', 'EE102']);
        });

        it('rejects invalid or corrupted JSON inputs without mutating state', () => {
            const store = usePlannerStore.getState();
            store.setActiveProgram('computer-eng');
            store.setSelectedElectives(['CO501']);

            // Invalid JSON
            expect(store.importPlan('not-json')).toBe(false);
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO501']);

            // Array instead of object
            expect(store.importPlan('[1, 2, 3]')).toBe(false);

            // Null or primitive
            expect(store.importPlan('null')).toBe(false);
            expect(store.importPlan('123')).toBe(false);
        });
    });
});
