import type { Course, PrerequisiteRule } from '@/types/curriculum';

// ==========================================
// 1. Result Types & Interfaces
// ==========================================

export interface PrerequisiteEvaluationResult {
    isSatisfied: boolean;
    missingCourseIds: string[];
    creditDeficit: number;
    summary: string;
}

export interface PlannedPrerequisiteEvaluationResult {
    isSatisfied: boolean;
    status: 'no_prereqs' | 'satisfied' | 'unmet';
    missingCourseIds: string[];
    creditDeficit: number;
    summary: string;
}

// ==========================================
// 2. Core AST Evaluation Engine
// ==========================================

/**
 * Normalizes completed course collections into a Set<string> for O(1) membership lookups.
 */
function normalizeCompletedSet(completed: Set<string> | readonly string[]): Set<string> {
    if (completed instanceof Set) {
        return completed;
    }
    return new Set(completed);
}

const MAX_AST_RECURSION_DEPTH = 20;

/**
 * Evaluates a recursive boolean Prerequisite AST against a student's completed courses
 * and total earned credits.
 *
 * Rules:
 * - null: Unconditional pass (returns true).
 * - COURSE: true if completedCourses contains rule.courseId.
 * - CREDIT_THRESHOLD: true if minCredits >= 0 and earnedCredits >= rule.minCredits.
 * - AND: true if every child rule evaluates to true (vacuously true for empty children).
 * - OR: true if at least one child rule evaluates to true (false for empty children).
 * - depth > 20: terminates recursion and returns false (defensive guard against cyclic/malformed trees).
 */
export function evaluatePrerequisite(
    rule: PrerequisiteRule | null,
    completedCourses: Set<string> | readonly string[],
    earnedCredits: number,
    depth = 0
): boolean {
    if (!rule) {
        return true;
    }

    if (depth > MAX_AST_RECURSION_DEPTH) {
        return false;
    }

    const completedSet = normalizeCompletedSet(completedCourses);

    switch (rule.type) {
        case 'COURSE':
            return completedSet.has(rule.courseId);

        case 'CREDIT_THRESHOLD':
            return rule.minCredits >= 0 && earnedCredits >= rule.minCredits;

        case 'AND':
            if (rule.children.length === 0) {
                return true;
            }
            return rule.children.every((child) =>
                evaluatePrerequisite(child, completedSet, earnedCredits, depth + 1)
            );

        case 'OR':
            if (rule.children.length === 0) {
                return false;
            }
            return rule.children.some((child) =>
                evaluatePrerequisite(child, completedSet, earnedCredits, depth + 1)
            );

        default:
            return false;
    }
}

// ==========================================
// 3. Detailed Diagnostic Evaluator
// ==========================================

/**
 * Evaluates an AST rule and gathers granular diagnostic details on why a prerequisite
 * is unsatisfied (missing courses, credit deficit, and human-readable explanation).
 */
export function evaluatePrerequisiteWithDiagnostics(
    rule: PrerequisiteRule | null,
    completedCourses: Set<string> | readonly string[],
    earnedCredits: number
): PrerequisiteEvaluationResult {
    if (!rule) {
        return {
            isSatisfied: true,
            missingCourseIds: [],
            creditDeficit: 0,
            summary: 'No prerequisites required',
        };
    }

    const completedSet = normalizeCompletedSet(completedCourses);
    const isSatisfied = evaluatePrerequisite(rule, completedSet, earnedCredits);

    const missingCourseIds: string[] = [];
    let creditDeficit = 0;

    function collectUnmetNodes(node: PrerequisiteRule, depth = 0): void {
        if (depth > MAX_AST_RECURSION_DEPTH) {
            return;
        }

        switch (node.type) {
            case 'COURSE':
                if (!completedSet.has(node.courseId)) {
                    missingCourseIds.push(node.courseId);
                }
                break;

            case 'CREDIT_THRESHOLD':
                if (node.minCredits < 0 || earnedCredits < node.minCredits) {
                    const target = Math.max(0, node.minCredits);
                    const deficit = target - earnedCredits;
                    creditDeficit = Math.max(creditDeficit, deficit);
                }
                break;

            case 'AND':
                for (const child of node.children) {
                    collectUnmetNodes(child, depth + 1);
                }
                break;

            case 'OR':
                // In an OR branch, if the branch as a whole is not satisfied,
                // we report alternatives from unsatisfied children
                if (!evaluatePrerequisite(node, completedSet, earnedCredits, depth)) {
                    for (const child of node.children) {
                        collectUnmetNodes(child, depth + 1);
                    }
                }
                break;
        }
    }

    if (!isSatisfied) {
        collectUnmetNodes(rule);
    }

    // Deduplicate missing course IDs
    const uniqueMissingCourses = Array.from(new Set(missingCourseIds));

    let summary = 'Prerequisites satisfied';
    if (!isSatisfied) {
        const issues: string[] = [];
        if (uniqueMissingCourses.length > 0) {
            issues.push(`Requires: ${uniqueMissingCourses.join(', ')}`);
        }
        if (creditDeficit > 0) {
            issues.push(`Requires ${creditDeficit} more credit${creditDeficit === 1 ? '' : 's'}`);
        }
        summary = issues.length > 0 ? issues.join('; ') : 'Prerequisites unmet';
    }

    return {
        isSatisfied,
        missingCourseIds: uniqueMissingCourses,
        creditDeficit,
        summary,
    };
}

