import { useEffect, useMemo } from 'react';
import {
    AlertTriangle,
    ArrowRight,
    Award,
    BookOpen,
    Calendar,
    Check,
    CheckCircle2,
    Clock,
    Layers,
    ListChecks,
    Plus,
    X,
    XCircle,
} from 'lucide-react';

import {
    calculateEarnedCredits,
    evaluatePrerequisiteWithDiagnostics,
    formatPrerequisiteRule,
} from '@/core/algorithms/ast_evaluator';
import { extractPrerequisiteCourseIds } from '@/core/layout';
import { usePlannerStore } from '@/core/store';
import { getProgramCourses } from '@/data/mockCourses';
import type { CourseType } from '@/types/curriculum';

const TYPE_CONFIG: Record<
    CourseType,
    { badge: string; label: string; text: string }
> = {
    CORE: {
        badge: 'border-white/15 text-slate-300 bg-white/5',
        label: 'Core Module',
        text: 'Mandatory core requirement for degree completion.',
    },
    ELECTIVE: {
        badge: 'border-white/15 text-slate-400 bg-white/5',
        label: 'Elective Module',
        text: 'Specialization elective chosen by the student.',
    },
    CAPSTONE: {
        badge: 'border-amber-500/30 text-amber-300 bg-amber-950/20',
        label: 'Capstone Project',
        text: 'Multi-semester comprehensive engineering design project.',
    },
    LAB: {
        badge: 'border-cyan-500/30 text-cyan-300 bg-cyan-950/20',
        label: 'Practical Lab',
        text: 'Hands-on practical laboratory and technical design.',
    },
};

