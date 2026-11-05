import { memo, useMemo } from 'react';
import { usePlannerStore, calculateTotalPlannedCredits } from '@/core/store';
import { getProgram, getProgramCourses } from '@/data/mockCourses';
import { ExportPdfButton } from '@/features/planner/components/ExportPdfButton';
import type { Course, DegreeProgram } from '@/types/curriculum';
import { DegreeSelector } from './DegreeSelector';

export interface TopNavProps {
    courses?: Course[];
    program?: DegreeProgram;
    totalCreditsRequired?: number;
    className?: string;
    children?: React.ReactNode;
}

/**
 * Top Navigation Bar (Skyrim Skill Tree Celestial Architecture).
 * Austere dark slate HUD with heavy backdrop blur, tracked-out classical 'Cinzel' logomark,
 * flush translucent department switcher, and a Skyrim-modeled metallic skill progression bar.
 * Responsively tuned for seamless layout compliance across mobile, tablet, and desktop viewports.
 *
 * Reactively recalculates graduation progress and credit meters whenever electives or
 * course completions are toggled in the store.
 */
export const TopNav = memo(function TopNav({
    courses,
    program,
    totalCreditsRequired = 150,
    className = '',
    children,
}: TopNavProps) {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);
    const completedCourseIds = usePlannerStore((state) => state.completedCourseIds);

    // Resolve active program and course dataset if not explicitly injected
    const currentProgram = program ?? getProgram(activeProgramId);
    const activeCourses = courses ?? getProgramCourses(activeProgramId);
    const targetCredits = totalCreditsRequired ?? currentProgram.totalCreditsRequired ?? 150;

    // Calculate real-time graduation compliance reactively whenever electives or completions change
    const progress = useMemo(() => {
        const plannedCredits = calculateTotalPlannedCredits(activeCourses, selectedElectiveIds);
        const completedSet = new Set(completedCourseIds);
        let earnedCredits = 0;
        for (const course of activeCourses) {
            if (completedSet.has(course.id)) {
                earnedCredits += course.totalCredits;
            }
        }
        return {
            earnedCredits,
            plannedCredits,
            requiredCredits: targetCredits,
            isEligible: plannedCredits >= targetCredits,
        };
    }, [activeCourses, targetCredits, selectedElectiveIds, completedCourseIds]);

    const percentage = useMemo(() => {
        return Math.min(
            100,
            Math.max(0, Math.round((progress.plannedCredits / targetCredits) * 100))
        );
    }, [progress.plannedCredits, targetCredits]);

    return (
        <header
            className={`w-full h-14 backdrop-blur-md bg-[#030508]/85 border-b border-white/10 z-30 flex items-center justify-between px-3 sm:px-6 shrink-0 select-none shadow-2xl gap-2 ${className}`}
            data-testid="top-nav"
        >
            {/* Left Section: Brand Logo & Degree Selector */}
            <div className="flex items-center gap-2.5 sm:gap-6 shrink min-w-0">
                {/* CourseFlow Brand Identity */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Minimalist Skyrim diamond star icon */}
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rotate-45 border border-white/20 bg-white/5 flex items-center justify-center shrink-0">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-[var(--star-pip)] shadow-[0_0_8px_var(--constellation-beam)]" />
                    </div>
                    <div className="flex items-baseline gap-1.5 sm:gap-2">
                        <span className="font-serif tracking-[0.15em] sm:tracking-[0.2em] font-semibold text-slate-100 text-xs sm:text-sm uppercase whitespace-nowrap">
                            CourseFlow
                        </span>
                        <span className="hidden lg:inline-flex items-center px-1.5 py-0.2 rounded-none text-[9px] font-mono bg-white/5 text-slate-400 border border-white/10 uppercase tracking-widest">
                            Curriculum
                        </span>
                    </div>
                </div>

                <div className="h-4 sm:h-5 w-[1px] bg-white/10 hidden sm:block shrink-0" />

                {/* Degree Switcher Dropdown */}
                <DegreeSelector />
            </div>

            {/* Right Section: Global Graduation Credit Counter & PDF Exporter Action */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                {/* Global Graduation Credit Counter: Skyrim Skill Progression Bar */}
                <div
                    className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1 sm:py-1.5 rounded-none border text-xs transition-colors shrink-0 ${
                        progress.isEligible
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                            : 'bg-white/[0.03] border-white/10 text-slate-300'
                    }`}
                    data-testid="graduation-credit-counter"
                >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <div
                            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 border shrink-0 ${
                                progress.isEligible
                                    ? 'border-emerald-400 bg-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                                    : 'border-white/50 bg-[var(--star-pip)] shadow-[0_0_6px_var(--constellation-beam-glow)]'
                            }`}
                        />
                        <span className="hidden md:inline font-mono text-[11px] uppercase tracking-wider text-slate-400">
                            Graduation:
                        </span>
                        <span
                            className="font-mono font-semibold text-slate-100 text-xs tracking-wider"
                            data-testid="planned-credits-display"
                        >
                            {progress.plannedCredits}
                        </span>
                        <span className="font-mono text-slate-400 text-xs tracking-wider">
                            / {targetCredits} Credits
                        </span>
                    </div>

                    {/* Thin 3px Horizontal Track with Metallic End-Caps & Sliding Diamond Pip */}
                    <div className="hidden xl:flex items-center gap-2.5 pl-3 border-l border-white/10">
                        <div className="relative w-28 sm:w-36 h-[3px] bg-white/10 border-x border-white/40">
                            <div
                                className={`h-full transition-all duration-300 ${
                                    progress.isEligible
                                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                                        : 'bg-[var(--constellation-beam)] shadow-[0_0_8px_var(--constellation-beam-glow)]'
                                }`}
                                style={{ width: `${percentage}%` }}
                            />
                            {/* Sliding diamond pip indicator */}
                            <div
                                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border ${
                                    progress.isEligible
                                        ? 'border-white bg-emerald-300 shadow-[0_0_6px_rgba(16,185,129,0.9)]'
                                        : 'border-white/80 bg-[var(--star-pip)] shadow-[0_0_6px_var(--constellation-beam)]'
                                } pointer-events-none transition-all duration-300`}
                                style={{ left: `${percentage}%` }}
                            />
                        </div>
                        <span className="text-[10px] font-mono tracking-wider text-slate-400">
                            {percentage}%
                        </span>
                    </div>
                </div>

                {/* Client-Side PDF Study Plan Exporter (CF-116) or custom children */}
                {children ?? <ExportPdfButton program={currentProgram} />}
            </div>
        </header>
    );
});
