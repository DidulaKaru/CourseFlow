import { describe, expect, it } from 'vitest';
import { findRuleIssues } from '@/core/algorithms/ast_evaluator';
import type { RuleIssue } from '@/core/algorithms/ast_evaluator';
import type { PrerequisiteRule } from '@/types/curriculum';
import sharedCases from './fixtures/rule_issue_cases.json';

interface SharedIssue {
    chainPrefix?: number;
    path: (string | number)[];
    message: string;
}

interface SharedCase {
    name: string;
    chain?: number;
    rule: PrerequisiteRule;
    courseId?: string;
    knownCourseIds?: string[];
    issues: SharedIssue[];
}

function wrapInChain(rule: PrerequisiteRule, levels: number): PrerequisiteRule {
    let node = rule;
    for (let level = 0; level < levels; level += 1) node = { type: 'AND', children: [node] };
    return node;
}

function expectedIssue({ chainPrefix = 0, path, message }: SharedIssue): RuleIssue {
    const prefix = Array.from({ length: chainPrefix }, () => ['children', 0]).flat();
    return { path: [...prefix, ...path], message };
}

// The same table runs in backend/tests/test_ast.py against find_rule_issues, so the editor
// and the admin API can never disagree about which rules are valid.
const cases = (sharedCases as { cases: SharedCase[] }).cases;

describe('findRuleIssues parity with the backend validator (CF-213)', () => {
    it.each(cases.map((testCase) => [testCase.name, testCase] as const))('%s', (_name, testCase) => {
        const issues = findRuleIssues(wrapInChain(testCase.rule, testCase.chain ?? 0), {
            courseId: testCase.courseId,
            knownCourseIds: testCase.knownCourseIds ? new Set(testCase.knownCourseIds) : undefined,
        });

        expect(issues).toEqual(testCase.issues.map(expectedIssue));
    });
});