// ==========================================
// 4. Degree Planning Prospective Prerequisite Evaluator
// ==========================================

/**
 * Evaluates course prerequisites within a prospective degree planning context.
 *
 * Rules:
 * a) Mandatory courses (CORE, LAB, CAPSTONE) with recommendedSemester < course.recommendedSemester are satisfied.
 * b) Elective courses in selectedElectiveIds with recommendedSemester < course.recommendedSemester are satisfied.
 * c) If recommendedSemester is equal or undefined, checks if the course is in the planned set.
 * d) For CREDIT_THRESHOLD rules, checks if total planned credits in semesters strictly prior to
 *    course.recommendedSemester >= minCredits.
 */
export function evaluatePlannedPrerequisite(
    course: Course,
    allProgramCourses: readonly Course[],
    selectedElectiveIds: readonly string[]
): {
    isSatisfied: boolean;
    status: 'no_prereqs' | 'satisfied' | 'unmet';
    missingCourseIds: string[];
    creditDeficit: number;
    summary: string;
} {
    if (!course.prerequisiteRule) {
        return {
            isSatisfied: true,
            status: 'no_prereqs',
            missingCourseIds: [],
            creditDeficit: 0,
            summary: 'No prerequisites required',
        };
    }

    const selectedElectiveSet = new Set(selectedElectiveIds);
    const courseMap = new Map<string, Course>();
    for (const c of allProgramCourses) {
        courseMap.set(c.id, c);
        if (c.code) {
            courseMap.set(c.code, c);
        }
    }

    // Helper to evaluate if a target prerequisite course is satisfied in the plan
    function isCoursePrereqSatisfied(targetCourseId: string): boolean {
        const target = courseMap.get(targetCourseId);
        if (!target) {
            // Course not found in catalog: satisfied only if student explicitly selected it
            return selectedElectiveSet.has(targetCourseId);
        }

        const isMandatory = target.type === 'CORE' || target.type === 'LAB' || target.type === 'CAPSTONE';
        const isSelectedElective = selectedElectiveSet.has(target.id) || selectedElectiveSet.has(target.code);
        const isInPlannedSet = isMandatory || isSelectedElective;

        if (!isInPlannedSet) {
            return false;
        }

        const targetSem = target.recommendedSemester;
        const currentSem = course.recommendedSemester;

        // If semester is equal or undefined, check if it is in the planned set
        if (targetSem === undefined || currentSem === undefined || targetSem === currentSem) {
            return true;
        }

        if (targetSem < currentSem) {
            return true;
        }

        // targetSem > currentSem: course appears later in the curriculum
        return false;
    }

    // Calculate total planned credits strictly prior to course.recommendedSemester
    const currentSem = course.recommendedSemester;
    let priorPlannedCredits = 0;

    for (const c of allProgramCourses) {
        const isMandatory = c.type === 'CORE' || c.type === 'LAB' || c.type === 'CAPSTONE';
        const isSelected = selectedElectiveSet.has(c.id) || selectedElectiveSet.has(c.code);
        if (!isMandatory && !isSelected) {
            continue;
        }

        if (Array.isArray(c.creditDistribution) && c.creditDistribution.length > 0) {
            for (const dist of c.creditDistribution) {
                if (currentSem === undefined || dist.semesterIndex < currentSem) {
                    priorPlannedCredits += dist.creditsAllocated;
                }
            }
        } else if (currentSem === undefined || (c.recommendedSemester !== undefined && c.recommendedSemester < currentSem)) {
            priorPlannedCredits += c.totalCredits;
        }
    }

    // Recursive boolean rule evaluator
    function evalRule(node: PrerequisiteRule): boolean {
        switch (node.type) {
            case 'COURSE':
                return isCoursePrereqSatisfied(node.courseId);

            case 'CREDIT_THRESHOLD':
                return priorPlannedCredits >= node.minCredits;

            case 'AND':
                if (node.children.length === 0) return true;
                return node.children.every((child) => evalRule(child));

            case 'OR':
                if (node.children.length === 0) return false;
                return node.children.some((child) => evalRule(child));

            default:
                return false;
        }
    }

    const isSatisfied = evalRule(course.prerequisiteRule);
    const missingCourseIds: string[] = [];
    let creditDeficit = 0;

    function collectUnmetNodes(node: PrerequisiteRule): void {
        switch (node.type) {
            case 'COURSE':
                if (!isCoursePrereqSatisfied(node.courseId)) {
                    missingCourseIds.push(node.courseId);
                }
                break;

            case 'CREDIT_THRESHOLD':
                if (priorPlannedCredits < node.minCredits) {
                    const deficit = node.minCredits - priorPlannedCredits;
                    creditDeficit = Math.max(creditDeficit, deficit);
                }
                break;

            case 'AND':
                for (const child of node.children) {
                    collectUnmetNodes(child);
                }
                break;

            case 'OR':
                if (!evalRule(node)) {
                    for (const child of node.children) {
                        collectUnmetNodes(child);
                    }
                }
                break;
        }
    }

    if (!isSatisfied) {
        collectUnmetNodes(course.prerequisiteRule);
    }

    const uniqueMissingCourses = Array.from(new Set(missingCourseIds));
    let summary = 'Prerequisites satisfied';

    if (!isSatisfied) {
        const issues: string[] = [];
        if (uniqueMissingCourses.length > 0) {
            issues.push(`Requires: ${uniqueMissingCourses.join(', ')}`);
        }
        if (creditDeficit > 0) {
            issues.push(`Requires ${creditDeficit} more credit${creditDeficit === 1 ? '' : 's'}`);
        }
        summary = issues.length > 0 ? issues.join('; ') : 'Prerequisites unmet';
    }

    return {
        isSatisfied,
        status: isSatisfied ? 'satisfied' : 'unmet',
        missingCourseIds: uniqueMissingCourses,
        creditDeficit,
        summary,
    };
}

