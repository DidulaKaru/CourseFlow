import { useEffect, useMemo } from 'react';
import {
    AlertTriangle,
    ArrowRight,
    Award,
    BookOpen,
    Calendar,
    Check,
    Clock,
    Layers,
    Plus,
    X,
} from 'lucide-react';

import {
    evaluatePlannedPrerequisite,
    formatPrerequisiteRule,
} from '@/core/algorithms/ast_evaluator';
import { extractPrerequisiteCourseIds } from '@/core/layout';
import { usePlannerStore } from '@/core/store';
import { getProgramCourses } from '@/data/mockCourses';
import type { CourseType } from '@/types/curriculum';

const TYPE_CONFIG: Record<
    CourseType,
    { badge: string; label: string }
> = {
    CORE: {
        badge: 'border-white/15 text-slate-300 bg-white/5',
        label: 'Mandatory Core',
    },
    ELECTIVE: {
        badge: 'border-white/15 text-slate-400 bg-white/5',
        label: 'Elective Specialization',
    },
    CAPSTONE: {
        badge: 'border-amber-500/30 text-amber-300 bg-amber-950/20',
        label: 'Capstone Project',
    },
    LAB: {
        badge: 'border-cyan-500/30 text-cyan-300 bg-cyan-950/20',
        label: 'Practical Lab',
    },
};

