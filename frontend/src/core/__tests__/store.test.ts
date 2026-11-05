import { beforeEach, describe, expect, it } from 'vitest';
import type { Course } from '@/types/curriculum';
import {
    calculateGraduationProgress,
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

describe('Local-First Multi-Plan Zustand Store (Step 1 & Step 2)', () => {
    beforeEach(() => {
        localStorage.clear();
        usePlannerStore.getState().resetPlanner();
    });

    describe('Default Guest Mode & Plan Initialization', () => {
        it('initializes with default zero-login guest-mode values and default study plan', () => {
            const state = usePlannerStore.getState();
            expect(state.activeProgramId).toBe('computer-eng');
            expect(state.activePlanId).toBeDefined();

            const programPlans = state.plans['computer-eng'];
            expect(programPlans).toBeDefined();
            expect(programPlans.length).toBeGreaterThanOrEqual(1);

            const activePlan = state.getActivePlan();
            expect(activePlan).toBeDefined();
            expect(activePlan?.programId).toBe('computer-eng');
            expect(activePlan?.selectedElectiveIds).toEqual([]);

            expect(state.selectedElectiveIds).toEqual([]);
            expect(state.isDrawerOpen).toBe(false);
            expect(state.inspectedCourse).toBeNull();
            expect(state.mobileViewMode).toBe('canvas');
            expect(state.searchQuery).toBe('');
            expect(state.filterType).toBe('ALL');
        });
    });

    describe('Multi-Plan Management Actions', () => {
        it('creates a new study plan and sets it as the active plan', () => {
            const initialPlanId = usePlannerStore.getState().activePlanId;

            const newPlan = usePlannerStore.getState().createPlan('AI Track Specialization');
            expect(newPlan.id).toBeDefined();
            expect(newPlan.name).toBe('AI Track Specialization');
            expect(newPlan.programId).toBe('computer-eng');
            expect(newPlan.selectedElectiveIds).toEqual([]);

            const state = usePlannerStore.getState();
            expect(state.activePlanId).toBe(newPlan.id);
            expect(state.activePlanId).not.toBe(initialPlanId);
            expect(state.plans['computer-eng']).toHaveLength(2);
            expect(state.selectedElectiveIds).toEqual([]);
        });

        it('duplicates an existing plan with all selected electives preserved', () => {
            // Select electives on the base plan
            usePlannerStore.getState().toggleElective('CO544');
            usePlannerStore.getState().toggleElective('CO542');
            const basePlanId = usePlannerStore.getState().activePlanId;

            const duplicatedPlan = usePlannerStore.getState().duplicatePlan(basePlanId, 'AI Track (Draft B)');
            expect(duplicatedPlan).toBeDefined();
            expect(duplicatedPlan?.id).not.toBe(basePlanId);
            expect(duplicatedPlan?.name).toBe('AI Track (Draft B)');
            expect(duplicatedPlan?.selectedElectiveIds).toEqual(['CO544', 'CO542']);

            const state = usePlannerStore.getState();
            expect(state.activePlanId).toBe(duplicatedPlan?.id);
            expect(state.selectedElectiveIds).toEqual(['CO544', 'CO542']);
        });

        it('renames an existing study plan', () => {
            const plan = usePlannerStore.getState().createPlan('Initial Draft');
            usePlannerStore.getState().renamePlan(plan.id, 'Production Semester Plan');

            const state = usePlannerStore.getState();
            const updated = state.plans['computer-eng'].find((p) => p.id === plan.id);
            expect(updated?.name).toBe('Production Semester Plan');
        });

        it('deletes a study plan and switches active plan cleanly', () => {
            const plan1 = usePlannerStore.getState().activePlanId;
            const plan2 = usePlannerStore.getState().createPlan('Secondary Plan');

            expect(usePlannerStore.getState().activePlanId).toBe(plan2.id);

            // Delete plan2: activePlanId should fall back to plan1
            usePlannerStore.getState().deletePlan(plan2.id);
            expect(usePlannerStore.getState().activePlanId).toBe(plan1);
            expect(usePlannerStore.getState().plans['computer-eng'].find((p) => p.id === plan2.id)).toBeUndefined();
        });

        it('creates a fresh fallback plan if the student deletes all plans', () => {
            const state = usePlannerStore.getState();
            const planIds = state.plans['computer-eng'].map((p) => p.id);

            for (const pid of planIds) {
                usePlannerStore.getState().deletePlan(pid);
            }

            const refreshedState = usePlannerStore.getState();
            expect(refreshedState.plans['computer-eng']).toHaveLength(1);
            expect(refreshedState.activePlanId).toBe(refreshedState.plans['computer-eng'][0].id);
            expect(refreshedState.selectedElectiveIds).toEqual([]);
        });

        it('switches active plan via setActivePlan', () => {
            const plan1Id = usePlannerStore.getState().activePlanId;
            usePlannerStore.getState().toggleElective('CO544');

            const plan2 = usePlannerStore.getState().createPlan('Second Plan');
            expect(plan2.id).toBeDefined();
            usePlannerStore.getState().toggleElective('CO501');

            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO501']);

            // Switch back to plan 1
            usePlannerStore.getState().setActivePlan(plan1Id);
            expect(usePlannerStore.getState().activePlanId).toBe(plan1Id);
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO544']);
        });
    });

    describe('Elective Toggling & Plan Isolation', () => {
        it('toggles elective selections idempotently in active plan', () => {
            const store = usePlannerStore.getState();
            expect(store.isElectiveSelected('CO544')).toBe(false);

            store.toggleElective('CO544');
            expect(usePlannerStore.getState().selectedElectiveIds).toContain('CO544');
            expect(usePlannerStore.getState().isElectiveSelected('CO544')).toBe(true);

            usePlannerStore.getState().toggleElective('CO544');
            expect(usePlannerStore.getState().selectedElectiveIds).not.toContain('CO544');
            expect(usePlannerStore.getState().isElectiveSelected('CO544')).toBe(false);
        });

        it('supports bulk setting of electives with deduplication in active plan', () => {
            usePlannerStore.getState().setSelectedElectives(['CO544', 'CO545', 'CO544']);
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO544', 'CO545']);
            expect(usePlannerStore.getState().getActivePlan()?.selectedElectiveIds).toEqual(['CO544', 'CO545']);
        });

        it('maintains elective isolation between multiple plans of the same department', () => {
            const planA = usePlannerStore.getState().createPlan('Plan A: AI Focus');
            usePlannerStore.getState().toggleElective('CO544');

            const planB = usePlannerStore.getState().createPlan('Plan B: Systems Focus');
            usePlannerStore.getState().toggleElective('CO501');

            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO501']);

            usePlannerStore.getState().setActivePlan(planA.id);
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO544']);

            usePlannerStore.getState().setActivePlan(planB.id);
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO501']);
        });
    });

    describe('Department Switching with Plan Isolation (Zero Data Loss)', () => {
        it('preserves study plans and electives across departments without data loss', () => {
            // Configure Computer Engineering with specific electives
            usePlannerStore.getState().setActiveProgram('computer-eng');
            usePlannerStore.getState().toggleElective('CO544');
            usePlannerStore.getState().toggleElective('CO542');
            const ceActivePlanId = usePlannerStore.getState().activePlanId;

            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO544', 'CO542']);

            // Switch to Electrical Engineering
            usePlannerStore.getState().setActiveProgram('electrical-eng');
            expect(usePlannerStore.getState().activeProgramId).toBe('electrical-eng');
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual([]); // Fresh default plan for EE

            // Select EE electives
            usePlannerStore.getState().toggleElective('EE501');
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['EE501']);

            // Switch back to Computer Engineering: CE plans must be completely intact!
            usePlannerStore.getState().setActiveProgram('computer-eng');
            expect(usePlannerStore.getState().activeProgramId).toBe('computer-eng');
            expect(usePlannerStore.getState().activePlanId).toBe(ceActivePlanId);
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO544', 'CO542']);

            // Switch back to Electrical Engineering: EE plans must be completely intact!
            usePlannerStore.getState().setActiveProgram('electrical-eng');
            expect(usePlannerStore.getState().activeProgramId).toBe('electrical-eng');
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['EE501']);
        });
    });

    describe('Mobile View Mode & Search/Filter State', () => {
        it('updates mobile view mode between list and canvas', () => {
            expect(usePlannerStore.getState().mobileViewMode).toBe('canvas');
            usePlannerStore.getState().setMobileViewMode('list');
            expect(usePlannerStore.getState().mobileViewMode).toBe('list');
            usePlannerStore.getState().setMobileViewMode('canvas');
            expect(usePlannerStore.getState().mobileViewMode).toBe('canvas');
        });

        it('updates search query and filter course type', () => {
            usePlannerStore.getState().setSearchQuery('Deep Learning');
            expect(usePlannerStore.getState().searchQuery).toBe('Deep Learning');

            usePlannerStore.getState().setFilterType('ELECTIVE');
            expect(usePlannerStore.getState().filterType).toBe('ELECTIVE');
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

    describe('Credit Summation & Graduation Progress Calculations', () => {
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
            expect(calculateSemesterCredits(7, sampleCourses, [])).toBe(3);
            expect(calculateSemesterCredits(8, sampleCourses, [])).toBe(3);
        });

        it('calculates total planned credits across degree catalog', () => {
            // Without ELEC1: CORE1 (3) + CORE2 (4) + CORE_S2 (3) + CAPSTONE (6) = 16
            expect(calculateTotalPlannedCredits(sampleCourses, [])).toBe(16);

            // With ELEC1: 16 + 3 = 19
            expect(calculateTotalPlannedCredits(sampleCourses, ['ELEC1'])).toBe(19);
        });

        it('evaluates graduation progress with core, elective, percentage, and eligibility details', () => {
            const store = usePlannerStore.getState();
            store.toggleElective('ELEC1');

            const progress = store.getGraduationProgress(sampleCourses, 20);
            // Core credits: CORE1 (3) + CORE2 (4) + CORE_S2 (3) + CAPSTONE (6) = 16
            expect(progress.coreCredits).toBe(16);
            // Elective credits: ELEC1 (3) = 3
            expect(progress.electiveCredits).toBe(3);
            // Total planned: 19
            expect(progress.plannedCredits).toBe(19);
            expect(progress.requiredCredits).toBe(20);
            expect(progress.isEligible).toBe(false);
            // Percentage: Math.round((19 / 20) * 100) = 95%
            expect(progress.percentage).toBe(95);

            // Meets or exceeds required credits
            const compliantProgress = calculateGraduationProgress(sampleCourses, ['ELEC1'], 19);
            expect(compliantProgress.isEligible).toBe(true);
            expect(compliantProgress.percentage).toBe(100);
        });
    });

    describe('LocalStorage Persistence & Migration Cleanliness', () => {
        it('persists activeProgramId, activePlanId, plans, and selectedElectiveIds to localStorage', () => {
            const store = usePlannerStore.getState();
            store.setActiveProgram('electrical-eng');
            store.toggleElective('EE501');

            const rawStorage = localStorage.getItem('courseflow-local-planner');
            expect(rawStorage).toBeDefined();
            expect(rawStorage).not.toBeNull();

            const parsed = JSON.parse(rawStorage!);
            expect(parsed.state.activeProgramId).toBe('electrical-eng');
            expect(parsed.state.activePlanId).toBeDefined();
            expect(parsed.state.plans['electrical-eng']).toBeDefined();
            expect(parsed.state.selectedElectiveIds).toContain('EE501');

            // Drawer transient UI state must NOT be persisted
            expect(parsed.state.isDrawerOpen).toBeUndefined();
            expect(parsed.state.inspectedCourse).toBeUndefined();
        });
    });

    describe('Study Plan JSON Portability (ADR-001)', () => {
        it('exports plan with schema version 2.0 and plan dictionary', () => {
            const store = usePlannerStore.getState();
            store.setActiveProgram('computer-eng');
            store.toggleElective('CO544');

            const exportedJson = store.exportPlan();
            const data = JSON.parse(exportedJson);

            expect(data.version).toBe('2.0');
            expect(data.activeProgramId).toBe('computer-eng');
            expect(data.selectedElectiveIds).toEqual(['CO544']);
            expect(data.plans).toBeDefined();
            expect(data.exportedAt).toBeDefined();
        });

        it('imports study plan and rehydrates state correctly (including legacy format migration)', () => {
            // Import legacy 1.0 JSON format
            const legacyPlan = JSON.stringify({
                version: '1.0',
                activeProgramId: 'electrical-eng',
                selectedElectiveIds: ['EE401', 'EE402'],
                completedCourseIds: ['EE101', 'EE102'],
                exportedAt: new Date().toISOString(),
            });

            const success = usePlannerStore.getState().importPlan(legacyPlan);
            expect(success).toBe(true);

            const state = usePlannerStore.getState();
            expect(state.activeProgramId).toBe('electrical-eng');
            expect(state.selectedElectiveIds).toEqual(['EE401', 'EE402']);
            expect(state.getActivePlan()?.selectedElectiveIds).toEqual(['EE401', 'EE402']);
        });

        it('rejects invalid or corrupted JSON inputs without mutating state', () => {
            const store = usePlannerStore.getState();
            store.setActiveProgram('computer-eng');
            store.setSelectedElectives(['CO501']);

            expect(store.importPlan('not-json')).toBe(false);
            expect(usePlannerStore.getState().selectedElectiveIds).toEqual(['CO501']);

            expect(store.importPlan('[1, 2, 3]')).toBe(false);
            expect(store.importPlan('null')).toBe(false);
            expect(store.importPlan('123')).toBe(false);
        });
    });
});