export function ModuleDetailsDrawer() {
    const isDrawerOpen = usePlannerStore((state) => state.isDrawerOpen);
    const inspectedCourse = usePlannerStore((state) => state.inspectedCourse);
    const closeCourseDrawer = usePlannerStore((state) => state.closeCourseDrawer);

    // Planner state & actions
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);
    const completedCourseIds = usePlannerStore((state) => state.completedCourseIds);
    const failedCourseIds = usePlannerStore((state) => state.failedCourseIds);
    const toggleElective = usePlannerStore((state) => state.toggleElective);
    const toggleCompletedCourse = usePlannerStore((state) => state.toggleCompletedCourse);
    const toggleFailedCourse = usePlannerStore((state) => state.toggleFailedCourse);

    // Dismiss drawer on Escape keypress
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isDrawerOpen) {
                closeCourseDrawer();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDrawerOpen, closeCourseDrawer]);

    // Dynamic catalog resolution based on active degree program
    const activeCourses = useMemo(() => getProgramCourses(activeProgramId), [activeProgramId]);

    // Student cumulative credits
    const earnedCredits = useMemo(() => {
        return calculateEarnedCredits(completedCourseIds, activeCourses);
    }, [completedCourseIds, activeCourses]);

    // Prerequisite evaluation diagnostics for inspected course
    const prereqEval = useMemo(() => {
        if (!inspectedCourse) return null;
        return evaluatePrerequisiteWithDiagnostics(
            inspectedCourse.prerequisiteRule,
            completedCourseIds,
            earnedCredits
        );
    }, [inspectedCourse, completedCourseIds, earnedCredits]);

    // Individual prerequisite course codes extracted from AST
    const prereqCourseIds = useMemo(() => {
        if (!inspectedCourse) return [];
        return extractPrerequisiteCourseIds(inspectedCourse.prerequisiteRule);
    }, [inspectedCourse]);

    if (!inspectedCourse) {
        return null;
    }

    const isCompleted = completedCourseIds.includes(inspectedCourse.id);
    const isFailed = failedCourseIds.includes(inspectedCourse.id);
    const isSelectedElective = selectedElectiveIds.includes(inspectedCourse.id);
    const isElective = inspectedCourse.type === 'ELECTIVE';
    const isMultiSemester = (inspectedCourse.durationSemesters ?? 1) > 1;

    const typeDetails = TYPE_CONFIG[inspectedCourse.type] ?? TYPE_CONFIG.CORE;
    const formattedRule = formatPrerequisiteRule(inspectedCourse.prerequisiteRule);

    return (
        <>
            {/* Backdrop Overlay */}
            <div
                className={`fixed inset-0 bg-[#030508]/80 backdrop-blur-sm z-40 transition-opacity duration-300 ${
                    isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={closeCourseDrawer}
                data-testid="drawer-backdrop"
                aria-hidden="true"
            />

            {/* Slide-over Drawer Panel */}
            <aside
                className={`fixed top-0 right-0 h-full w-full max-w-lg bg-[#070B12]/95 backdrop-blur-md border-l border-white/10 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out font-sans ${
                    isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="drawer-course-title"
                data-testid="module-details-drawer"
            >
                {/* 1. Drawer Header Bar */}
                <div className="p-5 border-b border-white/10 flex items-start justify-between gap-3 bg-[#070B12]/95 sticky top-0 z-10">
                    <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-semibold text-base text-slate-100 tracking-wider">
                                {inspectedCourse.code}
                            </span>
                            <span
                                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-none border tracking-wider ${typeDetails.badge}`}
                            >
                                {typeDetails.label}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--accent-primary)] bg-white/5 px-2 py-0.5 rounded-none border border-white/10">
                                {inspectedCourse.totalCredits} Credits
                            </span>
                        </div>

                        <h2
                            id="drawer-course-title"
                            className="text-lg font-semibold text-slate-100 leading-snug"
                        >
                            {inspectedCourse.title}
                        </h2>

                        <p className="text-xs text-slate-400 font-mono">
                            Recommended: <span className="text-slate-200">Semester {inspectedCourse.recommendedSemester}</span>
                            {inspectedCourse.offeredSemesters.length > 0 && (
                                <> • Offered: <span className="text-slate-200">{inspectedCourse.offeredSemesters.join(', ')}</span></>
                            )}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={closeCourseDrawer}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-none transition-colors border border-transparent hover:border-white/15"
                        title="Close drawer (Esc)"
                        aria-label="Close module details"
                        data-testid="drawer-close-button"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 2. Scrollable Body Content */}
                <div className="p-5 space-y-6 flex-1 overflow-y-auto text-sm text-slate-300">
                    {/* Course Description & Syllabus Objectives */}
                    <section className="space-y-2">
                        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <BookOpen className="w-4 h-4 text-[var(--accent-primary)]" />
                            Module Description & Objectives
                        </h3>
                        <p className="text-xs leading-relaxed text-slate-300 bg-white/[0.02] p-3.5 rounded-sm border border-white/10">
                            {inspectedCourse.description ||
                                'Comprehensive theoretical foundations and practical laboratory applications designed for engineering students.'}
                        </p>

                        {inspectedCourse.syllabusObjectives && inspectedCourse.syllabusObjectives.length > 0 && (
                            <div className="bg-white/[0.02] p-3.5 rounded-sm border border-white/10 space-y-2">
                                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <ListChecks className="w-3.5 h-3.5 text-cyan-300" />
                                    Learning Objectives
                                </span>
                                <ul className="space-y-1.5 text-xs text-slate-300 pl-4 list-disc marker:text-cyan-400">
                                    {inspectedCourse.syllabusObjectives.map((obj, i) => (
                                        <li key={i}>{obj}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </section>

                    {/* Prerequisite AST Breakdown */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Layers className="w-4 h-4 text-cyan-300" />
                                Prerequisite AST Logic
                            </h3>
                            {inspectedCourse.prerequisiteRule ? (
                                prereqEval?.isSatisfied ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-none bg-emerald-950/30 text-emerald-300 border border-emerald-500/30">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                        Satisfied
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-none bg-rose-950/30 text-rose-300 border border-rose-500/40">
                                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                                        Requirements Unmet
                                    </span>
                                )
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-none bg-white/5 text-slate-400 border border-white/10">
                                    None Required
                                </span>
                            )}
                        </div>

                        <div className="bg-white/[0.02] p-3.5 rounded-sm border border-white/10 space-y-2.5">
                            <div>
                                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                                    Propositional Rule Expression
                                </span>
                                <code className="block text-xs font-mono bg-[#030508] px-2.5 py-1.5 rounded-none text-cyan-300 border border-white/10">
                                    {formattedRule}
                                </code>
                            </div>

                            {/* Prerequisite Course Dependency Status Chips */}
                            {prereqCourseIds.length > 0 && (
                                <div>
                                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-1.5">
                                        Component Dependencies
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {prereqCourseIds.map((cid) => {
                                            const isPassed = completedCourseIds.includes(cid);
                                            return (
                                                <div
                                                    key={cid}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none border text-xs font-mono ${
                                                        isPassed
                                                            ? 'bg-emerald-950/20 text-emerald-300 border-emerald-500/30'
                                                            : 'bg-rose-950/20 text-rose-300 border-rose-500/30'
                                                    }`}
                                                >
                                                    {isPassed ? (
                                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                    ) : (
                                                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                                    )}
                                                    <span>{cid}</span>
                                                    <span className="text-[10px] text-slate-400">
                                                        ({isPassed ? 'Completed' : 'Missing'})
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Diagnostic feedback if unmet */}
                            {prereqEval && !prereqEval.isSatisfied && (
                                <p className="text-xs text-rose-400 font-mono pt-1 flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>{prereqEval.summary}</span>
                                </p>
                            )}
                        </div>
                    </section>

                    {/* Co-requisites Section */}
                    {inspectedCourse.corequisites.length > 0 && (
                        <section className="space-y-2">
                            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Award className="w-4 h-4 text-purple-400" />
                                Mandatory Co-requisites
                            </h3>
                            <div className="bg-white/[0.02] p-3.5 rounded-sm border border-white/10">
                                <p className="text-xs text-slate-400 mb-2">
                                    Must be registered concurrently during the same semester:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {inspectedCourse.corequisites.map((coreq) => (
                                        <span
                                            key={coreq}
                                            className="font-mono text-xs font-semibold px-2.5 py-1 rounded-none bg-purple-950/20 text-purple-300 border border-purple-500/30"
                                        >
                                            {coreq}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Multi-Semester Credit Distribution Timeline */}
                    {isMultiSemester && (
                        <section className="space-y-2">
                            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Calendar className="w-4 h-4 text-amber-400" />
                                Multi-Semester Credit Distribution Timeline
                            </h3>
                            <div className="bg-white/[0.02] p-3.5 rounded-sm border border-white/10 space-y-2">
                                <p className="text-xs text-slate-400">
                                    Spans {inspectedCourse.durationSemesters} consecutive academic terms without manual course code splitting:
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {inspectedCourse.creditDistribution.map((dist, idx) => (
                                        <div key={dist.semesterIndex} className="flex items-center gap-2">
                                            <div className="bg-[#030508] border border-white/10 px-3 py-1.5 rounded-none text-xs">
                                                <span className="text-slate-400 block text-[10px] font-mono">Term {idx + 1}</span>
                                                <span className="font-semibold text-slate-200">Semester {dist.semesterIndex}:</span>{' '}
                                                <span className="font-mono text-amber-300">{dist.creditsAllocated} Credits</span>
                                            </div>
                                            {idx < inspectedCourse.creditDistribution.length - 1 && (
                                                <ArrowRight className="w-4 h-4 text-slate-600" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Contact Hours & Workload Breakdown */}
                    <section className="space-y-2">
                        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-emerald-400" />
                            Academic Contact Hours
                        </h3>
                        <div className="grid grid-cols-3 gap-2 text-center bg-white/[0.02] p-3.5 rounded-sm border border-white/10">
                            <div className="bg-[#030508] p-2 rounded-none border border-white/10">
                                <span className="block text-[10px] text-slate-400 uppercase font-mono">Lectures</span>
                                <span className="text-sm font-semibold text-slate-200 font-mono">
                                    {inspectedCourse.contactHours
                                        ? `${inspectedCourse.contactHours.lecture} hrs/wk`
                                        : inspectedCourse.type === 'LAB'
                                        ? '1 hr/wk'
                                        : `${inspectedCourse.totalCredits} hrs/wk`}
                                </span>
                            </div>
                            <div className="bg-[#030508] p-2 rounded-none border border-white/10">
                                <span className="block text-[10px] text-slate-400 uppercase font-mono">Labs</span>
                                <span className="text-sm font-semibold text-slate-200 font-mono">
                                    {inspectedCourse.contactHours
                                        ? `${inspectedCourse.contactHours.lab} hrs/wk`
                                        : inspectedCourse.type === 'LAB' || inspectedCourse.type === 'CAPSTONE'
                                        ? '3 hrs/wk'
                                        : '0 hrs/wk'}
                                </span>
                            </div>
                            <div className="bg-[#030508] p-2 rounded-none border border-white/10">
                                <span className="block text-[10px] text-slate-400 uppercase font-mono">Tutorials</span>
                                <span className="text-sm font-semibold text-slate-200 font-mono">
                                    {inspectedCourse.contactHours
                                        ? `${inspectedCourse.contactHours.tutorial} hrs/wk`
                                        : '1 hr/wk'}
                                </span>
                            </div>
                        </div>
                    </section>
                </div>

                {/* 3. Action Buttons & Study Plan Toggles */}
                <div className="p-5 border-t border-white/10 bg-[#070B12]/95 space-y-2.5 sticky bottom-0">
                    {/* Add / Remove from Study Plan (Electives only) */}
                    {isElective && (
                        <button
                            type="button"
                            onClick={() => toggleElective(inspectedCourse.id)}
                            className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-none text-xs font-mono uppercase tracking-wider transition-all border ${
                                isSelectedElective
                                    ? 'bg-rose-950/20 text-rose-300 border-rose-500/40 hover:bg-rose-950/30'
                                    : 'bg-emerald-950/30 text-emerald-200 border-emerald-500/40 hover:bg-emerald-950/40'
                            }`}
                            data-testid="drawer-elective-toggle"
                        >
                            {isSelectedElective ? (
                                <>
                                    <X className="w-4 h-4" />
                                    <span>Remove from Study Plan</span>
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4 stroke-[2.5]" />
                                    <span>Add to Study Plan (+{inspectedCourse.totalCredits} cr)</span>
                                </>
                            )}
                        </button>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Mark Course as Completed Toggle */}
                        <button
                            type="button"
                            onClick={() => toggleCompletedCourse(inspectedCourse.id)}
                            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-none text-xs font-mono uppercase tracking-wider transition-all border ${
                                isCompleted
                                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 hover:bg-amber-500/30'
                                    : 'bg-[var(--accent-primary)]/15 text-slate-100 border-[var(--accent-primary)]/40 hover:bg-[var(--accent-primary)]/25'
                            }`}
                            data-testid="drawer-completion-toggle"
                        >
                            {isCompleted ? (
                                <>
                                    <X className="w-3.5 h-3.5 text-amber-300" />
                                    <span>Unmark Completed</span>
                                </>
                            ) : (
                                <>
                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                    <span>Completed ({inspectedCourse.totalCredits} cr)</span>
                                </>
                            )}
                        </button>

                        {/* Simulate Failed Module Toggle */}
                        <button
                            type="button"
                            onClick={() => toggleFailedCourse(inspectedCourse.id)}
                            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-none text-xs font-mono uppercase tracking-wider transition-all border ${
                                isFailed
                                    ? 'bg-rose-500/25 text-rose-200 border-rose-500 hover:bg-rose-500/35'
                                    : 'bg-white/5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border-white/10 hover:border-rose-500/30'
                            }`}
                            title="Simulate failing this course to observe cascading prerequisite ripple effects"
                            data-testid="drawer-failed-toggle"
                        >
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            <span>{isFailed ? 'Clear Failed' : 'Mark Failed'}</span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