// ==========================================
// 5. Human-Readable AST Formatter
// ==========================================

/**
 * Converts a recursive PrerequisiteRule AST into a clear, formatted mathematical/logical string.
 * e.g., "(EC101 AND EC102) OR (EC105 AND ≥ 30 Credits)"
 */
export function formatPrerequisiteRule(rule: PrerequisiteRule | null): string {
    if (!rule) {
        return 'None';
    }

    switch (rule.type) {
        case 'COURSE':
            return rule.courseId;

        case 'CREDIT_THRESHOLD':
            return `≥ ${rule.minCredits} Credits`;

        case 'AND': {
            if (rule.children.length === 0) {
                return 'None';
            }
            const childrenText = rule.children.map((child) => {
                const text = formatPrerequisiteRule(child);
                return child.type === 'OR' ? `(${text})` : text;
            });
            return childrenText.join(' AND ');
        }

        case 'OR': {
            if (rule.children.length === 0) {
                return 'None';
            }
            const childrenText = rule.children.map((child) => {
                const text = formatPrerequisiteRule(child);
                return child.type === 'AND' ? `(${text})` : text;
            });
            return childrenText.join(' OR ');
        }

        default:
            return '';
    }
}

// ==========================================
// 6. Course Progression Helpers
// ==========================================

/**
 * Checks if a specific course is unlocked and ready to be taken given completed courses and credits.
 */
export function isCourseUnlocked(
    course: Course,
    completedCourses: Set<string> | readonly string[],
    earnedCredits: number
): boolean {
    return evaluatePrerequisite(course.prerequisiteRule, completedCourses, earnedCredits);
}

/**
 * Calculates total credits earned from a set of completed course IDs against a catalog.
 */
export function calculateEarnedCredits(
    completedCourseIds: Set<string> | readonly string[],
    allCourses: readonly Course[]
): number {
    const completedSet = normalizeCompletedSet(completedCourseIds);
    let total = 0;
    for (const course of allCourses) {
        if (completedSet.has(course.id)) {
            total += course.totalCredits;
        }
    }
    return total;
}
