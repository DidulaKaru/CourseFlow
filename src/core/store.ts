import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Course } from '@/types/curriculum';

interface PlannerState {
    // Active Degree View
    activeProgramId: string;
    setActiveProgram: (programId: string) => void;

    // Student Selections (Guest Mode)
    selectedElectiveIds: string[];
    completedCourseIds: string[];
    toggleElective: (courseId: string) => void;
    toggleCompletedCourse: (courseId: string) => void;

    // Slide-over Drawer UI State
    inspectedCourse: Course | null;
    isDrawerOpen: boolean;
    openCourseDrawer: (course: Course) => void;
    closeCourseDrawer: () => void;

    // Reset Actions
    resetPlanner: () => void;
}

export const usePlannerStore = create<PlannerState>()(
    persist(
        (set) => ({
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

            toggleCompletedCourse: (courseId) =>
                set((state) => ({
                    completedCourseIds: state.completedCourseIds.includes(courseId)
                        ? state.completedCourseIds.filter((id) => id !== courseId)
                        : [...state.completedCourseIds, courseId],
                })),

            inspectedCourse: null,
            isDrawerOpen: false,

            openCourseDrawer: (course) =>
                set({ inspectedCourse: course, isDrawerOpen: true }),

            closeCourseDrawer: () =>
                set({ inspectedCourse: null, isDrawerOpen: false }),

            resetPlanner: () =>
                set({
                    selectedElectiveIds: [],
                    completedCourseIds: [],
                }),
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