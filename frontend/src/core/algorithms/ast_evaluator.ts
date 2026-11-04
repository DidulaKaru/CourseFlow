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

/**
 * Evaluates a recursive boolean Prerequisite AST against a student's completed courses
 * and total earned credits.
 *
 * Rules:
 * - null: Unconditional pass (returns true).
 * - COURSE: true if completedCourses contains rule.courseId.
 * - CREDIT_THRESHOLD: true if earnedCredits >= rule.minCredits.
 * - AND: true if every child rule evaluates to true (vacuously true for empty children).
 * - OR: true if at least one child rule evaluates to true (false for empty children).
 */
export function evaluatePrerequisite(
    rule: PrerequisiteRule | null,
    completedCourses: Set<string> | readonly string[],
    earnedCredits: number
): boolean {
    if (!rule) {
        return true;
    }

    const completedSet = normalizeCompletedSet(completedCourses);

    switch (rule.type) {
        case 'COURSE':
            return completedSet.has(rule.courseId);

        case 'CREDIT_THRESHOLD':
            return earnedCredits >= rule.minCredits;

        case 'AND':
            if (rule.children.length === 0) {
                return true;
            }
            return rule.children.every((child) =>
                evaluatePrerequisite(child, completedSet, earnedCredits)
            );

        case 'OR':
            if (rule.children.length === 0) {
                return false;
            }
            return rule.children.some((child) =>
                evaluatePrerequisite(child, completedSet, earnedCredits)
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

    function collectUnmetNodes(node: PrerequisiteRule): void {
        switch (node.type) {
            case 'COURSE':
                if (!completedSet.has(node.courseId)) {
                    missingCourseIds.push(node.courseId);
                }
                break;

            case 'CREDIT_THRESHOLD':
                if (earnedCredits < node.minCredits) {
                    const deficit = node.minCredits - earnedCredits;
                    creditDeficit = Math.max(creditDeficit, deficit);
                }
                break;

            case 'AND':
                for (const child of node.children) {
                    collectUnmetNodes(child);
                }
                break;

            case 'OR':
                // In an OR branch, if the branch as a whole is not satisfied,
                // we report alternatives from unsatisfied children
                if (!evaluatePrerequisite(node, completedSet, earnedCredits)) {
                    for (const child of node.children) {
                        collectUnmetNodes(child);
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
// 4. Human-Readable AST Formatter
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
// 5. Course Progression Helpers
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
