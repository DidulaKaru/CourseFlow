import { memo, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, Check, Plus } from 'lucide-react';

import { evaluatePlannedPrerequisite } from '@/core/algorithms/ast_evaluator';
import type { CourseLayoutNode } from '@/core/layout';
import { usePlannerStore } from '@/core/store';
import { getProgramCourses } from '@/data/mockCourses';
import type { CourseType } from '@/types/curriculum';

export type NodeHighlightStatus = 'normal' | 'active' | 'upstream' | 'downstream' | 'dimmed';

export interface ExtendedCourseNodeData {
    highlightStatus?: NodeHighlightStatus;
}

const TYPE_STYLES: Record<CourseType, { badge: string; label: string }> = {
    CORE: {
        badge: 'border-white/20 text-slate-200 bg-white/10',
        label: 'CORE',
    },
    ELECTIVE: {
        badge: 'border-white/15 text-slate-300 bg-white/5',
        label: 'ELECTIVE',
    },
    CAPSTONE: {
        badge: 'border-amber-500/40 text-amber-300 bg-amber-950/30',
        label: 'CAPSTONE',
    },
    LAB: {
        badge: 'border-cyan-500/40 text-cyan-300 bg-cyan-950/30',
        label: 'LAB',
    },
};

/**
 * Custom React Flow Node Component for Curriculum Visualizer.
 * Skyrim Perk Tree aesthetic: Translucent glass, hairline borders, geometric handles.
 * All nodes maintain a strict, uniform height (110px) to guarantee clean handle and row alignment.
 */
export const CourseNode = memo(function CourseNode({
    data,
    selected,
}: NodeProps<CourseLayoutNode>) {
    const { course, isMultiSemester, durationSemesters, spanWidth } = data;
    const highlightStatus = (data as unknown as ExtendedCourseNodeData).highlightStatus ?? 'normal';

    // Zustand store reactive hooks
    const isSelectedElective = usePlannerStore((state) => state.isElectiveSelected(course.id));
    const toggleElective = usePlannerStore((state) => state.toggleElective);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);

    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const activeCourses = useMemo(() => getProgramCourses(activeProgramId), [activeProgramId]);

    // Evaluate prospective prerequisite satisfiability in degree plan context
    const prereqEval = useMemo(() => {
        return evaluatePlannedPrerequisite(
            course,
            activeCourses,
            selectedElectiveIds
        );
    }, [course, activeCourses, selectedElectiveIds]);

    const hasPrerequisites = course.prerequisiteRule !== null;
    const isPrereqUnmet = hasPrerequisites && !prereqEval.isSatisfied;

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
    } else if (isPrereqUnmet) {
        // Missing Prereqs: Translucent smoked background with etched warning border
        cardStyle = 'bg-[#070B12]/60 border-red-500/40 text-slate-300 shadow-[0_0_8px_rgba(239,68,68,0.1)]';
    } else if (isSelectedElective) {
        // Selected elective: crisp emerald starlight hairline
        cardStyle = 'bg-[#070B12]/90 border-emerald-500/40 ring-1 ring-emerald-500/20 text-slate-100';
    }

    return (
        <div
            role="article"
            tabIndex={0}
            aria-label={`${course.code}: ${course.title}, ${course.totalCredits} credits, ${typeConfig.label}`}
            className={`relative rounded-sm border p-2.5 transition-all duration-200 select-none cursor-pointer flex flex-col justify-between backdrop-blur-sm ${cardStyle}`}
            style={{
                width: spanWidth ?? 240,
                height: 110,
            }}
            title={`${course.code}: ${course.title} — ${course.description || prereqEval.summary}`}
        >
            {/* Primary Target Handle: incoming prerequisite connections from above (Top) */}
            <Handle
                type="target"
                position={Position.Top}
                id="top"
                className="!w-2.5 !h-2.5 !rotate-45 !rounded-none !border !border-white/40 !-top-1.5 transition-transform hover:!scale-125 !bg-[var(--star-pip)] !shadow-[0_0_6px_var(--constellation-beam-glow)]"
            />

            {/* Supplementary Target Handle for horizontal compatibility */}
            <Handle
                type="target"
                position={Position.Left}
                id="left"
                className="!w-1.5 !h-1.5 !bg-white/20 !border-0 opacity-40 hover:opacity-100"
            />

            {/* 1. Header: Course Code, Type Badge, Multi-Sem Indicator, and Credit Pill */}
            <div className="flex items-center justify-between gap-1 mb-0.5">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="font-mono font-semibold text-xs tracking-wider text-slate-100">
                        {course.code}
                    </span>
                    <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded-none border tracking-wider ${typeConfig.badge}`}
                    >
                        {typeConfig.label}
                    </span>
                    {isMultiSemester && (
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded-none bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            {durationSemesters}-Sem Spanning
                        </span>
                    )}
                </div>

                <span className="text-[10px] font-mono text-[var(--accent-primary)] font-semibold shrink-0 bg-white/5 border border-white/10 px-1.5 py-0.2 rounded-none">
                    {course.totalCredits} cr
                </span>
            </div>

            {/* 2. Body: Course Title (Strict 2-line clamp) */}
            <div className="my-auto py-0.5">
                <p
                    className="text-[12px] font-medium leading-snug line-clamp-2 text-slate-100"
                    title={`${course.code}: ${course.title}`}
                >
                    {course.title}
                </p>
            </div>

            {/* 3. Footer: Direct Elective Plan Toggle & Prerequisite Status */}
            <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px]">
                {course.type === 'ELECTIVE' ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleElective(course.id);
                        }}
                        className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-none border transition-all cursor-pointer ${
                            isSelectedElective
                                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                                : 'bg-white/5 text-slate-300 border-white/15 hover:border-white/30 hover:bg-white/10 hover:text-white'
                        }`}
                        title={isSelectedElective ? 'Remove elective from plan' : 'Add elective to plan'}
                        aria-pressed={isSelectedElective}
                    >
                        {isSelectedElective ? (
                            <>
                                <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[2.5]" />
                                <span>In Plan</span>
                            </>
                        ) : (
                            <>
                                <Plus className="w-2.5 h-2.5 text-slate-400" />
                                <span>Plan</span>
                            </>
                        )}
                    </button>
                ) : (
                    <div />
                )}

                {/* Prerequisite status */}
                {isPrereqUnmet ? (
                    <span
                        className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-none bg-red-950/30 text-red-400 border border-red-500/40"
                        title={prereqEval.summary}
                    >
                        <AlertTriangle className="w-2.5 h-2.5 text-red-400 shrink-0" />
                        <span className="line-clamp-1">Warning: Unmet</span>
                    </span>
                ) : hasPrerequisites ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-none bg-emerald-950/20 text-emerald-300 border border-emerald-500/30">
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                        <span>Prereqs Met</span>
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-none bg-white/5 text-slate-400 border border-white/10">
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
