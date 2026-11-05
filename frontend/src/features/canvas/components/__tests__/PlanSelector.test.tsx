import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PlanSelector } from '../PlanSelector';
import { usePlannerStore } from '@/core/store';

describe('PlanSelector Component', () => {
    beforeEach(() => {
        localStorage.clear();
        usePlannerStore.getState().resetPlanner();
        usePlannerStore.getState().setActiveProgram('computer-eng');
    });

    it('renders the active study plan name', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<PlanSelector />);
        });

        expect(container.textContent).toContain('Default Plan');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('opens dropdown menu when clicked', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<PlanSelector />);
        });

        const toggleBtn = container.querySelector('button');
        expect(toggleBtn).not.toBeNull();

        act(() => {
            toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(container.textContent).toContain('Study Plans');
        expect(container.textContent).toContain('Create New Plan');

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('allows creating a new plan from dropdown', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<PlanSelector />);
        });

        // Open dropdown
        const toggleBtn = container.querySelector('button');
        act(() => {
            toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Click create new plan button
        const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Create New Plan')
        );
        expect(createBtn).not.toBeUndefined();

        act(() => {
            createBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Store should now have 2 plans
        const state = usePlannerStore.getState();
        const cePlans = state.plans['computer-eng'];
        expect(cePlans.length).toBe(2);

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
