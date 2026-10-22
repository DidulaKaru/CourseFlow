import { describe, it, expect, beforeEach } from 'vitest';
import { usePlannerStore } from '../store';

describe('usePlannerStore', () => {
    beforeEach(() => {
        usePlannerStore.getState().resetPlanner();
        usePlannerStore.getState().setActiveProgram('computer-eng');
    });

    it('should initialize with default guest-mode values', () => {
        const state = usePlannerStore.getState();
        expect(state.activeProgramId).toBe('computer-eng');
        expect(state.selectedElectiveIds).toEqual([]);
        expect(state.completedCourseIds).toEqual([]);
        expect(state.isDrawerOpen).toBe(false);
        expect(state.inspectedCourse).toBeNull();
    });

    it('should toggle elective selections', () => {
        const store = usePlannerStore.getState();
        store.toggleElective('CO544');
        expect(usePlannerStore.getState().selectedElectiveIds).toContain('CO544');

        usePlannerStore.getState().toggleElective('CO544');
        expect(usePlannerStore.getState().selectedElectiveIds).not.toContain('CO544');
    });

    it('should toggle completed course status', () => {
        const store = usePlannerStore.getState();
        store.toggleCompletedCourse('CO221');
        expect(usePlannerStore.getState().completedCourseIds).toContain('CO221');

        usePlannerStore.getState().toggleCompletedCourse('CO221');
        expect(usePlannerStore.getState().completedCourseIds).not.toContain('CO221');
    });

    it('should reset selections while preserving active program', () => {
        const store = usePlannerStore.getState();
        store.setActiveProgram('electrical-eng');
        store.toggleElective('EE301');
        store.toggleCompletedCourse('EE101');

        usePlannerStore.getState().resetPlanner();
        const state = usePlannerStore.getState();
        expect(state.activeProgramId).toBe('electrical-eng');
        expect(state.selectedElectiveIds).toEqual([]);
        expect(state.completedCourseIds).toEqual([]);
    });

    it('should export and import study plan JSON (ADR-001)', () => {
        const store = usePlannerStore.getState();
        store.setActiveProgram('computer-eng');
        store.toggleElective('CO544');
        store.toggleCompletedCourse('CO221');

        const exportedJson = store.exportPlan();
        expect(exportedJson).toContain('computer-eng');
        expect(exportedJson).toContain('CO544');
        expect(exportedJson).toContain('CO221');

        // Reset and re-import
        store.resetPlanner();
        expect(usePlannerStore.getState().selectedElectiveIds).toEqual([]);

        const importSuccess = store.importPlan(exportedJson);
        expect(importSuccess).toBe(true);
        expect(usePlannerStore.getState().selectedElectiveIds).toContain('CO544');
        expect(usePlannerStore.getState().completedCourseIds).toContain('CO221');
    });
});
