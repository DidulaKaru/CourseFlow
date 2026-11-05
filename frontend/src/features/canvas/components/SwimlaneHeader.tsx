import { memo, useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import type { SwimlaneHeaderLayoutNode } from '@/core/layout';
import { usePlannerStore, calculateSemesterCredits } from '@/core/store';
import { getProgramCourses } from '@/data/mockCourses';
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
            {/* Roman Numeral Atmospheric Watermark */}
            <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-serif text-5xl font-bold tracking-widest text-white/[0.04] select-none"
                aria-hidden="true"
            >
                {roman}
            </span>

            {/* 1. Left Section: Semester Title & Course Count Tag */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 relative z-10">
                <div
                    className={`w-2 h-2 rotate-45 border shrink-0 transition-colors ${
                        isValid
                            ? 'border-emerald-400 bg-emerald-400/80 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                            : isUnderload
                            ? 'border-rose-400 bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]'
                            : 'border-amber-400 bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]'
                    }`}
                />
                <h3 className="font-serif uppercase font-semibold text-xs sm:text-sm tracking-[0.15em] sm:tracking-[0.2em] text-slate-100 whitespace-nowrap">
                    Semester {semesterIndex}
                </h3>
                {typeof courseCount === 'number' && (
                    <span className="hidden sm:inline font-mono text-[10px] text-slate-400 bg-white/5 border border-white/10 px-1.5 py-0.2 rounded-none uppercase tracking-wider">
                        [{courseCount} {courseCount === 1 ? 'course' : 'courses'}]
                    </span>
                )}
            </div>

            {/* 2. Center Section: Skyrim Real-Time Workload Horizon */}
            <div className="flex-1 max-w-xs hidden sm:flex flex-col gap-1 mx-2 relative z-10">
                <div className="relative w-full h-[3px] bg-white/10 border-x border-white/30 overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 ${
                            isValid
                                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]'
                                : isUnderload
                                ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]'
                                : 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.7)]'
                        }`}
                        style={{ width: `${meterPercentage}%` }}
                    />
                </div>
            </div>

            {/* 3. Right Section: Credit Readout & Compliance Status Pill */}
            <div className="flex items-center gap-2 shrink-0 relative z-10">
                {isValid ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/30 px-2 py-0.5 rounded-none tracking-wider">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="font-semibold">{credits} cr</span>
                        <span className="text-[10px] text-emerald-400/80 hidden md:inline">• Valid Load</span>
                    </span>
                ) : isUnderload ? (
                    <span
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-rose-300 bg-rose-950/30 border border-rose-500/40 px-2 py-0.5 rounded-none tracking-wider"
                        title={`Semester load (${credits} cr) is below minimum of ${minCredits} credits`}
                    >
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{credits} / {minCredits} cr</span>
                        <span className="text-[10px] text-rose-400/80 hidden md:inline">• Load &lt; {minCredits} cr</span>
                    </span>
                ) : (
                    <span
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-amber-300 bg-amber-950/30 border border-amber-500/40 px-2 py-0.5 rounded-none tracking-wider"
                        title={`Semester load (${credits} cr) exceeds recommended maximum of ${maxCredits} credits`}
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
 * Reactively recalculates active semester credits whenever electives are toggled.
 */
export const SwimlaneHeaderNode = memo(function SwimlaneHeaderNode({
    data,
}: NodeProps<SwimlaneHeaderLayoutNode>) {
    const { semesterIndex, courseCount, width } = data;
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);

    const activeCourses = useMemo(() => getProgramCourses(activeProgramId), [activeProgramId]);

    // Compute active credits reactively from store whenever selectedElectiveIds or active program change
    const credits = useMemo(() => {
        return calculateSemesterCredits(semesterIndex, activeCourses, selectedElectiveIds);
    }, [semesterIndex, activeCourses, selectedElectiveIds]);

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
 * Reactively recalculates all semester credit sums whenever selected electives change.
 */
export function SwimlaneHeaders({
    courses,
    semestersCount = 8,
    minCredits = 18,
    maxCredits = 24,
    className = '',
}: SwimlaneHeadersProps) {
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);

    const semesterData = useMemo(() => {
        return Array.from({ length: semestersCount }, (_, idx) => {
            const sem = idx + 1;
            const credits = calculateSemesterCredits(sem, courses, selectedElectiveIds);
            return {
                semesterIndex: sem,
                credits,
            };
        });
    }, [semestersCount, courses, selectedElectiveIds]);

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
