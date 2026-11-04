import { memo } from 'react';
import { usePlannerStore } from '@/core/store';
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
 */
export const TopNav = memo(function TopNav({
    courses,
    program,
    totalCreditsRequired = 150,
    className = '',
    children,
}: TopNavProps) {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const getGraduationProgress = usePlannerStore((state) => state.getGraduationProgress);

    // Resolve active program and course dataset if not explicitly injected
    const currentProgram = program ?? getProgram(activeProgramId);
    const activeCourses = courses ?? getProgramCourses(activeProgramId);
    const targetCredits = totalCreditsRequired ?? currentProgram.totalCreditsRequired ?? 150;

    // Calculate real-time graduation compliance
    const progress = getGraduationProgress(activeCourses, targetCredits);
    const percentage = Math.min(
        100,
        Math.max(0, Math.round((progress.plannedCredits / targetCredits) * 100))
    );

    return (
        <header
            className={`w-full h-14 backdrop-blur-md bg-[#030508]/85 border-b border-white/10 z-30 flex items-center justify-between px-4 sm:px-6 shrink-0 select-none shadow-2xl ${className}`}
            data-testid="top-nav"
        >
            {/* Left Section: Brand Logo & Degree Selector */}
            <div className="flex items-center gap-4 sm:gap-6">
                {/* CourseFlow Brand Identity */}
                <div className="flex items-center gap-2.5">
                    {/* Minimalist Skyrim diamond star icon */}
                    <div className="w-6 h-6 rotate-45 border border-white/20 bg-white/5 flex items-center justify-center">
                        <div className="w-2 h-2 rotate-45 bg-[var(--star-pip)] shadow-[0_0_8px_var(--constellation-beam)]" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="font-serif tracking-[0.2em] font-semibold text-slate-100 text-sm uppercase">
                            CourseFlow
                        </span>
                        <span className="hidden md:inline-flex items-center px-1.5 py-0.2 rounded-none text-[9px] font-mono bg-white/5 text-slate-400 border border-white/10 uppercase tracking-widest">
                            Curriculum
                        </span>
                    </div>
                </div>

                <div className="h-5 w-[1px] bg-white/10 hidden sm:block" />

                {/* Degree Switcher Dropdown */}
                <DegreeSelector />
            </div>

            {/* Right Section: Global Graduation Credit Counter & PDF Exporter Action */}
            <div className="flex items-center gap-3 sm:gap-5">
                {/* Global Graduation Credit Counter: Skyrim Skill Progression Bar */}
                <div
                    className={`flex items-center gap-3 px-3 py-1.5 rounded-none border text-xs transition-colors ${
                        progress.isEligible
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                            : 'bg-white/[0.03] border-white/10 text-slate-300'
                    }`}
                    data-testid="graduation-credit-counter"
                >
                    <div className="flex items-center gap-2">
                        <div
                            className={`w-2 h-2 rotate-45 border ${
                                progress.isEligible
                                    ? 'border-emerald-400 bg-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                                    : 'border-white/50 bg-[var(--star-pip)] shadow-[0_0_6px_var(--constellation-beam-glow)]'
                            }`}
                        />
                        <span className="hidden sm:inline font-mono text-[11px] uppercase tracking-wider text-slate-400">
                            Graduation:
                        </span>
                        <span className="font-mono font-semibold text-slate-100 text-xs tracking-wider">
                            {progress.plannedCredits}
                        </span>
                        <span className="font-mono text-slate-400 text-xs tracking-wider">
                            / {targetCredits} Credits
                        </span>
                    </div>

                    {/* Thin 3px Horizontal Track with Metallic End-Caps & Sliding Diamond Pip */}
                    <div className="hidden lg:flex items-center gap-2.5 pl-3 border-l border-white/10">
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