export function ModuleDetailsDrawer() {
    const isDrawerOpen = usePlannerStore((state) => state.isDrawerOpen);
    const inspectedCourse = usePlannerStore((state) => state.inspectedCourse);
    const closeCourseDrawer = usePlannerStore((state) => state.closeCourseDrawer);
    const openCourseDrawer = usePlannerStore((state) => state.openCourseDrawer);

    // Planner state & actions
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);
    const toggleElective = usePlannerStore((state) => state.toggleElective);

    const activeCourses = useMemo(() => getProgramCourses(activeProgramId), [activeProgramId]);

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

    // Prerequisite evaluation diagnostics for inspected course in plan context
    const prereqEval = useMemo(() => {
        if (!inspectedCourse) return null;
        return evaluatePlannedPrerequisite(
            inspectedCourse,
            activeCourses,
            selectedElectiveIds
        );
    }, [inspectedCourse, activeCourses, selectedElectiveIds]);

    // Individual prerequisite course codes extracted from AST
    const prereqCourseIds = useMemo(() => {
        if (!inspectedCourse) return [];
        return extractPrerequisiteCourseIds(inspectedCourse.prerequisiteRule);
    }, [inspectedCourse]);

    if (!inspectedCourse) {
        return null;
    }

    const isSelectedElective = selectedElectiveIds.includes(inspectedCourse.id);
    const isElective = inspectedCourse.type === 'ELECTIVE';
    const isMultiSemester = (inspectedCourse.durationSemesters ?? 1) > 1;

    const typeDetails = TYPE_CONFIG[inspectedCourse.type] ?? TYPE_CONFIG.CORE;
    const formattedRule = formatPrerequisiteRule(inspectedCourse.prerequisiteRule);
    const hasComplexLogic = formattedRule.includes('AND') || formattedRule.includes('OR') || formattedRule.includes('Credits');

    return (
        <>
            {/* Backdrop Overlay - only active on mobile to avoid blacking out desktop constellation */}
            <div
                className={`fixed inset-0 bg-[#030508]/80 backdrop-blur-sm z-40 transition-opacity duration-300 lg:hidden ${
                    isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={closeCourseDrawer}
                data-testid="drawer-backdrop"
                aria-hidden="true"
            />

            {/* Slide-over Drawer Panel (Docked side panel on large viewports) */}
            <aside
                className={`fixed top-0 right-0 h-full w-full max-w-lg bg-[#070B12]/95 backdrop-blur-md border-l border-white/10 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out font-sans ${
                    isDrawerOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none invisible'
                }`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="drawer-course-title"
                aria-hidden={!isDrawerOpen}
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
                                data-testid="drawer-mandatory-badge"
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
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={closeCourseDrawer}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-none transition-colors border border-transparent hover:border-white/15 cursor-pointer"
                        title="Close drawer (Esc)"
                        aria-label="Close module details"
                        data-testid="drawer-close-button"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 2. Scrollable Body Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6 text-slate-300">
                    {/* Module Description & Objectives */}
                    <section className="space-y-2">
                        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <BookOpen className="w-4 h-4 text-[var(--accent-primary)]" />
                            Module Description & Objectives
                        </h3>
                        <div className="bg-white/[0.02] p-3.5 rounded-sm border border-white/10">
                            <p className="text-sm leading-relaxed text-slate-200">
                                {inspectedCourse.description}
                            </p>
                        </div>
                    </section>

                    {/* Prerequisite Requirements & Diagnostics */}
                    <section className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Layers className="w-4 h-4 text-cyan-400" />
                                Prerequisite Requirements
                            </h3>
                            {inspectedCourse.prerequisiteRule === null ? (
                                <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-none border border-white/10 uppercase">
                                    None Required
                                </span>
                            ) : prereqEval?.isSatisfied ? (
                                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/30 px-2 py-0.5 rounded-none border border-emerald-500/30 uppercase flex items-center gap-1">
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    Satisfied in Plan
                                </span>
                            ) : (
                                <span className="text-[10px] font-mono text-rose-300 bg-rose-950/30 px-2 py-0.5 rounded-none border border-rose-500/30 uppercase flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                                    Missing Foundation
                                </span>
                            )}
                        </div>

                        {inspectedCourse.prerequisiteRule !== null && (
                            <div className="bg-white/[0.02] p-3.5 rounded-sm border border-white/10 space-y-3">
                                {/* Only display raw rule text if complex logic exists to avoid duplicating single course code */}
                                {hasComplexLogic && (
                                    <div>
                                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                                            Logical Rule Expression
                                        </span>
                                        <div className="p-2.5 bg-[#030508] border border-white/10 rounded-none font-mono text-xs text-slate-200">
                                            {formattedRule}
                                        </div>
                                    </div>
                                )}

                                {/* Interactive Course Code Chips */}
                                {prereqCourseIds.length > 0 && (
                                    <div>
                                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1.5">
                                            Foundation Dependencies (Click to Inspect)
                                        </span>
                                        <div className="flex flex-wrap gap-2">
                                            {prereqCourseIds.map((cid) => {
                                                const isMissing = prereqEval?.missingCourseIds.includes(cid);
                                                const isSatisfied = !isMissing;
                                                const prereqCourse = activeCourses.find(
                                                    (c) => c.id === cid || c.code === cid
                                                );

                                                return (
                                                    <button
                                                        key={cid}
                                                        type="button"
                                                        onClick={() => {
                                                            if (prereqCourse) openCourseDrawer(prereqCourse);
                                                        }}
                                                        title={`Inspect foundation course ${cid}`}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none border text-xs font-mono transition-colors cursor-pointer hover:border-white/40 ${
                                                            isSatisfied
                                                                ? 'bg-emerald-950/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-950/40'
                                                                : 'bg-rose-950/20 text-rose-300 border-rose-500/30 hover:bg-rose-950/40'
                                                        }`}
                                                    >
                                                        {isSatisfied ? (
                                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                        ) : (
                                                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                                        )}
                                                        <span className="font-semibold">{cid}</span>
                                                        <span className="text-[10px] text-slate-400">
                                                            ({isSatisfied ? 'In Plan' : 'Missing'})
                                                        </span>
                                                    </button>
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
                        )}
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
                                    Spans {inspectedCourse.durationSemesters} consecutive academic terms:
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
                                <span className="text-xs font-semibold text-slate-200 font-mono">
                                    {inspectedCourse.type === 'LAB' ? '1 hr/wk' : `${inspectedCourse.totalCredits} hrs/wk`}
                                </span>
                            </div>
                            <div className="bg-[#030508] p-2 rounded-none border border-white/10">
                                <span className="block text-[10px] text-slate-400 uppercase font-mono">Labs</span>
                                <span className="text-xs font-semibold text-slate-200 font-mono">
                                    {inspectedCourse.type === 'LAB' || inspectedCourse.type === 'CAPSTONE'
                                        ? '3 hrs/wk'
                                        : '0 hrs/wk'}
                                </span>
                            </div>
                            <div className="bg-[#030508] p-2 rounded-none border border-white/10">
                                <span className="block text-[10px] text-slate-400 uppercase font-mono">Tutorials</span>
                                <span className="text-xs font-semibold text-slate-200 font-mono">1 hr/wk</span>
                            </div>
                        </div>
                    </section>
                </div>

                {/* 3. Action Buttons & Study Plan Toggles (Only render for electives with plan actions) */}
                {isElective && (
                    <div className="p-4 border-t border-white/10 bg-[#070B12]/95 sticky bottom-0">
                        <button
                            type="button"
                            onClick={() => toggleElective(inspectedCourse.id)}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-none text-xs font-mono uppercase tracking-wider transition-all border cursor-pointer ${
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
                                    <Plus className="w-4 h-4" />
                                    <span>Add Elective to Study Plan</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </aside>
        </>
    );
}
