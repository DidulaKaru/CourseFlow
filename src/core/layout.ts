import type { Edge, Node } from '@xyflow/react';
import type { Course, DegreeProgram, PrerequisiteRule } from '@/types/curriculum';

// ==========================================
// 1. Layout Configuration & Constants
// ==========================================

export interface LayoutConfig {
    columnWidth: number;
    columnOffset: number;
    nodeWidth: number;
    nodeHeight: number;
    verticalGap: number;
    topPadding: number;
    semestersCount: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
    columnWidth: 280,
    columnOffset: 40,
    nodeWidth: 240,
    nodeHeight: 110,
    verticalGap: 24,
    topPadding: 80,
    semestersCount: 8,
};

// ==========================================
// 2. Types for Node Data & Layout Results
// ==========================================

export interface CourseNodeData extends Record<string, unknown> {
    course: Course;
    isMultiSemester: boolean;
    durationSemesters: number;
    spanWidth: number;
    semesterIndex: number;
    slotIndex: number;
}

export type CourseLayoutNode = Node<CourseNodeData, 'courseNode'>;

export interface SemesterColumnMetadata {
    semesterIndex: number;
    x: number;
    width: number;
    courseCount: number;
}

export interface LayoutResult {
    nodes: CourseLayoutNode[];
    edges: Edge[];
    columns: SemesterColumnMetadata[];
}

// ==========================================
// 3. Mathematical Coordinate Calculators
// ==========================================

/**
 * Calculates the strictly deterministic horizontal X coordinate for a semester column (1-indexed).
 * Invariant: X = (semesterIndex - 1) * columnWidth + columnOffset
 */
export function getSemesterXCoordinate(
    semesterIndex: number,
    config: Pick<LayoutConfig, 'columnWidth' | 'columnOffset'> = DEFAULT_LAYOUT_CONFIG
): number {
    return (semesterIndex - 1) * config.columnWidth + config.columnOffset;
}

/**
 * Calculates the vertical Y coordinate for a course node slot within a semester column (0-indexed).
 * Formula: Y = slotIndex * (nodeHeight + verticalGap) + topPadding
 */
export function getNodeYCoordinate(
    slotIndex: number,
    config: Pick<LayoutConfig, 'nodeHeight' | 'verticalGap' | 'topPadding'> = DEFAULT_LAYOUT_CONFIG
): number {
    return slotIndex * (config.nodeHeight + config.verticalGap) + config.topPadding;
}

// ==========================================
// 4. Prerequisite AST Edge Extractor
// ==========================================

/**
 * Recursively extracts all unique prerequisite course IDs referenced in a PrerequisiteRule AST.
 */
export function extractPrerequisiteCourseIds(rule: PrerequisiteRule | null): string[] {
    if (!rule) {
        return [];
    }

    if (rule.type === 'COURSE') {
        return [rule.courseId];
    }

    if (rule.type === 'CREDIT_THRESHOLD') {
        return [];
    }

    if (rule.type === 'AND' || rule.type === 'OR') {
        const ids: string[] = [];
        for (const child of rule.children) {
            ids.push(...extractPrerequisiteCourseIds(child));
        }
        return Array.from(new Set(ids));
    }

    return [];
}

// ==========================================
// 5. Barycentric Vertical Ordering Heuristic
// ==========================================

/**
 * Priority weighting for course types when resolving initial placement:
 * CORE (0) -> LAB (1) -> CAPSTONE (2) -> ELECTIVE (3).
 */
function getCourseTypePriority(type: Course['type']): number {
    switch (type) {
        case 'CORE':
            return 0;
        case 'LAB':
            return 1;
        case 'CAPSTONE':
            return 2;
        case 'ELECTIVE':
            return 3;
        default:
            return 4;
    }
}

/**
 * Computes optimal vertical ordering for courses within each discrete semester column
 * using a layered barycentric heuristic to minimize prerequisite edge crossings.
 *
 * For each course in column S, its barycenter is the average vertical slot index
 * of all its prerequisite courses in previous columns (< S).
 */
