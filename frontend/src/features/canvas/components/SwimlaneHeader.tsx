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

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * Individual Semester Swimlane Header Card.
 * Modeled after Skyrim's celestial constellation equator horizon.
 * Features classical Roman numeral watermark, 'Cinzel' typography, hairline metallic dividers,
 * etched course count tags, and precision credit status indicators.
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

    // Calculate percentage fill relative to 24 credit maximum
    const meterPercentage = Math.min(100, Math.max(0, Math.round((credits / maxCredits) * 100)));
    const roman = ROMAN_NUMERALS[semesterIndex - 1] ?? semesterIndex;

    return (
        <div
            className={`relative overflow-hidden rounded-sm border backdrop-blur-md px-4 py-2.5 transition-all duration-200 select-none flex items-center justify-between gap-4 ${
                isValid
                    ? 'bg-[#070B12]/85 border-white/10 text-slate-200 hover:border-white/20'
                    : isUnderload
                    ? 'bg-[#070B12]/85 border-rose-500/40 text-slate-200 shadow-[0_0_12px_rgba(244,63,94,0.1)]'
                    : 'bg-[#070B12]/85 border-amber-500/40 text-slate-200 shadow-[0_0_12px_rgba(245,158,11,0.1)]'
            } ${className}`}
            style={style}
            data-testid={`swimlane-header-${semesterIndex}`}
        >
            {/* Atmospheric Celestial Roman Numeral Watermark */}
            <span
                className="absolute left-3 top-1/2 -translate-y-1/2 font-serif font-black text-4xl sm:text-5xl text-white opacity-[0.04] pointer-events-none select-none tracking-widest"
                aria-hidden="true"
            >
                {roman}
            </span>

            {/* 1. Left Section: Celestial Star Pip, Semester Title & Course Count */}
            <div className="flex items-center gap-3 shrink-0 relative z-10">
                <div className="w-2 h-2 rotate-45 border border-white/60 bg-[var(--star-pip)] shadow-[0_0_6px_var(--constellation-beam)]" />
                <span className="font-serif uppercase font-bold text-xs tracking-[0.15em] text-slate-200">
                    Semester {semesterIndex}
                </span>
                {typeof courseCount === 'number' && (
                    <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-none border border-white/10 uppercase tracking-wider">
                        {courseCount} courses
                    </span>
                )}
            </div>

            {/* 2. Middle Section: Credit Meter Horizon Bar */}
            <div className="flex-1 max-w-xs mx-4 hidden sm:block relative z-10">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-mono uppercase tracking-wider">
                    <span>Target: {minCredits} cr</span>
                    <span>Max: {maxCredits} cr</span>
                </div>
                <div className="relative w-full h-[3px] bg-white/10 border-x border-white/30">
                    {/* Minimum 18 credit threshold marker */}
                    <div
                        className="absolute -top-1 -bottom-1 w-[1px] bg-white/40 z-10"
                        style={{ left: `${(minCredits / maxCredits) * 100}%` }}
                        title={`Minimum credit threshold (${minCredits} cr)`}
                    />
                    <div
                        className={`h-full transition-all duration-300 ${
                            isValid
                                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                                : isUnderload
                                ? 'bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.6)]'
                                : 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]'
                        }`}
                        style={{ width: `${meterPercentage}%` }}
                    />
                </div>
            </div>

            {/* 3. Right Section: Status Pill & Real-Time Credit Badge */}
            <div className="flex items-center gap-3 shrink-0 relative z-10">
                {isValid ? (
                    <span
                        className="inline-flex items-center gap-1.5 text-xs font-mono font-medium px-2.5 py-1 rounded-none bg-emerald-950/30 text-emerald-300 border border-emerald-500/30"
                        title={`Semester load is valid (between ${minCredits} and ${maxCredits} credits)`}
                    >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{credits} cr</span>
                        <span className="text-[10px] text-emerald-400/80 hidden md:inline">• Valid Load</span>
                    </span>
                ) : isUnderload ? (
                    <span
                        className="inline-flex items-center gap-1.5 text-xs font-mono font-medium px-2.5 py-1 rounded-none bg-rose-950/30 text-rose-300 border border-rose-500/40"
                        title={`Workload underload warning: ${credits} credits planned. Minimum required is ${minCredits} credits.`}
                    >
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{credits} / {minCredits} cr</span>
                        <span className="text-[10px] text-rose-400/80 hidden md:inline">• Load &lt; {minCredits} cr</span>
                    </span>
                ) : (
                    <span
                        className="inline-flex items-center gap-1.5 text-xs font-mono font-medium px-2.5 py-1 rounded-none bg-amber-950/30 text-amber-300 border border-amber-500/40"
                        title={`Workload overload warning: ${credits} credits planned. Maximum recommended is ${maxCredits} credits.`}
                    >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{credits} / {maxCredits} cr</span>
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
