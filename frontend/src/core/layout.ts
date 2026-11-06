import type { Edge, Node } from '@xyflow/react';
import type { Course, DegreeProgram, PrerequisiteRule } from '@/types/curriculum';

// ==========================================
// 1. Layout Configuration & Constants
// ==========================================

export interface LayoutConfig {
    nodeWidth: number;
    nodeHeight: number;
    horizontalGap: number;
    verticalGap: number;
    semesterGap: number;
    headerHeight: number;
    headerGap: number;
    topPadding: number;
    leftPadding: number;
    maxColumns: number;
    semestersCount: number;
    // Backward compatibility aliases
    columnWidth?: number;
    columnOffset?: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
    nodeWidth: 240,
    nodeHeight: 110,
    horizontalGap: 20,
    verticalGap: 24,
    semesterGap: 60,
    headerHeight: 54,
    headerGap: 16,
    topPadding: 50,
    leftPadding: 60,
    maxColumns: 5,
    semestersCount: 8,
    columnWidth: 280,
    columnOffset: 40,
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
    colIndex?: number;
    rowIndex?: number;
}

export type CourseLayoutNode = Node<CourseNodeData, 'courseNode'>;

export interface SwimlaneHeaderNodeData extends Record<string, unknown> {
    semesterIndex: number;
    courseCount: number;
    width: number;
}

export type SwimlaneHeaderLayoutNode = Node<SwimlaneHeaderNodeData, 'swimlaneHeader'>;

export interface SemesterMetadata {
    semesterIndex: number;
    y: number;
    height: number;
    courseCount: number;
    width: number;
}

export interface SemesterColumnMetadata {
    semesterIndex: number;
    x: number;
    width: number;
    courseCount: number;
}

export interface LayoutResult {
    nodes: (CourseLayoutNode | SwimlaneHeaderLayoutNode)[];
    edges: Edge[];
    columns: SemesterColumnMetadata[];
    semesters: SemesterMetadata[];
}

// ==========================================
// 3. Mathematical Coordinate Calculators
// ==========================================

/**
 * Calculates the vertical Y coordinate for the start of a semester section (1-indexed).
 * Evaluates the actual number of course rows required by preceding semesters to prevent overlaps.
 */
export function getSemesterYCoordinate(
    semesterIndex: number,
    coursesPerSemester: Map<number, number> | number[],
    config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): number {
    let y = config.topPadding;
    for (let sem = 1; sem < semesterIndex; sem++) {
        const count = Array.isArray(coursesPerSemester)
            ? (coursesPerSemester[sem - 1] ?? 0)
            : (coursesPerSemester.get(sem) ?? 0);
        const rows = Math.max(1, Math.ceil(count / config.maxColumns));
        const coursesHeight = rows * config.nodeHeight + (rows - 1) * config.verticalGap;
        const semHeight = config.headerHeight + config.headerGap + coursesHeight;
        y += semHeight + config.semesterGap;
    }
    return y;
}

/**
 * Calculates horizontal X and vertical Y coordinates for a course node slot within a semester (1-indexed semester, 0-indexed slot).
 */
export function getNodeCoordinates(
    semesterIndex: number,
    slotIndex: number,
    coursesPerSemester: Map<number, number> | number[],
    config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): { x: number; y: number; colIndex: number; rowIndex: number } {
    const semY = getSemesterYCoordinate(semesterIndex, coursesPerSemester, config);
    const colIndex = slotIndex % config.maxColumns;
    const rowIndex = Math.floor(slotIndex / config.maxColumns);

    const x = config.leftPadding + colIndex * (config.nodeWidth + config.horizontalGap);
    const y = semY + config.headerHeight + config.headerGap + rowIndex * (config.nodeHeight + config.verticalGap);

    return { x, y, colIndex, rowIndex };
}

/**
 * Backward compatibility helper for legacy tests.
 */
