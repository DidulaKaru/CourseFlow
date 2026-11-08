import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { usePlannerStore } from '@/core/store';
import type { DegreeProgram } from '@/types/curriculum';
import { DegreeSelector } from '../DegreeSelector';

// Configure act environment for React 19 testing in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('DegreeSelector Component (CF-115)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        usePlannerStore.setState({
            activeProgramId: 'computer-eng',
            selectedElectiveIds: ['CS4001'],
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
            {
                value: 'computer-eng',
                text: 'Computer Engineering',
            },
            {
                value: 'electrical-eng',
                text: 'Electrical and Information Engineering',
            },
        ]);

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('changes active program in store and invokes onChange callback', () => {
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

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('supports custom degree programs list via props', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const customPrograms: DegreeProgram[] = [
            {
                id: 'mechanical-eng',
                name: 'Mechanical Engineering',
                department: 'Department of Mechanical Engineering',
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
        expect(select).not.toBeNull();

        const options = Array.from(select.querySelectorAll('option'));
        expect(options).toHaveLength(1);
        expect(options[0].value).toBe('mechanical-eng');
        expect(options[0].textContent?.trim()).toBe('Mechanical Engineering');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('applies xl:max-w-none to desktop label and expanded width classes to dropdown menu', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<DegreeSelector />);
        });

        // Verify desktop label class includes xl:max-w-none to avoid truncation
        const desktopLabel = container.querySelector('button[data-testid="degree-selector-button"] span.hidden.sm\\:inline') as HTMLSpanElement;
        expect(desktopLabel).not.toBeNull();
        expect(desktopLabel.className).toContain('xl:max-w-none');

        // Open custom dropdown
        const triggerBtn = container.querySelector('[data-testid="degree-selector-button"]') as HTMLButtonElement;
        act(() => {
            triggerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Verify custom dropdown panel has expanded width classes (w-72 sm:w-84)
        const dropdownMenu = container.querySelector('div.absolute.top-full') as HTMLDivElement;
        expect(dropdownMenu).not.toBeNull();
        expect(dropdownMenu.className).toContain('w-72');
        expect(dropdownMenu.className).toContain('sm:w-84');
        expect(dropdownMenu.className).toContain('max-w-[calc(100vw-24px)]');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('closes dropdown when Escape key is pressed', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<DegreeSelector />);
        });

        const triggerBtn = container.querySelector('[data-testid="degree-selector-button"]') as HTMLButtonElement;
        act(() => {
            triggerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(container.querySelector('div.absolute.top-full')).not.toBeNull();

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });

        expect(container.querySelector('div.absolute.top-full')).toBeNull();

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
