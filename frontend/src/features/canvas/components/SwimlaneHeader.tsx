import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import type { SwimlaneHeaderLayoutNode } from '@/core/layout';
import { usePlannerStore } from '@/core/store';
import { mockCourses } from '@/data/mockCourses';
import type { Course } from '@/types/curriculum';

export interface SwimlaneHeaderProps {
    semesterIndex: number;
    credits: number;
    minCredits?: number;
    maxCredits?: number;
    courseCount?: number;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Individual Semester Swimlane Header Card.
 * Renders semester number, real-time credit summation, progress meter, and warning/valid status pills.
 */
export const SwimlaneHeader = memo(function SwimlaneHeader({
    semesterIndex,
    credits,
    minCredits = 18,
    maxCredits = 24,
    courseCount,
    className = '',
    style,
}: SwimlaneHeaderProps) {
    const isUnderload = credits < minCredits;
    const isOverload = credits > maxCredits;
    const isValid = !isUnderload && !isOverload;

    // Calculate percentage fill relative to 24 credit maximum (minimum scale target)
    const meterPercentage = Math.min(100, Math.max(0, Math.round((credits / maxCredits) * 100)));

    return (
        <div
            className={`rounded-xl border backdrop-blur-md px-4 py-3 shadow-xl transition-all duration-200 select-none flex items-center justify-between gap-4 ${
                isValid
                    ? 'bg-slate-900/95 border-slate-700/80 text-slate-100 hover:border-slate-600'
                    : isUnderload
                    ? 'bg-slate-900/95 border-rose-500/80 ring-1 ring-rose-500/40 text-slate-100 shadow-rose-950/20'
                    : 'bg-slate-900/95 border-amber-500/80 ring-1 ring-amber-500/40 text-slate-100 shadow-amber-950/20'
            } ${className}`}
            style={style}
            data-testid={`swimlane-header-${semesterIndex}`}
        >
            {/* 1. Left Section: Semester Title & Course Count */}
            <div className="flex items-center gap-3 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50" />
                <span className="font-bold text-sm text-white tracking-wide">
                    Semester {semesterIndex}
                </span>
                {typeof courseCount === 'number' && (
                    <span className="text-xs font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                        {courseCount} courses
                    </span>
                )}
            </div>

            {/* 2. Middle Section: Credit Meter Progress Bar */}
            <div className="flex-1 max-w-xs mx-2 hidden sm:block">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-mono">
                    <span>Target: {minCredits} cr</span>
                    <span>Max: {maxCredits} cr</span>
                </div>
                <div className="relative w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/40">
                    {/* Minimum 18 credit threshold marker (75% mark for 24 max) */}
                    <div
                        className="absolute top-0 bottom-0 w-[2px] bg-slate-500 z-10"
                        style={{ left: `${(minCredits / maxCredits) * 100}%` }}
                        title={`Minimum credit threshold (${minCredits} cr)`}
                    />
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${
                            isValid
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : isUnderload
                                ? 'bg-rose-500'
                                : 'bg-amber-500'
                        }`}
                        style={{ width: `${meterPercentage}%` }}
                    />
                </div>
            </div>

            {/* 3. Right Section: Status Pill & Real-Time Credit Badge */}
            <div className="flex items-center gap-3 shrink-0">
                {isValid ? (
                    <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        title={`Semester load is valid (between ${minCredits} and ${maxCredits} credits)`}
                    >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-mono">{credits} cr</span>
                        <span className="text-[10px] text-emerald-400/80 hidden md:inline">• Valid Load</span>
                    </span>
                ) : isUnderload ? (
                    <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/40 animate-pulse"
                        title={`Workload underload warning: ${credits} credits planned. Minimum required is ${minCredits} credits.`}
                    >
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="font-mono">{credits} / {minCredits} cr</span>
                        <span className="text-[10px] text-rose-400/80 hidden md:inline">• Load &lt; {minCredits} cr</span>
                    </span>
                ) : (
                    <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40"
                        title={`Workload overload warning: ${credits} credits planned. Maximum recommended is ${maxCredits} credits.`}
                    >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="font-mono">{credits} / {maxCredits} cr</span>
                        <span className="text-[10px] text-amber-400/80 hidden md:inline">• Load &gt; {maxCredits} cr</span>
                    </span>
                )}
            </div>
        </div>
    );
});

/**
 * React Flow Custom Node for rendering Swimlane Headers directly in the canvas.
 */
export const SwimlaneHeaderNode = memo(function SwimlaneHeaderNode({
    data,
}: NodeProps<SwimlaneHeaderLayoutNode>) {
    const { semesterIndex, courseCount, width } = data;
    const getSemesterCredits = usePlannerStore((state) => state.getSemesterCredits);

    // Compute active credits reactively from store
    const credits = getSemesterCredits(semesterIndex, mockCourses);

    return (
        <div style={{ width: width ?? 1280 }} className="pointer-events-auto">
            <SwimlaneHeader
                semesterIndex={semesterIndex}
                credits={credits}
                courseCount={courseCount}
            />
        </div>
    );
});

export interface SwimlaneHeadersProps {
    courses: Course[];
    semestersCount?: number;
    minCredits?: number;
    maxCredits?: number;
    className?: string;
}

/**
 * SwimlaneHeaders container component for testing and standalone layout rendering.
 */
export function SwimlaneHeaders({
    courses,
    semestersCount = 8,
    minCredits = 18,
    maxCredits = 24,
    className = '',
}: SwimlaneHeadersProps) {
    const getSemesterCredits = usePlannerStore((state) => state.getSemesterCredits);

    const semesterData = Array.from({ length: semestersCount }, (_, idx) => {
        const sem = idx + 1;
        const credits = getSemesterCredits(sem, courses);
        return {
            semesterIndex: sem,
            credits,
        };
    });

    return (
        <div
            className={`flex flex-col gap-4 p-4 ${className}`}
            data-testid="swimlane-headers-container"
        >
            {semesterData.map((data) => (
                <SwimlaneHeader
                    key={`swimlane-col-${data.semesterIndex}`}
                    semesterIndex={data.semesterIndex}
                    credits={data.credits}
                    minCredits={minCredits}
                    maxCredits={maxCredits}
                />
            ))}
        </div>
    );
}
