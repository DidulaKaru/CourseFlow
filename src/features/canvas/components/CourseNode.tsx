import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { CourseLayoutNode } from '@/core/layout';
import type { CourseType } from '@/types/curriculum';

export type NodeHighlightStatus = 'normal' | 'active' | 'upstream' | 'downstream' | 'dimmed';

export interface ExtendedCourseNodeData {
    highlightStatus?: NodeHighlightStatus;
}

const TYPE_STYLES: Record<CourseType, { badge: string; label: string }> = {
    CORE: {
        badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
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
        badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        label: 'LAB',
    },
};

export const CourseNode = memo(function CourseNode({
    data,
    selected,
}: NodeProps<CourseLayoutNode>) {
    const { course, isMultiSemester, durationSemesters, spanWidth } = data;
    const highlightStatus = (data as unknown as ExtendedCourseNodeData).highlightStatus ?? 'normal';

    const typeConfig = TYPE_STYLES[course.type] ?? TYPE_STYLES.CORE;

    // Determine card visual status styles
    let statusContainerClasses = 'bg-slate-900/90 border-slate-700/80 text-slate-100 hover:border-slate-500 shadow-sm';
    let statusBadge: React.ReactNode = null;

    if (highlightStatus === 'active' || selected) {
        statusContainerClasses =
            'bg-slate-900 border-indigo-500 ring-2 ring-indigo-500/80 shadow-lg shadow-indigo-500/25 text-white';
        statusBadge = (
            <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                Selected
            </span>
        );
    } else if (highlightStatus === 'upstream') {
        statusContainerClasses =
            'bg-slate-900 border-cyan-400 ring-2 ring-cyan-500/70 shadow-md shadow-cyan-500/20 text-white';
        statusBadge = (
            <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                Prerequisite
            </span>
        );
    } else if (highlightStatus === 'downstream') {
        statusContainerClasses =
            'bg-slate-900 border-emerald-400 ring-2 ring-emerald-500/70 shadow-md shadow-emerald-500/20 text-white';
        statusBadge = (
            <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Unlocked
            </span>
        );
    } else if (highlightStatus === 'dimmed') {
        statusContainerClasses = 'bg-slate-950/60 border-slate-800 text-slate-500 opacity-25 grayscale-[30%]';
    }

    return (
        <div
            className={`relative rounded-xl border p-3.5 transition-all duration-200 select-none cursor-pointer flex flex-col justify-between ${statusContainerClasses}`}
            style={{
                width: spanWidth ?? 240,
                minHeight: 110,
            }}
            title={`${course.code}: ${course.title}`}
        >
            {/* Target Handle: incoming prerequisite connections */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-2.5 !h-2.5 !bg-cyan-400 !border-2 !border-slate-900 transition-transform hover:!scale-125"
            />

            {/* Card Header: Course Code, Type Badge, and Credit Pill */}
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <div className="flex items-center gap-1.5">
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
                    <span className="text-[11px] font-medium text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60">
                        {course.totalCredits} cr
                    </span>
                </div>
            </div>

            {/* Card Body: Course Title */}
            <div className="my-1 flex-1">
                <p className="text-xs font-medium leading-snug line-clamp-2 text-slate-200">
                    {course.title}
                </p>
            </div>

            {/* Card Footer: Status Indicators & Spanning Banner */}
            <div className="mt-1 flex items-center justify-between text-[10px]">
                {isMultiSemester ? (
                    <span className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        {durationSemesters}-Sem Spanning
                    </span>
                ) : (
                    <span className="text-slate-500 font-mono">
                        Sem {data.semesterIndex}
                    </span>
                )}

                {statusBadge}
            </div>

            {/* Source Handle: outgoing unlocked connections */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-2.5 !h-2.5 !bg-emerald-400 !border-2 !border-slate-900 transition-transform hover:!scale-125"
            />
        </div>
    );
});
