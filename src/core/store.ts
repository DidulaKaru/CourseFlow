import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Course } from '@/types/curriculum';

// ==========================================
// 1. Types & State Interfaces
// ==========================================

export interface StudyPlanExport {
    version: string;
    activeProgramId: string;
    selectedElectiveIds: string[];
    completedCourseIds: string[];
    exportedAt: string;
}

export interface GraduationProgress {
    earnedCredits: number;
    plannedCredits: number;
    requiredCredits: number;
    isEligible: boolean;
}

export interface PlannerState {
    // Active Degree View
    activeProgramId: string;
    setActiveProgram: (programId: string) => void;

    // Student Selections (Guest Mode)
    selectedElectiveIds: string[];
    completedCourseIds: string[];
    toggleElective: (courseId: string) => void;
    setSelectedElectives: (courseIds: string[]) => void;
    toggleCompletedCourse: (courseId: string) => void;
    setCompletedCourses: (courseIds: string[]) => void;
    isElectiveSelected: (courseId: string) => boolean;
    isCourseCompleted: (courseId: string) => boolean;

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

// ==========================================
// 3. Zustand Store Implementation
// ==========================================

export const usePlannerStore = create<PlannerState>()(
    persist(
        (set, get) => ({
            activeProgramId: 'computer-eng',
            setActiveProgram: (programId) => set({ activeProgramId: programId }),

            selectedElectiveIds: [],
            completedCourseIds: [],

            toggleElective: (courseId) =>
                set((state) => ({
                    selectedElectiveIds: state.selectedElectiveIds.includes(courseId)
                        ? state.selectedElectiveIds.filter((id) => id !== courseId)
                        : [...state.selectedElectiveIds, courseId],
                })),

            setSelectedElectives: (courseIds) =>
                set({ selectedElectiveIds: Array.from(new Set(courseIds)) }),

            toggleCompletedCourse: (courseId) =>
                set((state) => ({
                    completedCourseIds: state.completedCourseIds.includes(courseId)
                        ? state.completedCourseIds.filter((id) => id !== courseId)
                        : [...state.completedCourseIds, courseId],
                })),

            setCompletedCourses: (courseIds) =>
                set({ completedCourseIds: Array.from(new Set(courseIds)) }),

            isElectiveSelected: (courseId) =>
                get().selectedElectiveIds.includes(courseId),

            isCourseCompleted: (courseId) =>
                get().completedCourseIds.includes(courseId),

            // Transient Slide-over Drawer State
            inspectedCourse: null,
            isDrawerOpen: false,

            openCourseDrawer: (course) =>
                set({ inspectedCourse: course, isDrawerOpen: true }),

            closeCourseDrawer: () =>
                set({ inspectedCourse: null, isDrawerOpen: false }),

            // Credit Summation Selectors
            getSemesterCredits: (semesterIndex, courses) =>
                calculateSemesterCredits(semesterIndex, courses, get().selectedElectiveIds),

            getTotalPlannedCredits: (courses) =>
                calculateTotalPlannedCredits(courses, get().selectedElectiveIds),

            getGraduationProgress: (courses, totalRequired = 150) => {
                const state = get();
                const completedSet = new Set(state.completedCourseIds);
                let earnedCredits = 0;

                for (const course of courses) {
                    if (completedSet.has(course.id)) {
                        earnedCredits += course.totalCredits;
                    }
                }

                const plannedCredits = calculateTotalPlannedCredits(
                    courses,
                    state.selectedElectiveIds
                );

                return {
                    earnedCredits,
                    plannedCredits,
                    requiredCredits: totalRequired,
                    isEligible: plannedCredits >= totalRequired,
                };
            },

            // ADR-001 Reset & JSON Portability
            resetPlanner: () =>
                set({
                    selectedElectiveIds: [],
                    completedCourseIds: [],
                    inspectedCourse: null,
                    isDrawerOpen: false,
                }),

            exportPlan: () => {
                const state = get();
                const exportData: StudyPlanExport = {
                    version: '1.0',
                    activeProgramId: state.activeProgramId,
                    selectedElectiveIds: state.selectedElectiveIds,
                    completedCourseIds: state.completedCourseIds,
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
                                : 'computer-eng';

                        const selectedElectiveIds = Array.isArray(data.selectedElectiveIds)
                            ? data.selectedElectiveIds.filter(
                                  (id: unknown): id is string => typeof id === 'string'
                              )
                            : [];

                        const completedCourseIds = Array.isArray(data.completedCourseIds)
                            ? data.completedCourseIds.filter(
                                  (id: unknown): id is string => typeof id === 'string'
                              )
                            : [];

                        set({
                            activeProgramId,
                            selectedElectiveIds: Array.from(new Set(selectedElectiveIds)),
                            completedCourseIds: Array.from(new Set(completedCourseIds)),
                            inspectedCourse: null,
                            isDrawerOpen: false,
                        });
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
            partialize: (state) => ({
                activeProgramId: state.activeProgramId,
                selectedElectiveIds: state.selectedElectiveIds,
                completedCourseIds: state.completedCourseIds,
            }),
        }
    )
);
