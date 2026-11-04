import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { usePlannerStore } from '@/core/store';
import { DegreeSelector } from '../DegreeSelector';

// Configure act environment for React 19 testing in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('DegreeSelector Component (CF-115)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        usePlannerStore.setState({
            activeProgramId: 'computer-eng',
            selectedElectiveIds: ['CS4001'],
            completedCourseIds: ['CS1001'],
            inspectedCourse: null,
            isDrawerOpen: false,
        });
    });

    it('renders degree dropdown with available engineering degree options', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<DegreeSelector />);
        });

        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select).not.toBeNull();
        expect(select.getAttribute('aria-label')).toBe('Select Degree Program');

        const options = Array.from(select.querySelectorAll('option')).map((o) => ({
            value: o.value,
            text: o.textContent?.trim(),
        }));

        expect(options).toEqual([
            { value: 'computer-eng', text: 'Computer Engineering' },
            { value: 'electrical-eng', text: 'Electrical and Information Engineering' },
        ]);

        expect(select.value).toBe('computer-eng');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('changes active program in store and resets previous selections on selection change', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        let selectedId = '';
        act(() => {
            root.render(
                <DegreeSelector
                    onChange={(id) => {
                        selectedId = id;
                    }}
                />
            );
        });

        const select = container.querySelector('select') as HTMLSelectElement;

        // Change select value to electrical and information engineering
        act(() => {
            select.value = 'electrical-eng';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Verification
        expect(selectedId).toBe('electrical-eng');
        const state = usePlannerStore.getState();
        expect(state.activeProgramId).toBe('electrical-eng');
        expect(state.selectedElectiveIds).toEqual([]);
        expect(state.completedCourseIds).toEqual([]);

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('supports custom degree programs list via props', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const customPrograms = [
            {
                id: 'mech-eng',
                name: 'Mechanical Engineering',
                department: 'Mechanical',
                totalCreditsRequired: 150,
                minCreditsPerSemester: 18,
                maxCreditsPerSemester: 24,
                semestersCount: 8,
                courses: [],
            },
        ];

        act(() => {
            root.render(<DegreeSelector programs={customPrograms} />);
        });

        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select.querySelectorAll('option')).toHaveLength(1);
        expect(select.querySelector('option')?.textContent?.trim()).toBe('Mechanical Engineering');

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
