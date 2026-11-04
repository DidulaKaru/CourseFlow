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
        badge: 'border-white/15 text-slate-300 bg-white/5',
        label: 'CORE',
    },
    ELECTIVE: {
        badge: 'border-white/15 text-slate-400 bg-white/5',
        label: 'ELECTIVE',
    },
    CAPSTONE: {
        badge: 'border-amber-500/30 text-amber-300 bg-amber-950/20',
        label: 'CAPSTONE',
    },
    LAB: {
        badge: 'border-cyan-500/30 text-cyan-300 bg-cyan-950/20',
        label: 'LAB',
    },
};

/**
 * Course Card Node.
 * Represents a constellation star-point anchoring an engineering module in the Skyrim Skill Tree.
 * Features 2px radius razor-sharp geometry, dark translucent glass finish, diamond star node pips,
 * high-contrast silver monospace course code, and precision prerequisite illumination.
 */
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

    // Determine card dynamic border and atmospheric glass finish
    let cardStyle = 'bg-[#070B12]/85 border-white/10 hover:border-[var(--node-border-highlight)] text-slate-200';

    if (highlightStatus === 'dimmed') {
        // Dimmed state from canvas hover/selection isolation
        cardStyle = 'bg-[#030508]/60 border-white/5 text-slate-600 opacity-20 grayscale';
    } else if (highlightStatus === 'active' || selected) {
        // Active selected node: glowing department constellation beam border
        cardStyle = 'bg-[#0A0F18]/95 border-[var(--constellation-beam)] ring-1 ring-[var(--constellation-beam)] shadow-[0_0_15px_var(--constellation-beam-glow)] text-white';
    } else if (highlightStatus === 'upstream') {
        // Upstream prerequisite dependency illuminated
        cardStyle = 'bg-[#0A0F18]/95 border-[#00F0FF] ring-1 ring-[#00F0FF]/50 shadow-[0_0_12px_rgba(0,240,255,0.25)] text-white';
    } else if (highlightStatus === 'downstream') {
        // Downstream unlocked elective/dependent illuminated
        cardStyle = 'bg-[#0A0F18]/95 border-[#10B981] ring-1 ring-[#10B981]/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] text-white';
    } else if (isCompleted) {
        // Completed course: golden flared star core with subtle metallic ring
        cardStyle = 'bg-[#070B12]/90 border-amber-500/40 ring-1 ring-amber-500/20 text-slate-100 shadow-[0_0_10px_rgba(245,158,11,0.15)]';
    } else if (isPrereqUnmet) {
        // Missing Prereqs: Translucent smoked background with etched warning border
        cardStyle = 'bg-[#070B12]/60 border-red-500/40 text-slate-300 shadow-[0_0_8px_rgba(239,68,68,0.1)]';
    } else if (isSelectedElective) {
        // Selected elective: crisp emerald starlight hairline
        cardStyle = 'bg-[#070B12]/90 border-emerald-500/40 ring-1 ring-emerald-500/20 text-slate-100';
    }

    return (
        <div
            className={`relative rounded-sm border p-3 transition-all duration-200 select-none cursor-pointer flex flex-col justify-between backdrop-blur-sm ${cardStyle}`}
            style={{
                width: spanWidth ?? 240,
                minHeight: 110,
            }}
            title={`${course.code}: ${course.title} — ${course.description || prereqEval.summary}`}
        >
            {/* Primary Target Handle: incoming prerequisite connections from above (Top) */}
            <Handle
                type="target"
                position={Position.Top}
                id="top"
                className={`!w-2.5 !h-2.5 !rotate-45 !rounded-none !border !border-white/40 !-top-1.5 transition-transform hover:!scale-125 ${
                    isCompleted
                        ? '!bg-[#F59E0B] !shadow-[0_0_8px_#F59E0B]'
                        : '!bg-[var(--star-pip)] !shadow-[0_0_6px_var(--constellation-beam-glow)]'
                }`}
            />

            {/* Supplementary Target Handle for horizontal compatibility */}
            <Handle
                type="target"
                position={Position.Left}
                id="left"
                className="!w-1.5 !h-1.5 !bg-white/20 !border-0 opacity-40 hover:opacity-100"
            />

            {/* 1. Header: Course Code, Credit Pill, Type Badge, and Quick Completion Toggle */}
            <div className="flex items-center justify-between gap-1.5 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-semibold text-xs tracking-wider text-slate-100">
                        {course.code}
                    </span>
                    <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded-none border tracking-widest ${typeConfig.badge}`}
                    >
                        {typeConfig.label}
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-[var(--accent-primary)] font-medium">
                        {course.totalCredits} cr
                    </span>
                    {/* Fast Course Completion Toggle */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleCompletedCourse(course.id);
                        }}
                        className={`w-5 h-5 rounded-none border flex items-center justify-center transition-colors ${
                            isCompleted
                                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                                : 'border-white/15 bg-white/5 text-slate-400 hover:text-white hover:border-white/30'
                        }`}
                        title={isCompleted ? 'Mark course as incomplete' : 'Mark course as completed'}
                        aria-label={`Toggle completion for ${course.code}`}
                    >
                        <Check className="w-3 h-3 stroke-[2.5]" />
                    </button>
                </div>
            </div>

            {/* 2. Body: Course Title & Spanning Banner */}
            <div className="my-1 flex-1">
                <p
                    className="text-[12px] font-normal leading-snug line-clamp-2 text-slate-300"
                    title={`${course.code}: ${course.title}`}
                >
                    {course.title}
                </p>

                {isMultiSemester && (
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-none bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rotate-45 bg-amber-400" />
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
                    className={`my-1 w-full flex items-center justify-between px-2 py-0.5 rounded-none text-[10px] font-mono uppercase tracking-wider transition-all border ${
                        isSelectedElective
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                            : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20 hover:text-slate-200'
                    }`}
                    title={isSelectedElective ? 'Remove elective from plan' : 'Add elective to plan'}
                >
                    <span className="flex items-center gap-1.5">
                        {isSelectedElective ? (
                            <Check className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
                        ) : (
                            <Plus className="w-3 h-3 text-slate-400" />
                        )}
                        <span>{isSelectedElective ? 'Selected Elective' : 'Select Elective'}</span>
                    </span>
                    <span className="text-[9px] text-slate-400">
                        {isSelectedElective ? 'Active' : '+Elective'}
                    </span>
                </button>
            )}

            {/* 3. Footer: Dynamic Status Badge (Completed, Warning / Unmet, Prerequisites Satisfied) */}
            <div className="mt-1 flex items-center justify-between gap-1 text-[10px]">
                <span className="text-slate-500 font-mono text-[9px] uppercase tracking-wider">
                    Sem {data.semesterIndex}
                </span>

                {isCompleted ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-none bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        <CheckCircle2 className="w-3 h-3 text-amber-400" />
                        <span>Completed</span>
                    </span>
                ) : isPrereqUnmet ? (
                    <span
                        className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-none bg-red-950/20 text-red-400 border border-red-500/30"
                        title={prereqEval.summary}
                    >
                        <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                        <span className="line-clamp-1">Warning: Unmet</span>
                    </span>
                ) : hasPrerequisites ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-none bg-white/5 text-slate-300 border border-white/10">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Prereqs Satisfied</span>
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-none bg-white/[0.02] text-slate-500 border border-white/5">
                        <span>No Prereqs</span>
                    </span>
                )}
            </div>

            {/* Primary Source Handle: outgoing unlocked connections downward (Bottom) */}
            <Handle
                type="source"
                position={Position.Bottom}
                id="bottom"
                className="!w-2 !h-2 !rotate-45 !rounded-none !border !border-white/30 !bg-[var(--star-pip)] !-bottom-1 transition-transform hover:!scale-125"
            />

            {/* Supplementary Source Handle for horizontal compatibility */}
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                className="!w-1.5 !h-1.5 !bg-white/20 !border-0 opacity-40 hover:opacity-100"
            />
        </div>
    );
});
