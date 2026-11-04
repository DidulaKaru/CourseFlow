import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { usePlannerStore } from '@/core/store';
import { mockComputerEngineeringProgram } from '@/data/mockCourses';
import { ExportPdfButton } from '../ExportPdfButton';
import { getPdfFileName } from '../../utils/pdfFilename';

// Configure act environment for React 19 testing in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ExportPdfButton Component (CF-116)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        usePlannerStore.setState({
            activeProgramId: 'computer-eng',
            selectedElectiveIds: [],
            completedCourseIds: [],
        });
    });

    it('generates dynamic filename adhering to official pattern CourseFlow_Plan_<Degree>_<Timestamp>.pdf', () => {
        const testDate = new Date(2026, 10, 4, 18, 30, 0); // Nov 4, 2026 18:30:00
        const fileName = getPdfFileName('Computer Engineering', testDate);
        expect(fileName).toBe('CourseFlow_Plan_Computer_Engineering_20261104_183000.pdf');

        const eieFileName = getPdfFileName('Electrical and Information Engineering', testDate);
        expect(eieFileName).toBe('CourseFlow_Plan_Electrical_and_Information_Engineering_20261104_183000.pdf');
    });

    it('renders Download Plan PDF action button on mount', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<ExportPdfButton program={mockComputerEngineeringProgram} />);
        });

        const button = container.querySelector('[data-testid="export-pdf-button"]');
        expect(button).not.toBeNull();
        expect(button?.textContent).toMatch(/Preparing PDF\.\.\.|Download Plan PDF/);

        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('allows passing custom filename override', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <ExportPdfButton
                    program={mockComputerEngineeringProgram}
                    fileName="Custom_Study_Plan.pdf"
                />
            );
        });

        const link = container.querySelector('a');
        expect(link).not.toBeNull();
        expect(link?.getAttribute('download')).toBe('Custom_Study_Plan.pdf');

        act(() => {
            root.unmount();
        });
        container.remove();
    });
});
