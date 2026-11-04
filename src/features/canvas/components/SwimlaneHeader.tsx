import { memo } from 'react';
import { useViewport } from '@xyflow/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import {
    DEFAULT_LAYOUT_CONFIG,
    getSemesterXCoordinate,
} from '@/core/layout';
import type { LayoutConfig } from '@/core/layout';
import { usePlannerStore } from '@/core/store';
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
            className={`rounded-xl border backdrop-blur-md p-2.5 shadow-xl transition-all duration-200 select-none flex flex-col justify-between ${
                isValid
                    ? 'bg-slate-900/95 border-slate-700/80 text-slate-100 hover:border-slate-600'
                    : isUnderload
                    ? 'bg-slate-900/95 border-rose-500/80 ring-1 ring-rose-500/40 text-slate-100 shadow-rose-950/20'
                    : 'bg-slate-900/95 border-amber-500/80 ring-1 ring-amber-500/40 text-slate-100 shadow-amber-950/20'
            } ${className}`}
            style={style}
            data-testid={`swimlane-header-${semesterIndex}`}
        >
            {/* 1. Header Bar: Semester Index and Real-Time Credit Badge */}
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="font-bold text-xs text-white tracking-wide">
                        Semester {semesterIndex}
                    </span>
                </div>

                {/* Status Pill Indicator */}
                {isValid ? (
                    <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        title={`Semester load is valid (between ${minCredits} and ${maxCredits} credits)`}
                    >
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>{credits} cr</span>
                    </span>
                ) : isUnderload ? (
                    <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/40 animate-pulse"
                        title={`Workload underload warning: ${credits} credits planned. Minimum required is ${minCredits} credits.`}
                    >
                        <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                        <span>{credits} / {minCredits} cr</span>
                    </span>
                ) : (
                    <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40"
                        title={`Workload overload warning: ${credits} credits planned. Maximum recommended is ${maxCredits} credits.`}
                    >
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>{credits} / {maxCredits} cr</span>
                    </span>
                )}
            </div>

            {/* 2. Credit Meter Progress Bar */}
            <div className="my-1">
                <div className="relative w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    {/* Minimum 18 credit threshold marker (75% mark for 24 max) */}
                    <div
                        className="absolute top-0 bottom-0 w-[2px] bg-slate-600 z-10"
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

            {/* 3. Footer: Subtext & Warning Label */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                <span className="font-mono text-[9px] text-slate-500">
                    {typeof courseCount === 'number' ? `${courseCount} courses` : `Min ${minCredits} cr`}
                </span>

                {isValid ? (
                    <span className="text-emerald-400 text-[10px] font-medium">Valid Load</span>
                ) : isUnderload ? (
                    <span className="text-rose-400 text-[10px] font-semibold">Load &lt; {minCredits} cr</span>
                ) : (
                    <span className="text-amber-400 text-[10px] font-semibold">Load &gt; {maxCredits} cr</span>
                )}
            </div>
        </div>
    );
});

export interface SwimlaneHeadersProps {
    courses: Course[];
    semestersCount?: number;
    minCredits?: number;
    maxCredits?: number;
    config?: LayoutConfig;
    className?: string;
}

/**
 * Renders all 8 sticky semester swimlane column headers.
 * Synchronizes horizontally with React Flow's viewport pan and zoom while remaining sticky at the top.
 */
export function SwimlaneHeaders({
    courses,
    semestersCount = DEFAULT_LAYOUT_CONFIG.semestersCount,
    minCredits = 18,
    maxCredits = 24,
    config = DEFAULT_LAYOUT_CONFIG,
    className = '',
}: SwimlaneHeadersProps) {
    // React Flow viewport hook for pan and zoom tracking
    const { x: panX, zoom } = useViewport();

    // Zustand store reactive credit calculation helper
    const getSemesterCredits = usePlannerStore((state) => state.getSemesterCredits);

    // Compute active credits and counts for each semester column
    const semesterData = Array.from({ length: semestersCount }, (_, idx) => {
        const sem = idx + 1;
        const credits = getSemesterCredits(sem, courses);
        const colX = getSemesterXCoordinate(sem, config);

        // Screen position based on React Flow viewport coordinate transformation
        const screenX = colX * zoom + panX;
        const screenWidth = config.nodeWidth * zoom;

        return {
            semesterIndex: sem,
            credits,
            screenX,
            screenWidth,
        };
    });

    return (
        <div
            className={`absolute top-16 left-0 right-0 z-20 pointer-events-none overflow-visible ${className}`}
            data-testid="swimlane-headers-container"
        >
            {semesterData.map((data) => (
                <div
                    key={`swimlane-col-${data.semesterIndex}`}
                    className="absolute pointer-events-auto"
                    style={{
                        transform: `translate3d(${data.screenX}px, 0, 0)`,
                        width: Math.max(160, data.screenWidth),
                    }}
                >
                    <SwimlaneHeader
                        semesterIndex={data.semesterIndex}
                        credits={data.credits}
                        minCredits={minCredits}
                        maxCredits={maxCredits}
                    />
                </div>
            ))}
        </div>
    );
}
