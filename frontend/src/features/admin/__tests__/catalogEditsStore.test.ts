import { beforeEach, describe, expect, it } from 'vitest';
import { getProgramCourses } from '@/data/mockCourses';
import { applyCourseEdits, useCatalogEditsStore } from '@/features/admin/store/catalogEditsStore';

describe('catalog edits store (CF-212)', () => {
    beforeEach(() => {
        useCatalogEditsStore.setState({ courseEdits: {}, editingCourseId: null });
    });

    it('returns the bundled catalog untouched when nothing was edited', () => {
        const courses = getProgramCourses('computer-eng');

        expect(applyCourseEdits(courses, undefined)).toBe(courses);
    });

    it('replaces only the edited course and keeps catalog order', () => {
        const courses = getProgramCourses('computer-eng');
        const edited = { ...courses[1], title: 'Renamed' };

        const result = applyCourseEdits(courses, { [edited.id]: edited });

        expect(result).toHaveLength(courses.length);
        expect(result[1]).toBe(edited);
        expect(result[0]).toBe(courses[0]);
    });

    it('keeps edits separate per program even when both programs share a course code', () => {
        const shared = getProgramCourses('computer-eng')[0];
        expect(getProgramCourses('electrical-eng').some((course) => course.id === shared.id)).toBe(true);

        useCatalogEditsStore.getState().applyCourseEdit('computer-eng', { ...shared, title: 'CE only' });
        const { courseEdits } = useCatalogEditsStore.getState();

        expect(applyCourseEdits(getProgramCourses('computer-eng'), courseEdits['computer-eng'])[0].title).toBe('CE only');
        expect(
            applyCourseEdits(getProgramCourses('electrical-eng'), courseEdits['electrical-eng']).find(
                (course) => course.id === shared.id
            )?.title
        ).toBe(shared.title);
    });

    it('opens and closes the editor for one course at a time', () => {
        useCatalogEditsStore.getState().openCourseEditor('CE1101');
        expect(useCatalogEditsStore.getState().editingCourseId).toBe('CE1101');

        useCatalogEditsStore.getState().closeCourseEditor();
        expect(useCatalogEditsStore.getState().editingCourseId).toBeNull();
    });
});