export function getSemesterXCoordinate(
    semesterIndex: number,
    config: Pick<LayoutConfig, 'columnWidth' | 'columnOffset'> = DEFAULT_LAYOUT_CONFIG
): number {
    const colWidth = config.columnWidth ?? DEFAULT_LAYOUT_CONFIG.columnWidth ?? 280;
    const colOffset = config.columnOffset ?? DEFAULT_LAYOUT_CONFIG.columnOffset ?? 40;
    return (semesterIndex - 1) * colWidth + colOffset;
}

/**
 * Backward compatibility helper for legacy tests.
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
// 5. Horizontal Barycentric Ordering Heuristic
// ==========================================

/**
 * Priority weighting for course types when resolving initial placement:
 * CORE (0) -> LAB (1) -> CAPSTONE (2) -> ELECTIVE (3).
 */
export function getCourseTypePriority(type: Course['type']): number {
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
 * Computes optimal horizontal ordering for courses within each discrete semester row
 * using a barycentric heuristic to minimize prerequisite edge crossings.
 *
 * For each course in semester S, its barycenter is the average horizontal column index
 * of all its prerequisite courses in previous semesters (< S).
 */
export function orderCoursesByBarycenter(
    courses: Course[],
    semestersCount = DEFAULT_LAYOUT_CONFIG.semestersCount,
    maxColumns = DEFAULT_LAYOUT_CONFIG.maxColumns
): Map<number, Course[]> {
    // 1. Group courses into discrete semester buckets
    const semesterBuckets = new Map<number, Course[]>();
    for (let sem = 1; sem <= semestersCount; sem++) {
        semesterBuckets.set(sem, []);
    }

    for (const course of courses) {
        const targetSemester = Math.min(
            Math.max(1, course.recommendedSemester || 1),
            semestersCount
        );
        const bucket = semesterBuckets.get(targetSemester);
        if (bucket) {
            bucket.push(course);
        }
    }

    // 2. Track assigned horizontal column index: courseId -> colIndex
    const assignedColumns = new Map<string, number>();

    const orderedBuckets = new Map<number, Course[]>();

    for (let sem = 1; sem <= semestersCount; sem++) {
        const bucket = semesterBuckets.get(sem) ?? [];

        if (sem === 1) {
            // Semester 1: sort by academic type priority and course code
            bucket.sort((a, b) => {
                const priorityDiff = getCourseTypePriority(a.type) - getCourseTypePriority(b.type);
                if (priorityDiff !== 0) return priorityDiff;
                return a.code.localeCompare(b.code);
            });
        } else {
            // Compute horizontal barycenters based on upstream prerequisites
            const barycenters = new Map<string, number>();

            for (const course of bucket) {
                const prereqIds = extractPrerequisiteCourseIds(course.prerequisiteRule);
                const placedPrereqCols: number[] = [];

                for (const pid of prereqIds) {
                    if (assignedColumns.has(pid)) {
                        placedPrereqCols.push(assignedColumns.get(pid)!);
                    }
                }

                if (placedPrereqCols.length > 0) {
                    const sum = placedPrereqCols.reduce((acc, curr) => acc + curr, 0);
                    barycenters.set(course.id, sum / placedPrereqCols.length);
                } else {
                    // Fallback: anchor using course type
                    barycenters.set(course.id, 10 + getCourseTypePriority(course.type));
                }
            }

            bucket.sort((a, b) => {
                // Priority 1: Course Type (CORE first, then LAB, CAPSTONE, ELECTIVE)
                const priorityDiff = getCourseTypePriority(a.type) - getCourseTypePriority(b.type);
                if (priorityDiff !== 0) return priorityDiff;

                // Priority 2: Barycenter (align under upstream prerequisites)
                const bA = barycenters.get(a.id) ?? 0;
                const bB = barycenters.get(b.id) ?? 0;
                if (Math.abs(bA - bB) > 0.0001) {
                    return bA - bB;
                }

                // Priority 3: Alphabetical course code
                return a.code.localeCompare(b.code);
            });
        }

        // Record column index (col = index % maxColumns)
        bucket.forEach((course, index) => {
            assignedColumns.set(course.id, index % maxColumns);
        });

        orderedBuckets.set(sem, bucket);
    }

    return orderedBuckets;
}

// ==========================================
// 6. Complete Layout Engine (calculateLayout)
// ==========================================

/**
 * Transforms an array of courses into deterministic React Flow nodes and edges in a Top-to-Bottom flow.
 *
 * Guaranteed Invariants:
 * 1. Semesters are stacked strictly from Top to Bottom: Y increases monotonically with semester.
 * 2. Courses within each semester are laid out in clean rows of maxColumns with guaranteed horizontal and vertical spacing.
 * 3. Every node coordinate is deterministic and strictly non-overlapping.
 * 4. Edges flow downward from earlier prerequisites (source: Bottom) into downstream courses (target: Top).
 */
export function calculateLayout(
    courses: Course[],
    options?: Partial<LayoutConfig>
): LayoutResult {
    const config: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, ...options };
    const orderedBuckets = orderCoursesByBarycenter(courses, config.semestersCount, config.maxColumns);

    const courseCounts = new Map<number, number>();
    for (let sem = 1; sem <= config.semestersCount; sem++) {
        courseCounts.set(sem, orderedBuckets.get(sem)?.length ?? 0);
    }

    const contentWidth = config.maxColumns * config.nodeWidth + (config.maxColumns - 1) * config.horizontalGap;

    const nodes: (CourseLayoutNode | SwimlaneHeaderLayoutNode)[] = [];
    const edges: Edge[] = [];
    const courseIdSet = new Set(courses.map((c) => c.id));
    const semesters: SemesterMetadata[] = [];
    const columns: SemesterColumnMetadata[] = [];

    for (let sem = 1; sem <= config.semestersCount; sem++) {
        const bucket = orderedBuckets.get(sem) ?? [];
        const count = bucket.length;
        const rows = Math.max(1, Math.ceil(count / config.maxColumns));
        const coursesHeight = rows * config.nodeHeight + (rows - 1) * config.verticalGap;
        const semHeight = config.headerHeight + config.headerGap + coursesHeight;
        const semY = getSemesterYCoordinate(sem, courseCounts, config);

        // 1. Add Semester Header Node
        const headerNode: SwimlaneHeaderLayoutNode = {
            id: `sem-header-${sem}`,
            type: 'swimlaneHeader',
            position: { x: config.leftPadding, y: semY },
            data: {
                semesterIndex: sem,
                courseCount: count,
                width: contentWidth,
            },
            selectable: false,
            draggable: false,
            deletable: false,
        };
        nodes.push(headerNode);

        // Record metadata
        semesters.push({
            semesterIndex: sem,
            y: semY,
            height: semHeight,
            courseCount: count,
            width: contentWidth,
        });

        columns.push({
            semesterIndex: sem,
            x: config.leftPadding,
            width: contentWidth,
            courseCount: count,
        });

        // 2. Add Course Nodes
        bucket.forEach((course, slotIndex) => {
            const { x, y, colIndex, rowIndex } = getNodeCoordinates(sem, slotIndex, courseCounts, config);
            const isMultiSemester = (course.durationSemesters ?? 1) > 1;
            const spanSemesters = Math.max(1, course.durationSemesters ?? 1);

            const node: CourseLayoutNode = {
                id: course.id,
                type: 'courseNode',
                position: { x, y },
                data: {
                    course,
                    isMultiSemester,
                    durationSemesters: spanSemesters,
                    spanWidth: config.nodeWidth,
                    semesterIndex: sem,
                    slotIndex,
                    colIndex,
                    rowIndex,
                },
            };

            nodes.push(node);

            // Prerequisite edges: Prerequisite (source) -> Dependent (target)
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

            // Co-requisite edges
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

    return { nodes, edges, columns, semesters };
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
