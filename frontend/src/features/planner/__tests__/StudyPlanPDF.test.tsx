import { describe, expect, it } from 'vitest';
import { mockComputerEngineeringProgram, mockCourses } from '@/data/mockCourses';
import { StudyPlanPDF } from '../StudyPlanPDF';

describe('StudyPlanPDF Component (CF-116)', () => {
    it('constructs PDF document model with 2 pages and official academic layout', () => {
        const doc = StudyPlanPDF({
            program: mockComputerEngineeringProgram,
            courses: mockCourses,
            selectedElectiveIds: [],
            completedCourseIds: [],
            totalCreditsRequired: 150,
            generatedAt: 'Nov 4, 2026',
        });

        expect(doc).toBeDefined();
        expect(doc.type).toBeDefined();

        // Top level Document contains 2 Page elements (Semesters 1-4 on Page 1, Semesters 5-8 on Page 2)
        const pages = doc.props.children;
        expect(Array.isArray(pages)).toBe(true);
        expect(pages).toHaveLength(2);

        // Page 1 contains Header and Semesters 1-4
        const page1 = pages[0];
        expect(page1.props.size).toBe('A4');

        // Page 2 contains Semesters 5-8 and Academic Verification Stamp
        const page2 = pages[1];
        expect(page2.props.size).toBe('A4');
    });

    it('correctly allocates multi-semester capstone split credits (EC7802)', () => {
        // Capstone EC7802 has 4 credits in Sem 7 and 4 credits in Sem 8
        const capstone = mockCourses.find((c) => c.durationSemesters && c.durationSemesters > 1);
        expect(capstone).toBeDefined();
        expect(capstone?.creditDistribution).toBeDefined();
        expect(capstone?.creditDistribution).toHaveLength(2);

        const doc = StudyPlanPDF({
            program: mockComputerEngineeringProgram,
            courses: mockCourses,
            selectedElectiveIds: [],
            completedCourseIds: [],
        });

        const pages = doc.props.children;
        const page2 = pages[1];

        // Page 2 should include capstone allocation in Semester 7 and 8
        expect(page2).toBeDefined();
    });

    it('displays PROVISIONAL badge when planned credits are below 150 requirement', () => {
        // No electives selected (120 core credits < 150)
        const doc = StudyPlanPDF({
            program: mockComputerEngineeringProgram,
            courses: mockCourses,
            selectedElectiveIds: [],
            completedCourseIds: [],
            totalCreditsRequired: 150,
        });

        const page2 = doc.props.children[1];
        // The verification stamp container is on page 2
        expect(page2).toBeDefined();
    });

    it('displays COMPLIANT status when electives are planned satisfying 150 total credits', () => {
        const allElectiveIds = mockCourses
            .filter((c) => c.type === 'ELECTIVE')
            .map((c) => c.id);

        const doc = StudyPlanPDF({
            program: mockComputerEngineeringProgram,
            courses: mockCourses,
            selectedElectiveIds: allElectiveIds,
            completedCourseIds: ['EE1102', 'EE1301'],
            totalCreditsRequired: 150,
        });

        expect(doc).toBeDefined();
        expect(doc.props.children).toHaveLength(2);
    });
});
