import { describe, expect, it } from 'vitest';
import type { Course, PrerequisiteRule } from '@/types/curriculum';
import {
    calculateEarnedCredits,
    evaluatePlannedPrerequisite,
    evaluatePrerequisite,
    evaluatePrerequisiteWithDiagnostics,
    formatPrerequisiteRule,
    isCourseUnlocked,
} from '../algorithms/ast_evaluator';

describe('Recursive Boolean AST Prerequisite Evaluator (CF-103)', () => {
    describe('Base Node Evaluation', () => {
        it('evaluates null rule as unconditionally true', () => {
            expect(evaluatePrerequisite(null, new Set(), 0)).toBe(true);
            expect(evaluatePrerequisite(null, ['CO101'], 15)).toBe(true);
        });

        it('evaluates COURSE rule based on course completion', () => {
            const courseRule: PrerequisiteRule = { type: 'COURSE', courseId: 'EC101' };

            expect(evaluatePrerequisite(courseRule, new Set(['EC101']), 0)).toBe(true);
            expect(evaluatePrerequisite(courseRule, new Set(['EC102', 'MA101']), 30)).toBe(false);
            expect(evaluatePrerequisite(courseRule, [], 0)).toBe(false);
            // Array normalization support
            expect(evaluatePrerequisite(courseRule, ['EC101', 'MA101'], 10)).toBe(true);
        });

        it('evaluates CREDIT_THRESHOLD rule accurately against earned credits', () => {
            const creditRule: PrerequisiteRule = { type: 'CREDIT_THRESHOLD', minCredits: 30 };

            expect(evaluatePrerequisite(creditRule, new Set(), 30)).toBe(true); // Exact threshold
            expect(evaluatePrerequisite(creditRule, new Set(), 45)).toBe(true); // Exceeded threshold
            expect(evaluatePrerequisite(creditRule, new Set(['EC101']), 29)).toBe(false); // 1 credit short
            expect(evaluatePrerequisite(creditRule, new Set(), 0)).toBe(false);
        });
    });

    describe('Logical Operators (AND / OR)', () => {
        it('evaluates AND rules: true only when all child conditions are satisfied', () => {
            const andRule: PrerequisiteRule = {
                type: 'AND',
                children: [
                    { type: 'COURSE', courseId: 'EC101' },
                    { type: 'COURSE', courseId: 'EC102' },
                ],
            };

            expect(evaluatePrerequisite(andRule, ['EC101', 'EC102'], 0)).toBe(true);
            expect(evaluatePrerequisite(andRule, ['EC101'], 0)).toBe(false);
            expect(evaluatePrerequisite(andRule, ['EC102'], 0)).toBe(false);
            expect(evaluatePrerequisite(andRule, [], 0)).toBe(false);
        });

        it('evaluates OR rules: true when at least one child condition is satisfied', () => {
            const orRule: PrerequisiteRule = {
                type: 'OR',
                children: [
                    { type: 'COURSE', courseId: 'MA101' },
                    { type: 'COURSE', courseId: 'MA102' },
                ],
            };

            expect(evaluatePrerequisite(orRule, ['MA101'], 0)).toBe(true);
            expect(evaluatePrerequisite(orRule, ['MA102'], 0)).toBe(true);
            expect(evaluatePrerequisite(orRule, ['MA101', 'MA102'], 0)).toBe(true);
            expect(evaluatePrerequisite(orRule, ['EC101'], 0)).toBe(false);
        });

        it('handles empty children arrays safely according to identity laws', () => {
            // Vacuous truth for empty AND
            expect(evaluatePrerequisite({ type: 'AND', children: [] }, new Set(), 0)).toBe(true);
            // Empty disjunction is false
            expect(evaluatePrerequisite({ type: 'OR', children: [] }, new Set(), 0)).toBe(false);
        });
    });

    describe('Complex & Deeply Nested AST Trees', () => {
        // (EC101 AND EC102) OR (EC105 AND Credits >= 30)
        const academicHandbookRule: PrerequisiteRule = {
            type: 'OR',
            children: [
                {
                    type: 'AND',
                    children: [
                        { type: 'COURSE', courseId: 'EC101' },
                        { type: 'COURSE', courseId: 'EC102' },
                    ],
                },
                {
                    type: 'AND',
                    children: [
                        { type: 'COURSE', courseId: 'EC105' },
                        { type: 'CREDIT_THRESHOLD', minCredits: 30 },
                    ],
                },
            ],
        };

        it('satisfies via first branch: completed EC101 and EC102 with 0 credits', () => {
            expect(evaluatePrerequisite(academicHandbookRule, ['EC101', 'EC102'], 0)).toBe(true);
        });

        it('satisfies via second branch: completed EC105 with 30 credits', () => {
            expect(evaluatePrerequisite(academicHandbookRule, ['EC105'], 30)).toBe(true);
        });

        it('rejects when second branch has course but lacks credits threshold', () => {
            expect(evaluatePrerequisite(academicHandbookRule, ['EC105'], 28)).toBe(false);
        });

        it('rejects when both branches are incomplete', () => {
            expect(evaluatePrerequisite(academicHandbookRule, ['EC101'], 35)).toBe(false);
            expect(evaluatePrerequisite(academicHandbookRule, ['EC102'], 15)).toBe(false);
            expect(evaluatePrerequisite(academicHandbookRule, [], 100)).toBe(false);
        });

        it('evaluates deeply nested tree with 4 levels of recursion', () => {
            // A OR (B AND (C OR (D AND Credits >= 60)))
            const deepRule: PrerequisiteRule = {
                type: 'OR',
                children: [
                    { type: 'COURSE', courseId: 'A' },
                    {
                        type: 'AND',
                        children: [
                            { type: 'COURSE', courseId: 'B' },
                            {
                                type: 'OR',
                                children: [
                                    { type: 'COURSE', courseId: 'C' },
                                    {
                                        type: 'AND',
                                        children: [
                                            { type: 'COURSE', courseId: 'D' },
                                            { type: 'CREDIT_THRESHOLD', minCredits: 60 },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            };

            // Satisfied by root A
            expect(evaluatePrerequisite(deepRule, ['A'], 0)).toBe(true);

            // Satisfied by B + C
            expect(evaluatePrerequisite(deepRule, ['B', 'C'], 0)).toBe(true);

            // Satisfied by B + D + 60 credits
            expect(evaluatePrerequisite(deepRule, ['B', 'D'], 60)).toBe(true);

            // Fails with B + D but only 59 credits
            expect(evaluatePrerequisite(deepRule, ['B', 'D'], 59)).toBe(false);

            // Fails with only D and 80 credits (missing B)
            expect(evaluatePrerequisite(deepRule, ['D'], 80)).toBe(false);
        });
    });

    describe('Official Mock Course Prerequisite Verification', () => {
        // Matches the official mock_course.json prerequisite AST
        const mockCapstoneRule: PrerequisiteRule = {
            type: 'AND',
            children: [
                { type: 'COURSE', courseId: 'CE3001' },
                {
                    type: 'OR',
                    children: [
                        { type: 'COURSE', courseId: 'MA2001' },
                        { type: 'COURSE', courseId: 'MA2002' },
                    ],
                },
                { type: 'CREDIT_THRESHOLD', minCredits: 90 },
            ],
        };

        it('passes when CE3001, MA2001, and 90 credits are achieved', () => {
            expect(evaluatePrerequisite(mockCapstoneRule, ['CE3001', 'MA2001'], 90)).toBe(true);
        });

        it('passes when CE3001, MA2002, and 100 credits are achieved', () => {
            expect(evaluatePrerequisite(mockCapstoneRule, ['CE3001', 'MA2002'], 100)).toBe(true);
        });

        it('fails if CE3001 is missing', () => {
            expect(evaluatePrerequisite(mockCapstoneRule, ['MA2001'], 95)).toBe(false);
        });

        it('fails if neither math course is passed', () => {
            expect(evaluatePrerequisite(mockCapstoneRule, ['CE3001'], 95)).toBe(false);
        });

        it('fails if credit threshold is unmet', () => {
            expect(evaluatePrerequisite(mockCapstoneRule, ['CE3001', 'MA2001'], 89)).toBe(false);
        });
    });

    describe('Diagnostics & Human-Readable Formatting', () => {
        it('provides granular diagnostics for unmet prerequisites', () => {
            const rule: PrerequisiteRule = {
                type: 'AND',
                children: [
                    { type: 'COURSE', courseId: 'CE2001' },
                    { type: 'CREDIT_THRESHOLD', minCredits: 45 },
                ],
            };

            const diag = evaluatePrerequisiteWithDiagnostics(rule, [], 30);
            expect(diag.isSatisfied).toBe(false);
            expect(diag.missingCourseIds).toContain('CE2001');
            expect(diag.creditDeficit).toBe(15);
            expect(diag.summary).toContain('Requires: CE2001');
            expect(diag.summary).toContain('Requires 15 more credits');
        });

        it('formats recursive AST rules into readable logical formulas', () => {
            const rule: PrerequisiteRule = {
                type: 'AND',
                children: [
                    { type: 'COURSE', courseId: 'CE3001' },
                    {
                        type: 'OR',
                        children: [
                            { type: 'COURSE', courseId: 'MA2001' },
                            { type: 'COURSE', courseId: 'MA2002' },
                        ],
                    },
                    { type: 'CREDIT_THRESHOLD', minCredits: 90 },
                ],
            };

            const formatted = formatPrerequisiteRule(rule);
            expect(formatted).toBe('CE3001 AND (MA2001 OR MA2002) AND ≥ 90 Credits');
        });

        it('formats null rule as None', () => {
            expect(formatPrerequisiteRule(null)).toBe('None');
        });
    });

    describe('Course Progression Helpers', () => {
        const testCourse: Course = {
            id: 'CE3002',
            code: 'CE3002',
            title: 'Advanced Computer Architecture',
            description: '',
            totalCredits: 3,
            durationSemesters: 1,
            recommendedSemester: 5,
            creditDistribution: [{ semesterIndex: 5, creditsAllocated: 3 }],
            type: 'CORE',
            prerequisiteRule: { type: 'COURSE', courseId: 'CE2001' },
            corequisites: [],
            offeredSemesters: ['FALL'],
        };

        it('checks whether a course is unlocked', () => {
            expect(isCourseUnlocked(testCourse, ['CE2001'], 40)).toBe(true);
            expect(isCourseUnlocked(testCourse, [], 40)).toBe(false);
        });

        it('calculates total earned credits from catalog courses', () => {
            const catalog: Course[] = [
                { ...testCourse, id: 'C1', totalCredits: 3 },
                { ...testCourse, id: 'C2', totalCredits: 4 },
                { ...testCourse, id: 'C3', totalCredits: 2 },
            ];

            expect(calculateEarnedCredits(['C1', 'C2'], catalog)).toBe(7);
            expect(calculateEarnedCredits(['C3'], catalog)).toBe(2);
            expect(calculateEarnedCredits([], catalog)).toBe(0);
        });
    });

    describe('Degree Planning Prospective Prerequisite Evaluation (evaluatePlannedPrerequisite)', () => {
        const helperCourse = (
            id: string,
            sem: number,
            type: Course['type'] = 'CORE',
            credits = 3,
            rule: PrerequisiteRule | null = null
        ): Course => ({
            id,
            code: id,
            title: `Course ${id}`,
            description: `Description for ${id}`,
            totalCredits: credits,
            durationSemesters: 1,
            recommendedSemester: sem,
            creditDistribution: [{ semesterIndex: sem, creditsAllocated: credits }],
            type,
            prerequisiteRule: rule,
            corequisites: [],
            offeredSemesters: ['FALL'],
        });

        const programCatalog: Course[] = [
            helperCourse('CORE_S1', 1, 'CORE', 4),
            helperCourse('LAB_S1', 1, 'LAB', 2),
            helperCourse('CORE_S2', 2, 'CORE', 4),
            helperCourse('ELEC_S2', 2, 'ELECTIVE', 3),
            helperCourse('CORE_S3', 3, 'CORE', 4),
            helperCourse('ELEC_S3', 3, 'ELECTIVE', 3),
            helperCourse('CORE_S4', 4, 'CORE', 4),
        ];

        it('returns status no_prereqs and isSatisfied true when prerequisiteRule is null', () => {
            const course = helperCourse('FREE_COURSE', 3, 'CORE', 3, null);
            const result = evaluatePlannedPrerequisite(course, programCatalog, []);

            expect(result.isSatisfied).toBe(true);
            expect(result.status).toBe('no_prereqs');
            expect(result.missingCourseIds).toEqual([]);
            expect(result.creditDeficit).toBe(0);
            expect(result.summary).toBe('No prerequisites required');
        });

        it('marks mandatory CORE/LAB prerequisite from strictly prior semester as satisfied', () => {
            // Course in S2 requiring CORE_S1 from S1
            const courseInS2 = helperCourse('DEPENDENT_S2', 2, 'CORE', 3, {
                type: 'COURSE',
                courseId: 'CORE_S1',
            });

            const result = evaluatePlannedPrerequisite(courseInS2, programCatalog, []);
            expect(result.isSatisfied).toBe(true);
            expect(result.status).toBe('satisfied');
            expect(result.missingCourseIds).toEqual([]);
            expect(result.creditDeficit).toBe(0);
            expect(result.summary).toBe('Prerequisites satisfied');
        });

        it('marks elective prerequisite as unmet if elective is not in selectedElectiveIds', () => {
            // Course in S3 requiring ELEC_S2 from S2
            const courseInS3 = helperCourse('DEPENDENT_S3', 3, 'CORE', 3, {
                type: 'COURSE',
                courseId: 'ELEC_S2',
            });

            const result = evaluatePlannedPrerequisite(courseInS3, programCatalog, []);
            expect(result.isSatisfied).toBe(false);
            expect(result.status).toBe('unmet');
            expect(result.missingCourseIds).toEqual(['ELEC_S2']);
            expect(result.summary).toContain('Requires: ELEC_S2');
        });

        it('marks elective prerequisite as satisfied if elective is in selectedElectiveIds in prior semester', () => {
            // Course in S3 requiring ELEC_S2 from S2
            const courseInS3 = helperCourse('DEPENDENT_S3', 3, 'CORE', 3, {
                type: 'COURSE',
                courseId: 'ELEC_S2',
            });

            const result = evaluatePlannedPrerequisite(courseInS3, programCatalog, ['ELEC_S2']);
            expect(result.isSatisfied).toBe(true);
            expect(result.status).toBe('satisfied');
            expect(result.missingCourseIds).toEqual([]);
            expect(result.creditDeficit).toBe(0);
            expect(result.summary).toBe('Prerequisites satisfied');
        });

        it('evaluates CREDIT_THRESHOLD based on planned credits strictly prior to recommendedSemester', () => {
            // In catalog:
            // S1 has CORE_S1 (4) + LAB_S1 (2) = 6 credits
            // S2 has CORE_S2 (4) = 4 credits (without elective)
            // Total prior to S3 = 10 credits
            const courseInS3 = helperCourse('THRESHOLD_S3', 3, 'CORE', 3, {
                type: 'CREDIT_THRESHOLD',
                minCredits: 10,
            });

            // Exactly 10 credits -> satisfied
            const satisfiedResult = evaluatePlannedPrerequisite(courseInS3, programCatalog, []);
            expect(satisfiedResult.isSatisfied).toBe(true);
            expect(satisfiedResult.status).toBe('satisfied');
            expect(satisfiedResult.creditDeficit).toBe(0);

            // Requires 12 credits -> deficit of 2
            const deficitCourse = helperCourse('DEFICIT_S3', 3, 'CORE', 3, {
                type: 'CREDIT_THRESHOLD',
                minCredits: 12,
            });
            const deficitResult = evaluatePlannedPrerequisite(deficitCourse, programCatalog, []);
            expect(deficitResult.isSatisfied).toBe(false);
            expect(deficitResult.status).toBe('unmet');
            expect(deficitResult.creditDeficit).toBe(2);
            expect(deficitResult.summary).toContain('Requires 2 more credits');

            // With ELEC_S2 (3 credits) selected, total prior to S3 = 13 credits >= 12 -> now satisfied
            const withElectiveResult = evaluatePlannedPrerequisite(deficitCourse, programCatalog, [
                'ELEC_S2',
            ]);
            expect(withElectiveResult.isSatisfied).toBe(true);
            expect(withElectiveResult.status).toBe('satisfied');
            expect(withElectiveResult.creditDeficit).toBe(0);
        });

        it('correctly handles multi-semester distributed credits in prior credit calculation', () => {
            const capstoneSpanning: Course = {
                id: 'CAPSTONE',
                code: 'CAPSTONE',
                title: 'Design Project',
                description: '',
                totalCredits: 6,
                durationSemesters: 2,
                recommendedSemester: 2,
                creditDistribution: [
                    { semesterIndex: 2, creditsAllocated: 3 },
                    { semesterIndex: 3, creditsAllocated: 3 },
                ],
                type: 'CAPSTONE',
                prerequisiteRule: null,
                corequisites: [],
                offeredSemesters: ['FALL'],
            };

            const customCatalog = [
                helperCourse('C1', 1, 'CORE', 4),
                capstoneSpanning,
            ];

            // Course in S3: credits strictly prior to S3 include C1 (4) and CAPSTONE term 1 in S2 (3) = 7 credits
            // CAPSTONE term 2 in S3 is NOT strictly prior to S3.
            const courseInS3 = helperCourse('ADV_S3', 3, 'CORE', 3, {
                type: 'CREDIT_THRESHOLD',
                minCredits: 7,
            });

            const result = evaluatePlannedPrerequisite(courseInS3, customCatalog, []);
            expect(result.isSatisfied).toBe(true);

            // Requiring 8 credits fails with deficit 1
            const courseRequiring8 = helperCourse('ADV_S3_8', 3, 'CORE', 3, {
                type: 'CREDIT_THRESHOLD',
                minCredits: 8,
            });
            const failResult = evaluatePlannedPrerequisite(courseRequiring8, customCatalog, []);
            expect(failResult.isSatisfied).toBe(false);
            expect(failResult.creditDeficit).toBe(1);
        });

        it('rejects a prerequisite course if it is scheduled in a later semester', () => {
            // Course in S2 requiring CORE_S4 from S4 (scheduling paradox)
            const paradoxicalCourse = helperCourse('PARADOX', 2, 'CORE', 3, {
                type: 'COURSE',
                courseId: 'CORE_S4',
            });

            const result = evaluatePlannedPrerequisite(paradoxicalCourse, programCatalog, []);
            expect(result.isSatisfied).toBe(false);
            expect(result.status).toBe('unmet');
            expect(result.missingCourseIds).toContain('CORE_S4');
        });

        it('evaluates composite AND/OR rules accurately with informative summaries', () => {
            // (CORE_S1 AND ELEC_S2) OR (CREDIT_THRESHOLD 15)
            const complexCourse = helperCourse('COMPLEX_S4', 4, 'CORE', 3, {
                type: 'OR',
                children: [
                    {
                        type: 'AND',
                        children: [
                            { type: 'COURSE', courseId: 'CORE_S1' },
                            { type: 'COURSE', courseId: 'ELEC_S2' },
                        ],
                    },
                    { type: 'CREDIT_THRESHOLD', minCredits: 30 },
                ],
            });

            // With no electives, CORE_S1 is satisfied but ELEC_S2 is not; threshold 30 unmet
            const unmetResult = evaluatePlannedPrerequisite(complexCourse, programCatalog, []);
            expect(unmetResult.isSatisfied).toBe(false);
            expect(unmetResult.missingCourseIds).toContain('ELEC_S2');

            // Select ELEC_S2 -> branch 1 satisfied!
            const satisfiedResult = evaluatePlannedPrerequisite(complexCourse, programCatalog, [
                'ELEC_S2',
            ]);
            expect(satisfiedResult.isSatisfied).toBe(true);
            expect(satisfiedResult.status).toBe('satisfied');
        });
    });
});
