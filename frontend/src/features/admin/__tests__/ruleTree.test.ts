import { describe, expect, it } from 'vitest';
import {
    MAX_AST_RECURSION_DEPTH,
    evaluatePrerequisite,
    findRuleIssues,
    formatPrerequisiteRule,
} from '@/core/algorithms/ast_evaluator';
import { getProgramCourses } from '@/data/mockCourses';
import {
    addAtRoot,
    addChild,
    canAddChild,
    findEditorIssues,
    issueNodePath,
    newGroup,
    nodeAt,
    removeNode,
    setOperator,
    toFriendlyIssue,
    updateNode,
} from '@/features/admin/utils/ruleTree';
import type { PrerequisiteRule } from '@/types/curriculum';

const course = (courseId: string): PrerequisiteRule => ({ type: 'COURSE', courseId });
const credits = (minCredits: number): PrerequisiteRule => ({ type: 'CREDIT_THRESHOLD', minCredits });

describe('prerequisite rule tree editing (CF-213)', () => {
    it('builds (CO221 AND CO222) OR (CO225 AND ≥ 45 Credits) step by step, as the editor does', () => {
        let rule = addAtRoot(null, course('CO221'));
        rule = addAtRoot(rule, course('CO222'));
        rule = addAtRoot(rule, newGroup('AND'));
        // The new group starts with an empty course condition; fill it and add the credit threshold.
        rule = updateNode(rule, [2, 0], course('CO225'));
        rule = addChild(rule, [2], credits(45));
        // Regroup: (CO221 AND CO222) OR (CO225 AND ≥ 45)
        const firstPair: PrerequisiteRule = { type: 'AND', children: [course('CO221'), course('CO222')] };
        rule = { type: 'OR', children: [firstPair, nodeAt(rule, [2])] };

        expect(rule).toEqual({
            type: 'OR',
            children: [
                { type: 'AND', children: [course('CO221'), course('CO222')] },
                { type: 'AND', children: [course('CO225'), credits(45)] },
            ],
        });
        expect(formatPrerequisiteRule(rule)).toBe('(CO221 AND CO222) OR (CO225 AND ≥ 45 Credits)');
        expect(findRuleIssues(rule)).toEqual([]);
        expect(evaluatePrerequisite(rule, ['CO221', 'CO222'], 0)).toBe(true);
        expect(evaluatePrerequisite(rule, ['CO225'], 44)).toBe(false);
        expect(evaluatePrerequisite(rule, ['CO225'], 45)).toBe(true);
    });

    it('serialises to plain JSON matching the PrerequisiteRule contract', () => {
        const rule = addChild(addAtRoot(null, newGroup('OR')), [], credits(30));

        expect(JSON.parse(JSON.stringify(rule))).toEqual({
            type: 'OR',
            children: [{ type: 'COURSE', courseId: '' }, { type: 'CREDIT_THRESHOLD', minCredits: 30 }],
        });
    });

    describe('addAtRoot', () => {
        it('starts a rule from nothing', () => {
            expect(addAtRoot(null, credits(30))).toEqual(credits(30));
        });

        it('joins a single condition with AND so students need both', () => {
            expect(addAtRoot(course('CO221'), credits(30))).toEqual({
                type: 'AND',
                children: [course('CO221'), credits(30)],
            });
        });

        it('appends to an existing root group, keeping its operator', () => {
            const rule: PrerequisiteRule = { type: 'OR', children: [course('CO221')] };

            expect(addAtRoot(rule, course('CO222'))).toEqual({ type: 'OR', children: [course('CO221'), course('CO222')] });
        });
    });

    describe('removeNode', () => {
        const rule: PrerequisiteRule = {
            type: 'AND',
            children: [course('CO221'), { type: 'OR', children: [course('CO222'), credits(30)] }],
        };

        it('removes a nested condition without touching its siblings', () => {
            expect(removeNode(rule, [1, 0])).toEqual({ type: 'AND', children: [course('CO221'), { type: 'OR', children: [credits(30)] }] });
        });

        it('clears the rule when the root is removed', () => {
            expect(removeNode(rule, [])).toBeNull();
        });

        it('leaves the original tree unchanged', () => {
            const before = JSON.stringify(rule);
            removeNode(rule, [1]);
            expect(JSON.stringify(rule)).toBe(before);
        });
    });

    it('switches a group between AND and OR, keeping its children', () => {
        const rule: PrerequisiteRule = { type: 'AND', children: [course('CO221'), { type: 'AND', children: [course('CO222')] }] };

        expect(setOperator(rule, [1], 'OR')).toEqual({
            type: 'AND',
            children: [course('CO221'), { type: 'OR', children: [course('CO222')] }],
        });
    });

    describe('canAddChild', () => {
        it('allows a condition up to depth 20 and a group only where its first condition still fits', () => {
            const depth18 = Array<number>(MAX_AST_RECURSION_DEPTH - 2).fill(0);
            const depth19 = Array<number>(MAX_AST_RECURSION_DEPTH - 1).fill(0);
            const depth20 = Array<number>(MAX_AST_RECURSION_DEPTH).fill(0);

            // A group added under depth 18 sits at 19 and its first condition at 20: allowed.
            expect(canAddChild(depth18, 'group')).toBe(true);
            // Under depth 19 the new group's first condition would land at 21.
            expect(canAddChild(depth19, 'condition')).toBe(true);
            expect(canAddChild(depth19, 'group')).toBe(false);
            expect(canAddChild(depth20, 'condition')).toBe(false);
            expect(canAddChild(depth20, 'group')).toBe(false);
            expect(canAddChild([], 'group')).toBe(true);
        });
    });

    describe('findEditorIssues', () => {
        const catalog = new Set(getProgramCourses('computer-eng').map((entry) => entry.id));

        it('accepts a real catalog rule from either program', () => {
            for (const programId of ['computer-eng', 'electrical-eng']) {
                const courses = getProgramCourses(programId);
                const ids = new Set(courses.map((entry) => entry.id));
                for (const entry of courses) {
                    if (entry.prerequisiteRule) {
                        expect(findEditorIssues(entry.prerequisiteRule, entry.id, ids)).toEqual([]);
                    }
                }
            }
        });

        it.each([Number.NaN, -1, 2.5])('flags a credit threshold of %s', (minCredits) => {
            const rule: PrerequisiteRule = { type: 'AND', children: [course('EC3301'), credits(minCredits)] };

            expect(findEditorIssues(rule, 'EC5202', catalog)).toEqual([
                { path: ['children', 1, 'minCredits'], message: 'Enter whole credits, 0 or more.' },
            ]);
        });

        it('includes the shared structural checks', () => {
            const issues = findEditorIssues({ type: 'OR', children: [course('EC5202'), course('ZZ9999')] }, 'EC5202', catalog);

            expect(issues.map(issueNodePath)).toEqual([[0], [1]]);
        });
    });

    describe('toFriendlyIssue', () => {
        it.each([
            ['courseId must not be blank.', 'Choose a course.'],
            ['A course cannot be its own prerequisite (EC5202).', "A course can't require itself."],
            ["Unknown course 'ZZ9999': it does not exist in the catalog.", "ZZ9999 isn't a course in this program."],
            ['OR node must have at least one child.', 'Add at least one condition to this group, or remove it.'],
            ['This rule would create a circular dependency: A -> B -> A.', 'This rule would create a circular dependency: A -> B -> A.'],
        ])('rewords %j', (message, friendly) => {
            expect(toFriendlyIssue({ path: [], message }).message).toBe(friendly);
        });
    });
});