export function orderCoursesByBarycenter(
    courses: Course[],
    semestersCount = DEFAULT_LAYOUT_CONFIG.semestersCount
): Map<number, Course[]> {
    // 1. Group courses into discrete semester buckets (1 to semestersCount)
    const semesterBuckets = new Map<number, Course[]>();
    for (let sem = 1; sem <= semestersCount; sem++) {
        semesterBuckets.set(sem, []);
    }

    for (const course of courses) {
        // Clamp recommended semester to valid bounds
        const targetSemester = Math.min(
            Math.max(1, course.recommendedSemester || 1),
            semestersCount
        );
        const bucket = semesterBuckets.get(targetSemester);
        if (bucket) {
            bucket.push(course);
        }
    }

    // 2. Track assigned vertical slot indices: courseId -> slotIndex
    const assignedSlots = new Map<string, number>();

    // 3. Process columns sequentially from 1 to semestersCount
    const orderedBuckets = new Map<number, Course[]>();

    for (let sem = 1; sem <= semestersCount; sem++) {
        const bucket = semesterBuckets.get(sem) ?? [];

        if (sem === 1) {
            // Semester 1 has no upstream degree prerequisites.
            // Sort by academic course type priority and course code.
            bucket.sort((a, b) => {
                const priorityDiff = getCourseTypePriority(a.type) - getCourseTypePriority(b.type);
                if (priorityDiff !== 0) return priorityDiff;
                return a.code.localeCompare(b.code);
            });
        } else {
            // Compute barycentric value for each course in column sem
            const barycenters = new Map<string, number>();

            for (const course of bucket) {
                const prereqIds = extractPrerequisiteCourseIds(course.prerequisiteRule);
                const placedPrereqSlots: number[] = [];

                for (const pid of prereqIds) {
                    if (assignedSlots.has(pid)) {
                        placedPrereqSlots.push(assignedSlots.get(pid)!);
                    }
                }

                if (placedPrereqSlots.length > 0) {
                    const sum = placedPrereqSlots.reduce((acc, curr) => acc + curr, 0);
                    barycenters.set(course.id, sum / placedPrereqSlots.length);
                } else {
                    // If no upstream prerequisites in earlier columns, anchor using
                    // baseline type priority as fallback barycenter
                    barycenters.set(course.id, 100 + getCourseTypePriority(course.type));
                }
            }

            // Sort column courses by ascending barycenter, breaking ties by type and code
            bucket.sort((a, b) => {
                const bA = barycenters.get(a.id) ?? 0;
                const bB = barycenters.get(b.id) ?? 0;
                if (Math.abs(bA - bB) > 0.0001) {
                    return bA - bB;
                }
                const priorityDiff = getCourseTypePriority(a.type) - getCourseTypePriority(b.type);
                if (priorityDiff !== 0) return priorityDiff;
                return a.code.localeCompare(b.code);
            });
        }

        // Record slot indices for courses in this column
        bucket.forEach((course, index) => {
            assignedSlots.set(course.id, index);
        });

        orderedBuckets.set(sem, bucket);
    }

    return orderedBuckets;
}

// ==========================================
// 6. Complete Layout Engine (calculateLayout)
// ==========================================

/**
 * Transforms an array of courses into deterministic React Flow nodes and edges.
 *
 * Guaranteed Invariants:
 * 1. Nodes in semester S have X = (S - 1) * columnWidth + columnOffset.
 * 2. Nodes in the same column have Y = slotIndex * (nodeHeight + verticalGap) + topPadding.
 * 3. Multi-semester courses are anchored to their start term with explicit span width.
 * 4. Edges are generated for all prerequisite dependencies with smoothstep routing.
 */
export function calculateLayout(
    courses: Course[],
    options?: Partial<LayoutConfig>
): LayoutResult {
    const config: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, ...options };
    const orderedBuckets = orderCoursesByBarycenter(courses, config.semestersCount);

    const nodes: CourseLayoutNode[] = [];
    const edges: Edge[] = [];
    const courseIdSet = new Set(courses.map((c) => c.id));

    // Build nodes
    for (let sem = 1; sem <= config.semestersCount; sem++) {
        const bucket = orderedBuckets.get(sem) ?? [];

        bucket.forEach((course, slotIndex) => {
            const x = getSemesterXCoordinate(sem, config);
            const y = getNodeYCoordinate(slotIndex, config);
            const isMultiSemester = (course.durationSemesters ?? 1) > 1;
            const spanSemesters = Math.max(1, course.durationSemesters ?? 1);

            // Span width across multiple semester columns if applicable
            const spanWidth = isMultiSemester
                ? config.nodeWidth + (spanSemesters - 1) * config.columnWidth
                : config.nodeWidth;

            const node: CourseLayoutNode = {
                id: course.id,
                type: 'courseNode',
                position: { x, y },
                data: {
                    course,
                    isMultiSemester,
                    durationSemesters: spanSemesters,
                    spanWidth,
                    semesterIndex: sem,
                    slotIndex,
                },
            };

            nodes.push(node);

            // Build directed prerequisite edges: Prerequisite (source) -> Dependent (target)
            const prereqIds = extractPrerequisiteCourseIds(course.prerequisiteRule);
            for (const prereqId of prereqIds) {
                if (courseIdSet.has(prereqId)) {
                    edges.push({
                        id: `e-${prereqId}-${course.id}`,
                        source: prereqId,
                        target: course.id,
                        type: 'smoothstep',
                        animated: false,
                        data: {
                            isPrerequisite: true,
                        },
                    });
                }
            }

            // Build co-requisite edges if present
            if (Array.isArray(course.corequisites)) {
                for (const coreqId of course.corequisites) {
                    if (courseIdSet.has(coreqId)) {
                        edges.push({
                            id: `e-coreq-${coreqId}-${course.id}`,
                            source: coreqId,
                            target: course.id,
                            type: 'smoothstep',
                            animated: false,
                            style: { strokeDasharray: '5,5' },
                            data: {
                                isCorequisite: true,
                            },
                        });
                    }
                }
            }
        });
    }

    // Build semester column metadata
    const columns: SemesterColumnMetadata[] = [];
    for (let sem = 1; sem <= config.semestersCount; sem++) {
        columns.push({
            semesterIndex: sem,
            x: getSemesterXCoordinate(sem, config),
            width: config.columnWidth,
            courseCount: orderedBuckets.get(sem)?.length ?? 0,
        });
    }

    return { nodes, edges, columns };
}

/**
 * Convenience helper to calculate layout directly from a DegreeProgram container.
 */
export function calculateDegreeLayout(
    program: DegreeProgram,
    options?: Partial<LayoutConfig>
): LayoutResult {
    return calculateLayout(program.courses, {
        semestersCount: program.semestersCount,
        ...options,
    });
}
