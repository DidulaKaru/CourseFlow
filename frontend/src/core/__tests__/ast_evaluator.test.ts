import { describe, expect, it } from 'vitest';
import type { Course, PrerequisiteRule } from '@/types/curriculum';
import {
    calculateEarnedCredits,
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
});
