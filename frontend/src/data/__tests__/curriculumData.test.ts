import { describe, expect, it } from 'vitest';
import rawComputerEngineering from '../programs/computer_engineering.json';
import rawElectricalEngineering from '../programs/electrical_engineering.json';
import type { DegreeProgram, PrerequisiteRule } from '@/types/curriculum';

const programs: DegreeProgram[] = [
    rawComputerEngineering as unknown as DegreeProgram,
    rawElectricalEngineering as unknown as DegreeProgram,
];

function extractPrereqCourseIds(rule: PrerequisiteRule | null): string[] {
    if (!rule) return [];
    if (rule.type === 'COURSE') return [rule.courseId];
    if (rule.type === 'AND' || rule.type === 'OR') {
        return (rule.children ?? []).flatMap(extractPrereqCourseIds);
    }
    return [];
}

describe('Curriculum Data Integrity Automated Audit', () => {
    programs.forEach((prog) => {
        describe(`Program: ${prog.name} (${prog.id})`, () => {
            it('has unique course IDs across the entire curriculum', () => {
                const seen = new Set<string>();
                const duplicates: string[] = [];

                prog.courses.forEach((c) => {
                    if (seen.has(c.id)) {
                        duplicates.push(c.id);
                    }
                    seen.add(c.id);
                });

                expect(duplicates).toEqual([]);
            });

            it('has no dangling prerequisite references in AST rules', () => {
                const courseIdSet = new Set(prog.courses.map((c) => c.id));
                const danglingRefs: { courseId: string; missingPrereq: string }[] = [];

                prog.courses.forEach((c) => {
                    const prereqs = extractPrereqCourseIds(c.prerequisiteRule);
                    prereqs.forEach((pid) => {
                        if (!courseIdSet.has(pid)) {
                            danglingRefs.push({ courseId: c.id, missingPrereq: pid });
                        }
                    });
                });

                expect(danglingRefs).toEqual([]);
            });

            it('has exact credit distribution sums matching totalCredits for all courses', () => {
                const mismatches: { courseId: string; totalCredits: number; sum: number }[] = [];

                prog.courses.forEach((c) => {
                    if (c.creditDistribution && c.creditDistribution.length > 0) {
                        const sum = c.creditDistribution.reduce((acc, d) => acc + d.creditsAllocated, 0);
                        if (sum !== c.totalCredits) {
                            mismatches.push({ courseId: c.id, totalCredits: c.totalCredits, sum });
                        }
                    }
                });

                expect(mismatches).toEqual([]);
            });

            it('allocates all courses to valid recommended semesters (1 to semestersCount)', () => {
                prog.courses.forEach((c) => {
                    expect(c.recommendedSemester).toBeGreaterThanOrEqual(1);
                    expect(c.recommendedSemester).toBeLessThanOrEqual(prog.semestersCount);
                });
            });

            it('contains non-negative credit values and positive total credits', () => {
                prog.courses.forEach((c) => {
                    expect(c.totalCredits).toBeGreaterThan(0);
                    if (c.creditDistribution) {
                        c.creditDistribution.forEach((d) => {
                            expect(d.creditsAllocated).toBeGreaterThanOrEqual(0);
                        });
                    }
                });
            });

            it('adheres to recognized course classification types', () => {
                const validTypes = new Set(['CORE', 'ELECTIVE', 'LAB', 'CAPSTONE']);
                prog.courses.forEach((c) => {
                    expect(validTypes.has(c.type)).toBe(true);
                });
            });
        });
    });
});
