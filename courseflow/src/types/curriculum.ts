// ==========================================
// 1. Prerequisite Abstract Syntax Tree (AST)
// ==========================================

export type RuleType = 'AND' | 'OR' | 'COURSE' | 'CREDIT_THRESHOLD';

export interface CourseRuleNode {
    type: 'COURSE';
    courseId: string; // Course code, e.g., "EC101"
}

export interface CreditThresholdRuleNode {
    type: 'CREDIT_THRESHOLD';
    minCredits: number; // e.g., 30
}

export interface LogicalRuleNode {
    type: 'AND' | 'OR';
    children: PrerequisiteRule[];
}

export type PrerequisiteRule =
    | CourseRuleNode
    | CreditThresholdRuleNode
    | LogicalRuleNode;

// ==========================================
// 2. Course & Multi-Semester Credit Modeling
// ==========================================

export type CourseType = 'CORE' | 'ELECTIVE' | 'LAB' | 'CAPSTONE';

export interface CreditDistribution {
    semesterIndex: number; // Discrete term: 1 to 8
    creditsAllocated: number; // Credits counted toward this semester's load
}

export interface Course {
    id: string; // Unique primary identifier (e.g., "CO544")
    code: string; // Official display code
    title: string;
    description: string;
    totalCredits: number;
    durationSemesters: number; // Default: 1. (Multi-semester modules: 2)
    recommendedSemester: number; // 1 through 8
    creditDistribution: CreditDistribution[]; // Splits credits across terms
    type: CourseType;
    prerequisiteRule: PrerequisiteRule | null;
    corequisites: string[]; // Course IDs required concurrently
    offeredSemesters: ('SEMESTER_1' | 'SEMESTER_2' | 'BOTH')[];
}

// ==========================================
// 3. Degree Program Container
// ==========================================

export interface DegreeProgram {
    id: string; // e.g., "computer-eng"
    name: string; // "Computer Engineering"
    department: string;
    totalCreditsRequired: number; // 150
    minCreditsPerSemester: number; // 18
    maxCreditsPerSemester: number; // 24
    semestersCount: number; // 8
    courses: Course[];
}