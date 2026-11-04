import { memo, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, Check, CheckCircle2, Plus } from 'lucide-react';

import {
    calculateEarnedCredits,
    evaluatePrerequisiteWithDiagnostics,
} from '@/core/algorithms/ast_evaluator';
import type { CourseLayoutNode } from '@/core/layout';
import { usePlannerStore } from '@/core/store';
import { mockCourses } from '@/data/mockCourses';
import type { CourseType } from '@/types/curriculum';

export type NodeHighlightStatus = 'normal' | 'active' | 'upstream' | 'downstream' | 'dimmed';

export interface ExtendedCourseNodeData {
    highlightStatus?: NodeHighlightStatus;
}

const TYPE_STYLES: Record<CourseType, { badge: string; label: string }> = {
    CORE: {
        badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        label: 'CORE',
    },
    ELECTIVE: {
        badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        label: 'ELECTIVE',
    },
    CAPSTONE: {
        badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        label: 'CAPSTONE',
    },
    LAB: {
        badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
        label: 'LAB',
    },
};

export const CourseNode = memo(function CourseNode({
    data,
    selected,
}: NodeProps<CourseLayoutNode>) {
    const { course, isMultiSemester, durationSemesters, spanWidth } = data;
    const highlightStatus = (data as unknown as ExtendedCourseNodeData).highlightStatus ?? 'normal';

    // Zustand store reactive hooks
    const isCompleted = usePlannerStore((state) => state.isCourseCompleted(course.id));
    const isSelectedElective = usePlannerStore((state) => state.isElectiveSelected(course.id));
    const toggleElective = usePlannerStore((state) => state.toggleElective);
    const toggleCompletedCourse = usePlannerStore((state) => state.toggleCompletedCourse);
    const completedCourseIds = usePlannerStore((state) => state.completedCourseIds);

    // Compute student's cumulative earned credits across catalog
    const earnedCredits = useMemo(() => {
        return calculateEarnedCredits(completedCourseIds, mockCourses);
    }, [completedCourseIds]);

    // Evaluate prerequisite AST satisfiability with diagnostics
    const prereqEval = useMemo(() => {
        return evaluatePrerequisiteWithDiagnostics(
            course.prerequisiteRule,
            completedCourseIds,
            earnedCredits
        );
    }, [course.prerequisiteRule, completedCourseIds, earnedCredits]);

    const hasPrerequisites = course.prerequisiteRule !== null;
    const isPrereqUnmet = hasPrerequisites && !prereqEval.isSatisfied && !isCompleted;

    const typeConfig = TYPE_STYLES[course.type] ?? TYPE_STYLES.CORE;

    // Determine card dynamic border and background styling
    let cardStyle = '';

    if (highlightStatus === 'dimmed') {
        // Dimmed state from canvas hover/selection isolation
        cardStyle = 'bg-slate-950/60 border-slate-800 text-slate-500 opacity-25 grayscale-[30%]';
    } else if (highlightStatus === 'active' || selected) {
        // Active selected node
        cardStyle = 'bg-slate-900 border-indigo-500 ring-2 ring-indigo-500/80 shadow-lg shadow-indigo-500/25 text-white';
    } else if (highlightStatus === 'upstream') {
        // Upstream prerequisite dependency illuminated
        cardStyle = 'bg-slate-900 border-cyan-400 ring-2 ring-cyan-500/70 shadow-md shadow-cyan-500/20 text-white';
    } else if (highlightStatus === 'downstream') {
        // Downstream unlocked elective/dependent illuminated
        cardStyle = 'bg-slate-900 border-emerald-400 ring-2 ring-emerald-500/70 shadow-md shadow-emerald-500/20 text-white';
    } else if (isCompleted) {
        // Completed course
        cardStyle = 'bg-slate-900/95 border-emerald-500/80 ring-1 ring-emerald-500/40 text-slate-100 shadow-sm';
    } else if (isPrereqUnmet) {
        // Warning: Unmet prerequisite AST alert (Amber/Red border alert)
        cardStyle = 'bg-slate-900/95 border-amber-500/90 ring-1 ring-amber-500/50 shadow-md shadow-amber-500/10 text-slate-100';
    } else if (isSelectedElective) {
        // Selected elective
        cardStyle = 'bg-slate-900/95 border-emerald-500 ring-1 ring-emerald-500/40 shadow-sm text-slate-100';
    } else if (course.type === 'CORE') {
        // Mandatory Core module
        cardStyle = 'bg-slate-900/90 border-indigo-500/50 hover:border-indigo-400/80 text-slate-100 shadow-sm';
    } else if (course.type === 'CAPSTONE') {
        // Capstone module
        cardStyle = 'bg-slate-900/90 border-amber-500/50 hover:border-amber-400/80 text-slate-100 shadow-sm';
    } else {
        // Default unselected elective or lab
        cardStyle = 'bg-slate-900/90 border-slate-700/80 hover:border-slate-500 text-slate-100 shadow-sm';
    }

    return (
        <div
            className={`relative rounded-xl border p-3 transition-all duration-200 select-none cursor-pointer flex flex-col justify-between ${cardStyle}`}
            style={{
                width: spanWidth ?? 240,
                minHeight: 110,
            }}
            title={`${course.code}: ${course.title} — ${course.description || prereqEval.summary}`}
        >
            {/* Target Handle: incoming prerequisite connections (Left) */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-2.5 !h-2.5 !bg-cyan-400 !border-2 !border-slate-900 transition-transform hover:!scale-125"
            />

            {/* 1. Header: Course Code, Credit Pill, Type Badge, and Quick Completion Toggle */}
            <div className="flex items-center justify-between gap-1.5 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-xs tracking-tight text-white">
                        {course.code}
                    </span>
                    <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${typeConfig.badge}`}
                    >
                        {typeConfig.label}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <span className="text-[10px] font-medium text-slate-400 bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700/60 font-mono">
                        {course.totalCredits} cr
                    </span>
                    {/* Fast Course Completion Toggle */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleCompletedCourse(course.id);
                        }}
                        className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                            isCompleted
                                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700'
                        }`}
                        title={isCompleted ? 'Mark course as incomplete' : 'Mark course as completed'}
                        aria-label={`Toggle completion for ${course.code}`}
                    >
                        <Check className="w-3 h-3 stroke-[3]" />
                    </button>
                </div>
            </div>

            {/* 2. Body: Course Title (with full tooltip on hover) & Spanning Banner */}
            <div className="my-1 flex-1">
                <p
                    className="text-xs font-medium leading-snug line-clamp-2 text-slate-200"
                    title={`${course.code}: ${course.title}`}
                >
                    {course.title}
                </p>

                {isMultiSemester && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span>{durationSemesters}-Sem Spanning</span>
                    </div>
                )}
            </div>

            {/* Direct Toggle for Elective Modules */}
            {course.type === 'ELECTIVE' && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleElective(course.id);
                    }}
                    className={`my-1 w-full flex items-center justify-between px-2 py-0.5 rounded text-[10px] font-semibold transition-all border ${
                        isSelectedElective
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:bg-slate-700/90 hover:text-slate-200'
                    }`}
                    title={isSelectedElective ? 'Remove elective from plan' : 'Add elective to plan'}
                >
                    <span className="flex items-center gap-1">
                        {isSelectedElective ? (
                            <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                        ) : (
                            <Plus className="w-3 h-3 text-slate-400" />
                        )}
                        <span>{isSelectedElective ? 'Selected Elective' : 'Select Elective'}</span>
                    </span>
                    <span className="font-mono text-[9px] text-slate-400">
                        {isSelectedElective ? 'Active' : '+Elective'}
                    </span>
                </button>
            )}

            {/* 3. Footer: Dynamic Status Badge (Completed, Warning / Unmet, Prerequisites Satisfied) */}
            <div className="mt-1 flex items-center justify-between gap-1 text-[10px]">
                <span className="text-slate-500 font-mono text-[9px]">
                    Sem {data.semesterIndex}
                </span>

                {isCompleted ? (
                    <span className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Completed</span>
                    </span>
                ) : isPrereqUnmet ? (
                    <span
                        className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40"
                        title={prereqEval.summary}
                    >
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="line-clamp-1">Warning: Unmet</span>
                    </span>
                ) : hasPrerequisites ? (
                    <span className="inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700/60">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Prereqs Satisfied</span>
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/40">
                        <span>No Prereqs</span>
                    </span>
                )}
            </div>

            {/* Source Handle: outgoing unlocked connections (Right) */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-2.5 !h-2.5 !bg-emerald-400 !border-2 !border-slate-900 transition-transform hover:!scale-125"
            />
        </div>
    );
});
