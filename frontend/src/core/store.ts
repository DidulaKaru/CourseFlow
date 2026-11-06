import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Course, CourseType } from '@/types/curriculum';

// ==========================================
// 1. Types & State Interfaces
// ==========================================

export interface StudyPlan {
    id: string;
    name: string;
    programId: string;
    selectedElectiveIds: string[];
    createdAt: string;
    updatedAt: string;
}

export interface StudyPlanExport {
    version: string;
    activeProgramId: string;
    activePlanId?: string;
    plans?: Record<string, StudyPlan[]>;
    selectedElectiveIds: string[];
    exportedAt: string;
}

export interface GraduationProgress {
    plannedCredits: number;
    coreCredits: number;
    electiveCredits: number;
    requiredCredits: number;
    isEligible: boolean;
    percentage: number;
}

export type FilterCourseType = 'ALL' | CourseType;

export interface PlannerState {
    // Active Degree Program & Multi-Plan Management
    activeProgramId: string;
    setActiveProgram: (programId: string) => void;

    activePlanId: string;
    activePlanIdPerProgram: Record<string, string>;
    plans: Record<string, StudyPlan[]>;
    getActivePlan: () => StudyPlan | undefined;

    // Multi-Plan Actions
    createPlan: (name?: string) => StudyPlan;
    duplicatePlan: (planId: string, newName?: string) => StudyPlan | undefined;
    renamePlan: (planId: string, newName: string) => void;
    deletePlan: (planId: string) => void;
    setActivePlan: (planId: string) => void;

    // Active Plan Elective Selections
    selectedElectiveIds: string[];
    toggleElective: (courseId: string) => void;
    setSelectedElectives: (courseIds: string[]) => void;
    isElectiveSelected: (courseId: string) => boolean;

    // Mobile View Mode & Filter State
    mobileViewMode: 'list' | 'canvas';
    setMobileViewMode: (mode: 'list' | 'canvas') => void;

    searchQuery: string;
    setSearchQuery: (query: string) => void;
    filterType: FilterCourseType;
    setFilterType: (filter: FilterCourseType) => void;

    // Slide-over Drawer UI State (Transient, not persisted)
    inspectedCourse: Course | null;
    isDrawerOpen: boolean;
    openCourseDrawer: (course: Course) => void;
    closeCourseDrawer: () => void;

    // Plan Calculations (Credit Counters & Boundaries)
    getSemesterCredits: (semesterIndex: number, courses: Course[]) => number;
    getTotalPlannedCredits: (courses: Course[]) => number;
    getGraduationProgress: (courses: Course[], totalRequired?: number) => GraduationProgress;

    // Reset & Portability Actions (ADR-001)
    resetPlanner: () => void;
    exportPlan: () => string;
    importPlan: (planJson: string) => boolean;
}

// ==========================================
// 2. Pure Calculation Helpers
// ==========================================

