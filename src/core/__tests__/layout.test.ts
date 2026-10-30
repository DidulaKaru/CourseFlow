import { describe, expect, it } from 'vitest';
import type { Course, DegreeProgram } from '@/types/curriculum';
import {
    DEFAULT_LAYOUT_CONFIG,
    calculateDegreeLayout,
    calculateLayout,
    extractPrerequisiteCourseIds,
    getNodeYCoordinate,
    getSemesterXCoordinate,
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

describe('Deterministic Swimlane Layout Mathematical Engine', () => {
    describe('Coordinate Mathematics', () => {
        it('calculates strictly linear horizontal X coordinates according to (semesterIndex - 1) * 280 + offset', () => {
            const { columnWidth, columnOffset } = DEFAULT_LAYOUT_CONFIG;

            for (let sem = 1; sem <= 8; sem++) {
                const expectedX = (sem - 1) * columnWidth + columnOffset;
                expect(getSemesterXCoordinate(sem)).toBe(expectedX);
            }

            // Explicit coordinate assertions for 1-indexed terms
            expect(getSemesterXCoordinate(1)).toBe(40);
            expect(getSemesterXCoordinate(2)).toBe(320);
            expect(getSemesterXCoordinate(3)).toBe(600);
            expect(getSemesterXCoordinate(4)).toBe(880);
            expect(getSemesterXCoordinate(8)).toBe(2000);
        });

        it('respects custom layout configuration for X coordinates', () => {
            const customConfig = { columnWidth: 300, columnOffset: 50 };
            expect(getSemesterXCoordinate(1, customConfig)).toBe(50);
            expect(getSemesterXCoordinate(2, customConfig)).toBe(350);
            expect(getSemesterXCoordinate(4, customConfig)).toBe(950);
        });

        it('calculates vertical Y coordinates linearly: slotIndex * (nodeHeight + verticalGap) + topPadding', () => {
            const { nodeHeight, verticalGap, topPadding } = DEFAULT_LAYOUT_CONFIG;
            const slotHeight = nodeHeight + verticalGap; // 110 + 24 = 134

            expect(getNodeYCoordinate(0)).toBe(topPadding); // 80
            expect(getNodeYCoordinate(1)).toBe(topPadding + slotHeight); // 214
            expect(getNodeYCoordinate(2)).toBe(topPadding + 2 * slotHeight); // 348
            expect(getNodeYCoordinate(5)).toBe(topPadding + 5 * slotHeight); // 750
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

    describe('Barycentric Ordering & Cross-Reduction', () => {
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

        it('places dependent courses close to their upstream prerequisites vertical slot index', () => {
            // S1: Course A (slot 0) and Course B (slot 1)
            const cA = createCourse('S1_A', 1);
            const cB = createCourse('S1_B', 1);

            // S2: DepA depends on S1_A; DepB depends on S1_B
            const depA = createCourse('S2_DEP_A', 2, {
                prerequisiteRule: { type: 'COURSE', courseId: 'S1_A' },
            });
            const depB = createCourse('S2_DEP_B', 2, {
                prerequisiteRule: { type: 'COURSE', courseId: 'S1_B' },
            });

            // Feed them in reverse order (depB before depA) to ensure barycenter reorders them
            const layout = calculateLayout([cA, cB, depB, depA]);

            const s2DepANode = layout.nodes.find((n) => n.id === 'S2_DEP_A')!;
            const s2DepBNode = layout.nodes.find((n) => n.id === 'S2_DEP_B')!;

            // S2_DEP_A should have slotIndex 0 (matching S1_A), S2_DEP_B should have slotIndex 1 (matching S1_B)
            expect(s2DepANode.data.slotIndex).toBe(0);
            expect(s2DepBNode.data.slotIndex).toBe(1);
            expect(s2DepANode.position.y).toBeLessThan(s2DepBNode.position.y);
        });
    });

    describe('Strict Column Isolation & Invariants', () => {
        it('ensures all nodes in semester S have zero horizontal overlap across columns', () => {
            const courses: Course[] = [];
            // Create 3 courses per semester across all 8 semesters
            for (let sem = 1; sem <= 8; sem++) {
                courses.push(createCourse(`C_${sem}_A`, sem));
                courses.push(createCourse(`C_${sem}_B`, sem));
                courses.push(createCourse(`C_${sem}_C`, sem));
            }

            const { nodes, columns } = calculateLayout(courses);
            expect(nodes).toHaveLength(24);
            expect(columns).toHaveLength(8);

            // Verify each node has X matching its semester
            for (const node of nodes) {
                const sem = node.data.semesterIndex;
                const expectedX = getSemesterXCoordinate(sem);
                expect(node.position.x).toBe(expectedX);
            }

            // Verify horizontal bounds: no node in semester S overlaps semester S+1
            for (let sem = 1; sem < 8; sem++) {
                const currentColumnNodes = nodes.filter((n) => n.data.semesterIndex === sem);
                const nextColumnNodes = nodes.filter((n) => n.data.semesterIndex === sem + 1);

                const currentX = currentColumnNodes[0].position.x;
                const nextX = nextColumnNodes[0].position.x;

                expect(nextX - currentX).toBe(DEFAULT_LAYOUT_CONFIG.columnWidth);
                expect(currentX + DEFAULT_LAYOUT_CONFIG.nodeWidth).toBeLessThan(nextX);
            }
        });
    });

    describe('Multi-Semester Spanning Modules', () => {
        it('anchors multi-semester course to start semester with spanning visual data', () => {
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
            expect(nodes).toHaveLength(1);

            const node = nodes[0];
            expect(node.position.x).toBe(getSemesterXCoordinate(7));
            expect(node.data.isMultiSemester).toBe(true);
            expect(node.data.durationSemesters).toBe(2);
            // spanWidth = nodeWidth + (2 - 1) * columnWidth = 240 + 280 = 520
            expect(node.data.spanWidth).toBe(520);
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
            expect(result.nodes).toHaveLength(3);
            expect(result.edges).toHaveLength(1);
            expect(result.columns).toHaveLength(8);
            expect(result.columns[0].courseCount).toBe(2);
            expect(result.columns[1].courseCount).toBe(1);
        });
    });
});
