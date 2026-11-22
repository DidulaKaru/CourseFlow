import { useMemo } from 'react';
import { create } from 'zustand';
import { getProgramCourses } from '@/data/mockCourses';
import type { Course } from '@/types/curriculum';

/** Saved admin edits, keyed by program then course ID. */
export type CourseEdits = Record<string, Record<string, Course>>;

interface CatalogEditsState {
    courseEdits: CourseEdits;
    /** Course whose editor modal is open, if any. */
    editingCourseId: string | null;
    applyCourseEdit: (programId: string, course: Course) => void;
    openCourseEditor: (courseId: string) => void;
    closeCourseEditor: () => void;
}

/**
 * Courses an admin saved this session. Deliberately not persisted: the student catalog still
 * loads from the bundled JSON, so a reload shows bundled data until the read path moves to
 * PostgreSQL (plans/Malsha_Sprint2.md, CF-212 known limitation).
 */
export const useCatalogEditsStore = create<CatalogEditsState>()((set) => ({
    courseEdits: {},
    editingCourseId: null,
    applyCourseEdit: (programId, course) =>
        set((state) => ({
            courseEdits: {
                ...state.courseEdits,
                [programId]: { ...state.courseEdits[programId], [course.id]: course },
            },
        })),
    openCourseEditor: (courseId) => set({ editingCourseId: courseId }),
    closeCourseEditor: () => set({ editingCourseId: null }),
}));

export function applyCourseEdits(
    courses: Course[],
    edits: Record<string, Course> | undefined
): Course[] {
    if (!edits) return courses;
    return courses.map((course) => edits[course.id] ?? course);
}

/** The active program's catalog with this session's saved admin edits applied. */
export function useProgramCourses(programId: string): Course[] {
    const edits = useCatalogEditsStore((state) => state.courseEdits[programId]);
    return useMemo(() => applyCourseEdits(getProgramCourses(programId), edits), [programId, edits]);
}
