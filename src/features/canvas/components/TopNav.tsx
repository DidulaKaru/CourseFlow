import { memo } from 'react';
import { Award, CheckCircle2, Workflow } from 'lucide-react';
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
 * Top Navigation Bar (CF-115 & CF-116).
 * Houses CourseFlow brand identity, the degree program dropdown switcher,
 * global graduation credit counter (N / 150 Credits), and client-side PDF export action.
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
            className={`w-full h-14 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 z-30 flex items-center justify-between px-4 sm:px-6 shrink-0 select-none shadow-lg ${className}`}
            data-testid="top-nav"
        >
            {/* Left Section: Brand Logo & Degree Selector */}
            <div className="flex items-center gap-3 sm:gap-6">
                {/* CourseFlow Brand Identity */}
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-md shadow-indigo-500/20">
                        <Workflow className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold text-white tracking-tight">
                            Course<span className="text-indigo-400">Flow</span>
                        </span>
                        <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                            Curriculum
                        </span>
                    </div>
                </div>

                <div className="h-5 w-[1px] bg-slate-800 hidden sm:block" />

                {/* Degree Switcher Dropdown */}
                <DegreeSelector />
            </div>

            {/* Right Section: Global Graduation Credit Counter & PDF Exporter Action */}
            <div className="flex items-center gap-3 sm:gap-4">
                {/* Global Graduation Credit Counter */}
                <div
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                        progress.isEligible
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                            : 'bg-slate-800/80 border-slate-700/80 text-slate-200'
                    }`}
                    data-testid="graduation-credit-counter"
                >
                    <div className="flex items-center gap-1.5">
                        {progress.isEligible ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                            <Award className="w-4 h-4 text-indigo-400 shrink-0" />
                        )}
                        <span className="hidden sm:inline text-[11px] font-medium text-slate-400">
                            Graduation:
                        </span>
                        <span className="font-mono font-bold text-white text-xs sm:text-sm">
                            {progress.plannedCredits}
                        </span>
                        <span className="text-slate-400 text-xs">/ {targetCredits} Credits</span>
                    </div>

                    {/* Progress Bar & Status Pill */}
                    <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-700/60">
                        <div className="w-16 h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                    progress.isEligible
                                        ? 'bg-emerald-400'
                                        : 'bg-gradient-to-r from-indigo-500 to-indigo-400'
                                }`}
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                        <span
                            className={`text-[10px] font-mono font-semibold ${
                                progress.isEligible ? 'text-emerald-400' : 'text-slate-400'
                            }`}
                        >
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
