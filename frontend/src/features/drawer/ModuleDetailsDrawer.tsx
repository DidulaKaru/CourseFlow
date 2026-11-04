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
    Plus,
    X,
} from 'lucide-react';

import {
    calculateEarnedCredits,
    evaluatePrerequisiteWithDiagnostics,
    formatPrerequisiteRule,
} from '@/core/algorithms/ast_evaluator';
import { extractPrerequisiteCourseIds } from '@/core/layout';
import { usePlannerStore } from '@/core/store';
import { mockCourses } from '@/data/mockCourses';
import type { CourseType } from '@/types/curriculum';

const TYPE_CONFIG: Record<
    CourseType,
    { badge: string; label: string; text: string }
> = {
    CORE: {
        badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        label: 'Core Module',
        text: 'Mandatory core requirement for degree completion.',
    },
    ELECTIVE: {
        badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        label: 'Elective Module',
        text: 'Specialization elective chosen by the student.',
    },
    CAPSTONE: {
        badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        label: 'Capstone Project',
        text: 'Multi-semester comprehensive engineering design project.',
    },
    LAB: {
        badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
        label: 'Practical Lab',
        text: 'Hands-on practical laboratory and technical design.',
    },
};

export function ModuleDetailsDrawer() {
    const isDrawerOpen = usePlannerStore((state) => state.isDrawerOpen);
    const inspectedCourse = usePlannerStore((state) => state.inspectedCourse);
    const closeCourseDrawer = usePlannerStore((state) => state.closeCourseDrawer);

    // Planner state & actions
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);
    const completedCourseIds = usePlannerStore((state) => state.completedCourseIds);
    const toggleElective = usePlannerStore((state) => state.toggleElective);
    const toggleCompletedCourse = usePlannerStore((state) => state.toggleCompletedCourse);

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

    // Student cumulative credits
    const earnedCredits = useMemo(() => {
        return calculateEarnedCredits(completedCourseIds, mockCourses);
    }, [completedCourseIds]);

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
    const isSelectedElective = selectedElectiveIds.includes(inspectedCourse.id);
    const isElective = inspectedCourse.type === 'ELECTIVE';
    const isMultiSemester = (inspectedCourse.durationSemesters ?? 1) > 1;

    const typeDetails = TYPE_CONFIG[inspectedCourse.type] ?? TYPE_CONFIG.CORE;
    const formattedRule = formatPrerequisiteRule(inspectedCourse.prerequisiteRule);

    return (
        <>
            {/* Backdrop Overlay */}
            <div
                className={`fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-40 transition-opacity duration-300 ${
                    isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={closeCourseDrawer}
                data-testid="drawer-backdrop"
                aria-hidden="true"
            />

            {/* Slide-over Drawer Panel */}
            <aside
                className={`fixed top-0 right-0 h-full w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
                    isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="drawer-course-title"
                data-testid="module-details-drawer"
            >
                {/* 1. Drawer Header Bar */}
                <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-3 bg-slate-900/95 sticky top-0 z-10">
                    <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-base text-white tracking-tight">
                                {inspectedCourse.code}
                            </span>
                            <span
                                className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded border ${typeDetails.badge}`}
                            >
                                {typeDetails.label}
                            </span>
                            <span className="text-[11px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700/60 font-mono">
                                {inspectedCourse.totalCredits} Credits
                            </span>
                        </div>

                        <h2
                            id="drawer-course-title"
                            className="text-lg font-bold text-slate-100 leading-snug"
                        >
                            {inspectedCourse.title}
                        </h2>

                        <p className="text-xs text-slate-400">
                            Recommended: <span className="text-slate-200 font-medium">Semester {inspectedCourse.recommendedSemester}</span>
                            {inspectedCourse.offeredSemesters.length > 0 && (
                                <> • Offered: <span className="text-slate-200 font-medium">{inspectedCourse.offeredSemesters.join(', ')}</span></>
                            )}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={closeCourseDrawer}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700"
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
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <BookOpen className="w-4 h-4 text-indigo-400" />
                            Module Description & Objectives
                        </h3>
                        <p className="text-xs leading-relaxed text-slate-300 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                            {inspectedCourse.description ||
                                'Comprehensive theoretical foundations and practical laboratory applications designed for engineering students.'}
                        </p>
                    </section>

                    {/* Prerequisite AST Breakdown */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Layers className="w-4 h-4 text-cyan-400" />
                                Prerequisite AST Logic
                            </h3>
                            {inspectedCourse.prerequisiteRule ? (
                                prereqEval?.isSatisfied ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                        Satisfied
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/40">
                                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                                        Requirements Unmet
                                    </span>
                                )
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                                    None Required
                                </span>
                            )}
                        </div>

                        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-2.5">
                            <div>
                                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                                    Propositional Rule Expression
                                </span>
                                <code className="block text-xs font-mono bg-slate-900 px-2.5 py-1.5 rounded-lg text-cyan-300 border border-slate-800">
                                    {formattedRule}
                                </code>
                            </div>

                            {/* Prerequisite Course Dependency Status Chips */}
                            {prereqCourseIds.length > 0 && (
                                <div>
                                    <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1.5">
                                        Component Dependencies
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {prereqCourseIds.map((cid) => {
                                            const isPassed = completedCourseIds.includes(cid);
                                            return (
                                                <div
                                                    key={cid}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono ${
                                                        isPassed
                                                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                                            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                                    }`}
                                                >
                                                    {isPassed ? (
                                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                    ) : (
                                                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                                    )}
                                                    <span>{cid}</span>
                                                    <span className="text-[10px] font-sans text-slate-400">
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
                                <p className="text-xs text-rose-400 font-medium pt-1 flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>{prereqEval.summary}</span>
                                </p>
                            )}
                        </div>
                    </section>

                    {/* Co-requisites Section */}
                    {inspectedCourse.corequisites.length > 0 && (
                        <section className="space-y-2">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Award className="w-4 h-4 text-purple-400" />
                                Mandatory Co-requisites
                            </h3>
                            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                                <p className="text-xs text-slate-400 mb-2">
                                    Must be registered concurrently during the same semester:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {inspectedCourse.corequisites.map((coreq) => (
                                        <span
                                            key={coreq}
                                            className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/30"
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
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Calendar className="w-4 h-4 text-amber-400" />
                                Multi-Semester Credit Distribution Timeline
                            </h3>
                            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
                                <p className="text-xs text-slate-400">
                                    Spans {inspectedCourse.durationSemesters} consecutive academic terms without manual course code splitting:
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {inspectedCourse.creditDistribution.map((dist, idx) => (
                                        <div key={dist.semesterIndex} className="flex items-center gap-2">
                                            <div className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-xs">
                                                <span className="text-slate-400 block text-[10px]">Term {idx + 1}</span>
                                                <span className="font-bold text-white">Semester {dist.semesterIndex}:</span>{' '}
                                                <span className="font-mono text-amber-400">{dist.creditsAllocated} Credits</span>
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
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-emerald-400" />
                            Academic Contact Hours
                        </h3>
                        <div className="grid grid-cols-3 gap-2 text-center bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                                <span className="block text-[10px] text-slate-500 uppercase font-semibold">Lectures</span>
                                <span className="text-sm font-bold text-white">
                                    {inspectedCourse.type === 'LAB' ? '1 hr/wk' : `${inspectedCourse.totalCredits} hrs/wk`}
                                </span>
                            </div>
                            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                                <span className="block text-[10px] text-slate-500 uppercase font-semibold">Labs</span>
                                <span className="text-sm font-bold text-white">
                                    {inspectedCourse.type === 'LAB' || inspectedCourse.type === 'CAPSTONE'
                                        ? '3 hrs/wk'
                                        : '0 hrs/wk'}
                                </span>
                            </div>
                            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                                <span className="block text-[10px] text-slate-500 uppercase font-semibold">Tutorials</span>
                                <span className="text-sm font-bold text-white">1 hr/wk</span>
                            </div>
                        </div>
                    </section>
                </div>

                {/* 3. Action Buttons & Study Plan Toggles */}
                <div className="p-5 border-t border-slate-800 bg-slate-900/95 space-y-2.5 sticky bottom-0">
                    {/* Add / Remove from Study Plan (Electives only) */}
                    {isElective && (
                        <button
                            type="button"
                            onClick={() => toggleElective(inspectedCourse.id)}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-md ${
                                isSelectedElective
                                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/30'
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
                                    <Plus className="w-4 h-4 stroke-[3]" />
                                    <span>Add to Study Plan (+{inspectedCourse.totalCredits} cr)</span>
                                </>
                            )}
                        </button>
                    )}

                    {/* Mark Course as Completed Toggle */}
                    <button
                        type="button"
                        onClick={() => toggleCompletedCourse(inspectedCourse.id)}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all border ${
                            isCompleted
                                ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700/80'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-indigo-950/30'
                        }`}
                        data-testid="drawer-completion-toggle"
                    >
                        {isCompleted ? (
                            <>
                                <X className="w-4 h-4 text-slate-400" />
                                <span>Mark Course as Incomplete</span>
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4 stroke-[3]" />
                                <span>Mark as Completed ({inspectedCourse.totalCredits} cr)</span>
                            </>
                        )}
                    </button>
                </div>
            </aside>
        </>
    );
}