export function createDefaultPlan(programId: string, name = 'Default Plan'): StudyPlan {
    const timestamp = new Date().toISOString();
    return {
        id: `plan-${programId}-default`,
        name,
        programId,
        selectedElectiveIds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

/**
 * Calculates credit allocation for a specific semester window, accounting for:
 * 1. Mandatory modules (CORE, LAB, CAPSTONE)
 * 2. Selected elective modules only
 * 3. Multi-semester credit distribution arrays (e.g. capstone 3+3 credits)
 */
export function calculateSemesterCredits(
    semesterIndex: number,
    courses: readonly Course[],
    selectedElectiveIds: readonly string[]
): number {
    const selectedElectivesSet = new Set(selectedElectiveIds);
    let semesterCredits = 0;

    for (const course of courses) {
        // Electives only count if selected by the student
        if (course.type === 'ELECTIVE' && !selectedElectivesSet.has(course.id)) {
            continue;
        }

        // Multi-semester distributed credits
        if (Array.isArray(course.creditDistribution) && course.creditDistribution.length > 0) {
            const termAllocation = course.creditDistribution.find(
                (dist) => dist.semesterIndex === semesterIndex
            );
            if (termAllocation) {
                semesterCredits += termAllocation.creditsAllocated;
            }
        } else if (course.recommendedSemester === semesterIndex) {
            // Standard single-semester module
            semesterCredits += course.totalCredits;
        }
    }

    return semesterCredits;
}

/**
 * Calculates the total planned credit sum across all 8 semesters.
 */
export function calculateTotalPlannedCredits(
    courses: readonly Course[],
    selectedElectiveIds: readonly string[]
): number {
    const selectedElectivesSet = new Set(selectedElectiveIds);
    let totalCredits = 0;

    for (const course of courses) {
        if (course.type === 'ELECTIVE') {
            if (selectedElectivesSet.has(course.id)) {
                totalCredits += course.totalCredits;
            }
        } else {
            // Mandatory CORE, LAB, CAPSTONE
            totalCredits += course.totalCredits;
        }
    }

    return totalCredits;
}

/**
 * Calculates granular graduation progress: planned credits, core credits,
 * elective credits, graduation threshold eligibility, and progress percentage.
 */
export function calculateGraduationProgress(
    courses: readonly Course[],
    selectedElectiveIds: readonly string[],
    totalRequired = 150
): GraduationProgress {
    const selectedElectivesSet = new Set(selectedElectiveIds);
    let coreCredits = 0;
    let electiveCredits = 0;

    for (const course of courses) {
        if (course.type === 'ELECTIVE') {
            if (selectedElectivesSet.has(course.id)) {
                electiveCredits += course.totalCredits;
            }
        } else {
            // Mandatory CORE, LAB, CAPSTONE
            coreCredits += course.totalCredits;
        }
    }

    const plannedCredits = coreCredits + electiveCredits;
    const isEligible = plannedCredits >= totalRequired;
    const percentage =
        totalRequired > 0
            ? Math.min(100, Math.max(0, Math.round((plannedCredits / totalRequired) * 100)))
            : 0;

    return {
        plannedCredits,
        coreCredits,
        electiveCredits,
        requiredCredits: totalRequired,
        isEligible,
        percentage,
    };
}

// ==========================================
// 3. Zustand Store Implementation
// ==========================================

const INITIAL_PROGRAM_ID = 'computer-eng';
const initialDefaultPlan = createDefaultPlan(INITIAL_PROGRAM_ID);

export const usePlannerStore = create<PlannerState>()(
    persist(
        (set, get) => ({
            // Active Degree View & Program Plans
            activeProgramId: INITIAL_PROGRAM_ID,
            activePlanId: initialDefaultPlan.id,
            activePlanIdPerProgram: {
                [INITIAL_PROGRAM_ID]: initialDefaultPlan.id,
            },
            plans: {
                [INITIAL_PROGRAM_ID]: [initialDefaultPlan],
            },

            getActivePlan: () => {
                const state = get();
                const currentPlans = state.plans[state.activeProgramId] || [];
                return currentPlans.find((p) => p.id === state.activePlanId) ?? currentPlans[0];
            },

            setActiveProgram: (programId) =>
                set((state) => {
                    if (state.activeProgramId === programId && state.plans[programId]?.length) {
                        return {};
                    }

                    const existingPlans = state.plans[programId];
                    let updatedPlans = state.plans;
                    let targetPlan: StudyPlan;

                    if (existingPlans && existingPlans.length > 0) {
                        const rememberedId = state.activePlanIdPerProgram?.[programId];
                        targetPlan = existingPlans.find((p) => p.id === rememberedId) ?? existingPlans[0];
                    } else {
                        targetPlan = createDefaultPlan(programId);
                        updatedPlans = {
                            ...state.plans,
                            [programId]: [targetPlan],
                        };
                    }

                    return {
                        activeProgramId: programId,
                        plans: updatedPlans,
                        activePlanId: targetPlan.id,
                        activePlanIdPerProgram: {
                            ...state.activePlanIdPerProgram,
                            [state.activeProgramId]: state.activePlanId,
                            [programId]: targetPlan.id,
                        },
                        selectedElectiveIds: targetPlan.selectedElectiveIds,
                        inspectedCourse: null,
                        isDrawerOpen: false,
                    };
                }),

            // Multi-Plan Actions
            createPlan: (name) => {
                let created: StudyPlan | null = null;
                set((state) => {
                    const programId = state.activeProgramId;
                    const currentPlans = state.plans[programId] || [];
                    const planName = name?.trim() || `Plan ${currentPlans.length + 1}`;
                    const timestamp = new Date().toISOString();
                    const newPlan: StudyPlan = {
                        id: `plan-${programId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                        name: planName,
                        programId,
                        selectedElectiveIds: [],
                        createdAt: timestamp,
                        updatedAt: timestamp,
                    };
                    created = newPlan;
                    return {
                        plans: {
                            ...state.plans,
                            [programId]: [...currentPlans, newPlan],
                        },
                        activePlanId: newPlan.id,
                        activePlanIdPerProgram: {
                            ...state.activePlanIdPerProgram,
                            [programId]: newPlan.id,
                        },
                        selectedElectiveIds: [],
                    };
                });
                return created!;
            },

            duplicatePlan: (planId, newName) => {
                let duplicated: StudyPlan | null = null;
                set((state) => {
                    const programId = state.activeProgramId;
                    const currentPlans = state.plans[programId] || [];
                    const sourcePlan = currentPlans.find((p) => p.id === planId);
                    if (!sourcePlan) return {};

                    const planName = newName?.trim() || `${sourcePlan.name} (Copy)`;
                    const timestamp = new Date().toISOString();
                    const newPlan: StudyPlan = {
                        id: `plan-${programId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                        name: planName,
                        programId,
                        selectedElectiveIds: [...sourcePlan.selectedElectiveIds],
                        createdAt: timestamp,
                        updatedAt: timestamp,
                    };
                    duplicated = newPlan;
                    return {
                        plans: {
                            ...state.plans,
                            [programId]: [...currentPlans, newPlan],
                        },
                        activePlanId: newPlan.id,
                        activePlanIdPerProgram: {
                            ...state.activePlanIdPerProgram,
                            [programId]: newPlan.id,
                        },
                        selectedElectiveIds: newPlan.selectedElectiveIds,
                    };
                });
                return duplicated ?? undefined;
            },

            renamePlan: (planId, newName) =>
                set((state) => {
                    const trimmed = newName.trim();
                    if (!trimmed) return {};
                    const programId = state.activeProgramId;
                    const currentPlans = state.plans[programId] || [];
                    const updatedPlans = currentPlans.map((p) =>
                        p.id === planId
                            ? { ...p, name: trimmed, updatedAt: new Date().toISOString() }
                            : p
                    );
                    return {
                        plans: {
                            ...state.plans,
                            [programId]: updatedPlans,
                        },
                    };
                }),

            deletePlan: (planId) =>
                set((state) => {
                    const programId = state.activeProgramId;
                    const currentPlans = state.plans[programId] || [];
                    let remaining = currentPlans.filter((p) => p.id !== planId);

                    let activePlanId = state.activePlanId;
                    let selectedElectiveIds = state.selectedElectiveIds;

                    if (remaining.length === 0) {
                        const fallbackPlan = createDefaultPlan(programId);
                        remaining = [fallbackPlan];
                        activePlanId = fallbackPlan.id;
                        selectedElectiveIds = fallbackPlan.selectedElectiveIds;
                    } else if (state.activePlanId === planId) {
                        activePlanId = remaining[0].id;
                        selectedElectiveIds = remaining[0].selectedElectiveIds;
                    }

                    return {
                        plans: {
                            ...state.plans,
                            [programId]: remaining,
                        },
                        activePlanId,
                        activePlanIdPerProgram: {
                            ...state.activePlanIdPerProgram,
                            [programId]: activePlanId,
                        },
                        selectedElectiveIds,
                    };
                }),

            setActivePlan: (planId) =>
                set((state) => {
                    const programId = state.activeProgramId;
                    const currentPlans = state.plans[programId] || [];
                    const targetPlan = currentPlans.find((p) => p.id === planId);
                    if (!targetPlan) return {};

                    return {
                        activePlanId: planId,
                        activePlanIdPerProgram: {
                            ...state.activePlanIdPerProgram,
                            [programId]: planId,
                        },
                        selectedElectiveIds: targetPlan.selectedElectiveIds,
                    };
                }),

            // Active Plan Elective Selections
            selectedElectiveIds: [],

            toggleElective: (courseId) =>
                set((state) => {
                    const programId = state.activeProgramId;
                    const currentPlans = state.plans[programId] || [];
                    const activePlanIndex = currentPlans.findIndex((p) => p.id === state.activePlanId);

                    const currentElectives = state.selectedElectiveIds;
                    const nextElectives = currentElectives.includes(courseId)
                        ? currentElectives.filter((id) => id !== courseId)
                        : [...currentElectives, courseId];

                    let updatedPlans = currentPlans;
                    if (activePlanIndex !== -1) {
                        const activePlan = currentPlans[activePlanIndex];
                        const updatedActivePlan: StudyPlan = {
                            ...activePlan,
                            selectedElectiveIds: nextElectives,
                            updatedAt: new Date().toISOString(),
                        };
                        updatedPlans = [
                            ...currentPlans.slice(0, activePlanIndex),
                            updatedActivePlan,
                            ...currentPlans.slice(activePlanIndex + 1),
                        ];
                    }

                    return {
                        selectedElectiveIds: nextElectives,
                        plans: {
                            ...state.plans,
                            [programId]: updatedPlans,
                        },
                    };
                }),

            setSelectedElectives: (courseIds) =>
                set((state) => {
                    const programId = state.activeProgramId;
                    const currentPlans = state.plans[programId] || [];
                    const activePlanIndex = currentPlans.findIndex((p) => p.id === state.activePlanId);
                    const nextElectives = Array.from(new Set(courseIds));

                    let updatedPlans = currentPlans;
                    if (activePlanIndex !== -1) {
                        const activePlan = currentPlans[activePlanIndex];
                        const updatedActivePlan: StudyPlan = {
                            ...activePlan,
                            selectedElectiveIds: nextElectives,
                            updatedAt: new Date().toISOString(),
                        };
                        updatedPlans = [
                            ...currentPlans.slice(0, activePlanIndex),
                            updatedActivePlan,
                            ...currentPlans.slice(activePlanIndex + 1),
                        ];
                    }

                    return {
                        selectedElectiveIds: nextElectives,
                        plans: {
                            ...state.plans,
                            [programId]: updatedPlans,
                        },
                    };
                }),

            isElectiveSelected: (courseId) => get().selectedElectiveIds.includes(courseId),

            // Mobile View Mode & Filter State
            mobileViewMode: 'canvas',
            setMobileViewMode: (mode) => set({ mobileViewMode: mode }),

            searchQuery: '',
            setSearchQuery: (query) => set({ searchQuery: query }),

            filterType: 'ALL',
            setFilterType: (filter) => set({ filterType: filter }),

            // Transient Slide-over Drawer State
            inspectedCourse: null,
            isDrawerOpen: false,

            openCourseDrawer: (course) => set({ inspectedCourse: course, isDrawerOpen: true }),

            closeCourseDrawer: () => set({ inspectedCourse: null, isDrawerOpen: false }),

            // Credit Summation Selectors
            getSemesterCredits: (semesterIndex, courses) =>
                calculateSemesterCredits(semesterIndex, courses, get().selectedElectiveIds),

            getTotalPlannedCredits: (courses) =>
                calculateTotalPlannedCredits(courses, get().selectedElectiveIds),

            getGraduationProgress: (courses, totalRequired = 150) =>
                calculateGraduationProgress(courses, get().selectedElectiveIds, totalRequired),

            // Reset & Portability Actions (ADR-001)
            resetPlanner: () =>
                set(() => {
                    const defaultPlan = createDefaultPlan(INITIAL_PROGRAM_ID);
                    return {
                        activeProgramId: INITIAL_PROGRAM_ID,
                        activePlanId: defaultPlan.id,
                        activePlanIdPerProgram: {
                            [INITIAL_PROGRAM_ID]: defaultPlan.id,
                        },
                        plans: {
                            [INITIAL_PROGRAM_ID]: [defaultPlan],
                        },
                        selectedElectiveIds: [],
                        inspectedCourse: null,
                        isDrawerOpen: false,
                        mobileViewMode: 'canvas',
                        searchQuery: '',
                        filterType: 'ALL',
                    };
                }),

            exportPlan: () => {
                const state = get();
                const exportData: StudyPlanExport = {
                    version: '2.0',
                    activeProgramId: state.activeProgramId,
                    activePlanId: state.activePlanId,
                    plans: state.plans,
                    selectedElectiveIds: state.selectedElectiveIds,
                    exportedAt: new Date().toISOString(),
                };
                return JSON.stringify(exportData, null, 2);
            },

            importPlan: (planJson: string) => {
                try {
                    const data = JSON.parse(planJson);
                    if (data && typeof data === 'object' && !Array.isArray(data)) {
                        const activeProgramId =
                            typeof data.activeProgramId === 'string' && data.activeProgramId.trim()
                                ? data.activeProgramId.trim()
                                : INITIAL_PROGRAM_ID;

                        const selectedElectiveIds = Array.isArray(data.selectedElectiveIds)
                            ? data.selectedElectiveIds.filter(
                                  (id: unknown): id is string => typeof id === 'string'
                              )
                            : [];

                        let plans: Record<string, StudyPlan[]> = {};
                        let activePlanId = '';

                        if (
                            data.plans &&
                            typeof data.plans === 'object' &&
                            !Array.isArray(data.plans)
                        ) {
                            plans = data.plans as Record<string, StudyPlan[]>;
                            activePlanId =
                                typeof data.activePlanId === 'string' && data.activePlanId
                                    ? data.activePlanId
                                    : (plans[activeProgramId]?.[0]?.id ?? '');
                        }

                        if (!plans[activeProgramId] || plans[activeProgramId].length === 0) {
                            const importedPlan = createDefaultPlan(
                                activeProgramId,
                                'Imported Study Plan'
                            );
                            importedPlan.selectedElectiveIds = Array.from(new Set(selectedElectiveIds));
                            plans[activeProgramId] = [importedPlan];
                            activePlanId = importedPlan.id;
                        }

                        const targetPlan =
                            plans[activeProgramId]?.find((p) => p.id === activePlanId) ??
                            plans[activeProgramId][0];

                        set((prev) => ({
                            activeProgramId,
                            plans,
                            activePlanId: targetPlan.id,
                            activePlanIdPerProgram: {
                                ...prev.activePlanIdPerProgram,
                                [activeProgramId]: targetPlan.id,
                            },
                            selectedElectiveIds: targetPlan.selectedElectiveIds,
                            inspectedCourse: null,
                            isDrawerOpen: false,
                        }));
                        return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            },
        }),
        {
            name: 'courseflow-local-planner',
            storage: createJSONStorage(() => localStorage),
            version: 2,
            migrate: (persistedState: unknown) => {
                if (!persistedState || typeof persistedState !== 'object') {
                    return persistedState;
                }

                const state = persistedState as Record<string, unknown>;
                const activeProgramId =
                    typeof state.activeProgramId === 'string' && state.activeProgramId.trim()
                        ? state.activeProgramId.trim()
                        : INITIAL_PROGRAM_ID;

                const legacyElectives = Array.isArray(state.selectedElectiveIds)
                    ? state.selectedElectiveIds.filter((id): id is string => typeof id === 'string')
                    : [];

                let plans = state.plans as Record<string, StudyPlan[]> | undefined;
                let activePlanId = typeof state.activePlanId === 'string' ? state.activePlanId : '';

                if (!plans || typeof plans !== 'object' || Array.isArray(plans)) {
                    const defaultPlan = createDefaultPlan(activeProgramId);
                    defaultPlan.selectedElectiveIds = legacyElectives;
                    plans = {
                        [activeProgramId]: [defaultPlan],
                    };
                    activePlanId = defaultPlan.id;
                } else if (!plans[activeProgramId] || plans[activeProgramId].length === 0) {
                    const defaultPlan = createDefaultPlan(activeProgramId);
                    defaultPlan.selectedElectiveIds = legacyElectives;
                    plans[activeProgramId] = [defaultPlan];
                    activePlanId = defaultPlan.id;
                }

                const activePlan =
                    plans[activeProgramId]?.find((p) => p.id === activePlanId) ??
                    plans[activeProgramId][0];

                // Safely discard obsolete completedCourseIds if present from legacy storage
                delete state.completedCourseIds;

                return {
                    ...state,
                    activeProgramId,
                    plans,
                    activePlanId: activePlan.id,
                    activePlanIdPerProgram: {
                        [activeProgramId]: activePlan.id,
                    },
                    selectedElectiveIds: activePlan.selectedElectiveIds,
                    mobileViewMode: state.mobileViewMode === 'list' ? 'list' : 'canvas',
                    searchQuery: typeof state.searchQuery === 'string' ? state.searchQuery : '',
                    filterType: ['ALL', 'CORE', 'ELECTIVE', 'LAB', 'CAPSTONE'].includes(
                        state.filterType as string
                    )
                        ? (state.filterType as FilterCourseType)
                        : 'ALL',
                };
            },
            partialize: (state) => ({
                activeProgramId: state.activeProgramId,
                activePlanId: state.activePlanId,
                plans: state.plans,
                selectedElectiveIds: state.selectedElectiveIds,
                mobileViewMode: state.mobileViewMode,
                filterType: state.filterType,
            }),
        }
    )
);
