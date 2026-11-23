import { MAX_AST_RECURSION_DEPTH, findRuleIssues } from '@/core/algorithms/ast_evaluator';
import type { RuleIssue } from '@/core/algorithms/ast_evaluator';
import type { LogicalRuleNode, PrerequisiteRule } from '@/types/curriculum';

/** Position of a node in the tree: child indexes from the root (the root is `[]`). */
export type NodePath = readonly number[];
export type GroupOperator = LogicalRuleNode['type'];

export const NEW_COURSE_CONDITION: PrerequisiteRule = { type: 'COURSE', courseId: '' };
export const NEW_CREDIT_CONDITION: PrerequisiteRule = { type: 'CREDIT_THRESHOLD', minCredits: 0 };
export const newGroup = (operator: GroupOperator = 'AND'): PrerequisiteRule => ({
    type: operator,
    children: [{ ...NEW_COURSE_CONDITION }],
});

function replaceAt(
    rule: PrerequisiteRule,
    path: NodePath,
    replace: (node: PrerequisiteRule) => PrerequisiteRule | null
): PrerequisiteRule | null {
    if (path.length === 0) return replace(rule);
    if (rule.type !== 'AND' && rule.type !== 'OR') return rule;
    const [index, ...rest] = path;
    const children = rule.children.flatMap((child, childIndex) => {
        if (childIndex !== index) return [child];
        const next = replaceAt(child, rest, replace);
        return next === null ? [] : [next];
    });
    return { ...rule, children };
}

/** Replaces the node at `path`. */
export function updateNode(rule: PrerequisiteRule, path: NodePath, node: PrerequisiteRule): PrerequisiteRule {
    return replaceAt(rule, path, () => node) ?? node;
}

/** Removes the node at `path`; removing the root clears the rule. */
export function removeNode(rule: PrerequisiteRule, path: NodePath): PrerequisiteRule | null {
    return replaceAt(rule, path, () => null);
}

/** Appends a condition to the group at `path`. */
export function addChild(rule: PrerequisiteRule, path: NodePath, child: PrerequisiteRule): PrerequisiteRule {
    return updateNode(rule, path, appendTo(nodeAt(rule, path), child));
}

function appendTo(group: PrerequisiteRule, child: PrerequisiteRule): PrerequisiteRule {
    if (group.type !== 'AND' && group.type !== 'OR') return group;
    return { ...group, children: [...group.children, child] };
}

/** Switches the group at `path` between AND and OR, keeping its children. */
export function setOperator(rule: PrerequisiteRule, path: NodePath, operator: GroupOperator): PrerequisiteRule {
    const group = nodeAt(rule, path);
    if (group.type !== 'AND' && group.type !== 'OR') return rule;
    return updateNode(rule, path, { type: operator, children: group.children });
}

/** Adds a condition at the root: starts a rule, joins a single condition with AND, or appends to the root group. */
export function addAtRoot(rule: PrerequisiteRule | null, child: PrerequisiteRule): PrerequisiteRule {
    if (rule === null) return child;
    if (rule.type === 'AND' || rule.type === 'OR') return appendTo(rule, child);
    return { type: 'AND', children: [rule, child] };
}

export function nodeAt(rule: PrerequisiteRule, path: NodePath): PrerequisiteRule {
    let node = rule;
    for (const index of path) {
        if (node.type !== 'AND' && node.type !== 'OR') break;
        node = node.children[index];
    }
    return node;
}

/** Whether a group at `path` may receive a child of the given kind without exceeding the depth limit. */
export function canAddChild(path: NodePath, child: 'condition' | 'group'): boolean {
    // A group needs one more level for the condition it starts with.
    const deepest = path.length + (child === 'group' ? 2 : 1);
    return deepest <= MAX_AST_RECURSION_DEPTH;
}

/**
 * Everything that would stop the rule saving: the shared structural checks plus credit
 * thresholds the API schema rejects (whole numbers, 0 or more).
 */
export function findEditorIssues(
    rule: PrerequisiteRule,
    courseId: string,
    knownCourseIds: ReadonlySet<string>
): RuleIssue[] {
    const issues = findRuleIssues(rule, { courseId, knownCourseIds });
    const visit = (node: PrerequisiteRule, path: (string | number)[], depth: number) => {
        if (depth > MAX_AST_RECURSION_DEPTH) return;
        if (node.type === 'CREDIT_THRESHOLD' && !(Number.isInteger(node.minCredits) && node.minCredits >= 0)) {
            issues.push({ path: [...path, 'minCredits'], message: 'Enter whole credits, 0 or more.' });
        } else if (node.type === 'AND' || node.type === 'OR') {
            node.children.forEach((child, index) => visit(child, [...path, 'children', index], depth + 1));
        }
    };
    visit(rule, [], 0);
    return issues;
}

/**
 * Rewords the validator's messages (kept identical to the backend's for parity) for the editor.
 * Messages it does not recognise, such as server-only ones, pass through unchanged.
 */
export function toFriendlyIssue(issue: RuleIssue): RuleIssue {
    const { message } = issue;
    const unknown = /^Unknown course '(.*)':/.exec(message);
    let friendly = message;
    if (message === 'courseId must not be blank.') friendly = 'Choose a course.';
    else if (message.startsWith('A course cannot be its own prerequisite')) friendly = "A course can't require itself.";
    else if (unknown) friendly = `${unknown[1]} isn't a course in this program.`;
    else if (message.endsWith('node must have at least one child.')) friendly = 'Add at least one condition to this group, or remove it.';
    return { ...issue, message: friendly };
}

/** The node an issue belongs to: the child indexes in its JSON path. */
export function issueNodePath(issue: RuleIssue): number[] {
    return issue.path.filter((step): step is number => typeof step === 'number');
}

export function samePath(a: NodePath, b: NodePath): boolean {
    return a.length === b.length && a.every((index, position) => index === b[position]);
}
