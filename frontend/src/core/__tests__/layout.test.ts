import { describe, expect, it } from 'vitest';
import type { Course, DegreeProgram } from '@/types/curriculum';
import {
    DEFAULT_LAYOUT_CONFIG,
    calculateDegreeLayout,
    calculateLayout,
    extractPrerequisiteCourseIds,
    getNodeYCoordinate,
    getSemesterXCoordinate,
    getSemesterYCoordinate,
    orderCoursesByBarycenter,
} from '../layout';

// Helper to create test course fixtures
function createCourse(
    id: string,
    recommendedSemester: number,
    options: Partial<Course> = {}
): Course {
    return {
        id,
        code: id,
        title: `Course ${id}`,
        description: `Description for ${id}`,
        totalCredits: 3,
        durationSemesters: 1,
        recommendedSemester,
        creditDistribution: [{ semesterIndex: recommendedSemester, creditsAllocated: 3 }],
        type: 'CORE',
        prerequisiteRule: null,
        corequisites: [],
        offeredSemesters: ['FALL'],
        ...options,
    };
}

describe('Deterministic Top-to-Bottom Swimlane Layout Mathematical Engine', () => {
    describe('Coordinate Mathematics & Non-Overlapping Invariants', () => {
        it('calculates strictly monotonic vertical Y coordinates for semester sections (Top to Bottom)', () => {
            const courseCounts = [8, 7, 8, 15, 12, 11, 11, 8];

            let prevY = 0;
            for (let sem = 1; sem <= 8; sem++) {
                const y = getSemesterYCoordinate(sem, courseCounts);
                if (sem === 1) {
                    expect(y).toBe(DEFAULT_LAYOUT_CONFIG.topPadding);
                } else {
                    expect(y).toBeGreaterThan(prevY);
                }
                prevY = y;
            }
        });

        it('ensures zero overlap across courses in any semester grid', () => {
            const courses: Course[] = [];
            // Create 7 courses for semester 1 and 15 courses for semester 4
            for (let i = 1; i <= 7; i++) {
                courses.push(createCourse(`S1_C${i}`, 1));
            }
            for (let i = 1; i <= 15; i++) {
                courses.push(createCourse(`S4_C${i}`, 4));
            }

            const { nodes } = calculateLayout(courses);
            const courseNodes = nodes.filter((n) => n.type === 'courseNode');

            // Verify pairwise non-overlapping bounding boxes
            for (let i = 0; i < courseNodes.length; i++) {
                for (let j = i + 1; j < courseNodes.length; j++) {
                    const a = courseNodes[i];
                    const b = courseNodes[j];

                    const aX1 = a.position.x;
                    const aX2 = a.position.x + DEFAULT_LAYOUT_CONFIG.nodeWidth;
                    const aY1 = a.position.y;
                    const aY2 = a.position.y + DEFAULT_LAYOUT_CONFIG.nodeHeight;

                    const bX1 = b.position.x;
                    const bX2 = b.position.x + DEFAULT_LAYOUT_CONFIG.nodeWidth;
                    const bY1 = b.position.y;
                    const bY2 = b.position.y + DEFAULT_LAYOUT_CONFIG.nodeHeight;

                    const horizontalOverlap = aX1 < bX2 && aX2 > bX1;
                    const verticalOverlap = aY1 < bY2 && aY2 > bY1;

                    expect(horizontalOverlap && verticalOverlap).toBe(false);
                }
            }
        });

        it('guarantees earlier semester courses have smaller Y than later semester courses', () => {
            const courses: Course[] = [
                createCourse('C1_A', 1),
                createCourse('C2_A', 2),
                createCourse('C3_A', 3),
                createCourse('C8_A', 8),
            ];

            const { nodes } = calculateLayout(courses);
            const c1 = nodes.find((n) => n.id === 'C1_A')!;
            const c2 = nodes.find((n) => n.id === 'C2_A')!;
            const c3 = nodes.find((n) => n.id === 'C3_A')!;
            const c8 = nodes.find((n) => n.id === 'C8_A')!;

            expect(c1.position.y).toBeLessThan(c2.position.y);
            expect(c2.position.y).toBeLessThan(c3.position.y);
            expect(c3.position.y).toBeLessThan(c8.position.y);
        });

        it('provides legacy coordinate helper functions for backward compatibility', () => {
            expect(getSemesterXCoordinate(1)).toBe(DEFAULT_LAYOUT_CONFIG.columnOffset);
            expect(getNodeYCoordinate(0)).toBe(DEFAULT_LAYOUT_CONFIG.topPadding);
        });
    });

    describe('Prerequisite AST Extraction', () => {
        it('extracts direct course prerequisites', () => {
            const rule = { type: 'COURSE' as const, courseId: 'EC101' };
            expect(extractPrerequisiteCourseIds(rule)).toEqual(['EC101']);
        });

        it('extracts nested children in AND / OR trees and removes duplicates', () => {
            const compoundRule = {
                type: 'AND' as const,
                children: [
                    { type: 'COURSE' as const, courseId: 'EC101' },
                    {
                        type: 'OR' as const,
                        children: [
                            { type: 'COURSE' as const, courseId: 'MA101' },
                            { type: 'COURSE' as const, courseId: 'MA102' },
                            { type: 'COURSE' as const, courseId: 'EC101' }, // duplicate
                        ],
                    },
                    { type: 'CREDIT_THRESHOLD' as const, minCredits: 30 },
                ],
            };

            const result = extractPrerequisiteCourseIds(compoundRule);
            expect(result).toHaveLength(3);
            expect(result).toContain('EC101');
            expect(result).toContain('MA101');
            expect(result).toContain('MA102');
        });

        it('returns empty array for null rule or pure credit thresholds', () => {
            expect(extractPrerequisiteCourseIds(null)).toEqual([]);
            expect(extractPrerequisiteCourseIds({ type: 'CREDIT_THRESHOLD', minCredits: 30 })).toEqual([]);
        });
    });

    describe('Horizontal Barycentric Ordering & Cross-Reduction', () => {
        it('orders semester 1 courses by academic type priority and code', () => {
            const courses: Course[] = [
                createCourse('CE104', 1, { type: 'ELECTIVE' }),
                createCourse('CE102', 1, { type: 'CORE' }),
                createCourse('CE103', 1, { type: 'LAB' }),
                createCourse('CE101', 1, { type: 'CORE' }),
            ];

            const orderedMap = orderCoursesByBarycenter(courses);
            const sem1Courses = orderedMap.get(1)!;

            expect(sem1Courses.map((c) => c.id)).toEqual(['CE101', 'CE102', 'CE103', 'CE104']);
        });

        it('aligns dependent courses horizontally with their upstream prerequisites', () => {
            // S1: Course A (col 0) and Course B (col 1)
            const cA = createCourse('S1_A', 1);
            const cB = createCourse('S1_B', 1);

            // S2: DepA depends on S1_A; DepB depends on S1_B
            const depA = createCourse('S2_DEP_A', 2, {
                prerequisiteRule: { type: 'COURSE', courseId: 'S1_A' },
            });
            const depB = createCourse('S2_DEP_B', 2, {
                prerequisiteRule: { type: 'COURSE', courseId: 'S1_B' },
            });

            // Feed them in reverse order (depB before depA) to verify barycenter ordering
            const layout = calculateLayout([cA, cB, depB, depA]);

            const s2DepANode = layout.nodes.find((n) => n.id === 'S2_DEP_A')!;
            const s2DepBNode = layout.nodes.find((n) => n.id === 'S2_DEP_B')!;

            expect(s2DepANode.position.x).toBeLessThan(s2DepBNode.position.x);
        });
    });

    describe('Multi-Semester Spanning Modules', () => {
        it('anchors multi-semester course to start semester with spanning visual attributes', () => {
            const capstone = createCourse('CE4001', 7, {
                title: 'Comprehensive Design Project',
                durationSemesters: 2,
                totalCredits: 6,
                type: 'CAPSTONE',
                creditDistribution: [
                    { semesterIndex: 7, creditsAllocated: 3 },
                    { semesterIndex: 8, creditsAllocated: 3 },
                ],
            });

            const { nodes } = calculateLayout([capstone]);
            const node = nodes.find((n) => n.id === 'CE4001')!;
            expect(node).toBeDefined();
            expect(node.data.isMultiSemester).toBe(true);
            expect(node.data.durationSemesters).toBe(2);
            expect(node.data.semesterIndex).toBe(7);
        });
    });

    describe('Edge Generation', () => {
        it('generates directed prerequisite edges with smoothstep routing', () => {
            const courseA = createCourse('CO101', 1);
            const courseB = createCourse('CO201', 2, {
                prerequisiteRule: { type: 'COURSE', courseId: 'CO101' },
            });

            const { edges } = calculateLayout([courseA, courseB]);
            expect(edges).toHaveLength(1);

            const edge = edges[0];
            expect(edge.id).toBe('e-CO101-CO201');
            expect(edge.source).toBe('CO101');
            expect(edge.target).toBe('CO201');
            expect(edge.type).toBe('smoothstep');
            expect(edge.data?.isPrerequisite).toBe(true);
        });

        it('generates dashed co-requisite edges', () => {
            const labCourse = createCourse('CO102L', 1);
            const theoryCourse = createCourse('CO102', 1, {
                corequisites: ['CO102L'],
            });

            const { edges } = calculateLayout([labCourse, theoryCourse]);
            const coreqEdge = edges.find((e) => e.data?.isCorequisite);

            expect(coreqEdge).toBeDefined();
            expect(coreqEdge?.source).toBe('CO102L');
            expect(coreqEdge?.target).toBe('CO102');
            expect(coreqEdge?.style?.strokeDasharray).toBe('5,5');
        });

        it('does not generate dangling edges for non-existent courses', () => {
            const courseWithExternalPrereq = createCourse('CO301', 3, {
                prerequisiteRule: { type: 'COURSE', courseId: 'NON_EXISTENT' },
            });

            const { edges } = calculateLayout([courseWithExternalPrereq]);
            expect(edges).toHaveLength(0);
        });
    });

    describe('calculateDegreeLayout Container Integration', () => {
        it('computes layout directly from a DegreeProgram container', () => {
            const program: DegreeProgram = {
                id: 'computer-eng',
                name: 'Computer Engineering',
                department: 'Department of Computer Engineering',
                totalCreditsRequired: 150,
                minCreditsPerSemester: 18,
                maxCreditsPerSemester: 24,
                semestersCount: 8,
                courses: [
                    createCourse('CO101', 1),
                    createCourse('CO102', 1),
                    createCourse('CO201', 2, {
                        prerequisiteRule: { type: 'COURSE', courseId: 'CO101' },
                    }),
                ],
            };

            const result = calculateDegreeLayout(program);
            expect(result.nodes.filter((n) => n.type === 'courseNode')).toHaveLength(3);
            expect(result.nodes.filter((n) => n.type === 'swimlaneHeader')).toHaveLength(8);
            expect(result.edges).toHaveLength(1);
            expect(result.semesters).toHaveLength(8);
            expect(result.semesters[0].courseCount).toBe(2);
            expect(result.semesters[1].courseCount).toBe(1);
        });
    });
});
