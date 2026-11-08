import { memo, useState, useEffect, useMemo } from 'react';
import { Search, LayoutGrid, Network } from 'lucide-react';
import { usePlannerStore, calculateGraduationProgress } from '@/core/store';
import { getProgram, getProgramCourses } from '@/data/mockCourses';
import { ExportPdfButton } from '@/features/planner/components/ExportPdfButton';
import type { Course, DegreeProgram } from '@/types/curriculum';
import { DegreeSelector } from './DegreeSelector';
import { PlanSelector } from './PlanSelector';
import { CourseSearchModal } from './CourseSearchModal';

export interface TopNavProps {
    courses?: Course[];
    program?: DegreeProgram;
    totalCreditsRequired?: number;
    className?: string;
    children?: React.ReactNode;
}

export const TopNav = memo(function TopNav({
    courses,
    program,
    totalCreditsRequired = 150,
    className = '',
    children,
}: TopNavProps) {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);
    const mobileViewMode = usePlannerStore((state) => state.mobileViewMode);
    const setMobileViewMode = usePlannerStore((state) => state.setMobileViewMode);

    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Global keyboard shortcut: Cmd+K / Ctrl+K or '/' to toggle search dialog
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isEditingText =
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target instanceof HTMLElement && e.target.isContentEditable);

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setIsSearchOpen((prev) => !prev);
            } else if (e.key === '/' && !isEditingText) {
                e.preventDefault();
                setIsSearchOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Resolve active program and course dataset
    const currentProgram = program ?? getProgram(activeProgramId);
    const activeCourses = courses ?? getProgramCourses(activeProgramId);
    const targetCredits = totalCreditsRequired ?? currentProgram.totalCreditsRequired ?? 150;

    // Calculate real-time graduation compliance reactively on selected electives change
    const progress = useMemo(() => {
        return calculateGraduationProgress(activeCourses, selectedElectiveIds, targetCredits);
    }, [activeCourses, selectedElectiveIds, targetCredits]);

    const percentage = Math.min(
        100,
        Math.max(0, Math.round((progress.plannedCredits / targetCredits) * 100))
    );

    return (
        <>
            <header
                className={`w-full backdrop-blur-md bg-[#030508]/90 border-b border-white/10 z-30 select-none shadow-2xl flex flex-col ${className}`}
                data-testid="top-nav"
            >
                {/* Primary HUD Row */}
                <div className="h-14 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
                    {/* Left Section: Brand Logo, Degree Selector, and Plan Selector */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        {/* CourseFlow Brand Identity */}
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            <div className="w-5 h-5 sm:w-6 sm:h-6 rotate-45 border border-white/20 bg-white/5 flex items-center justify-center shrink-0">
                                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 bg-[var(--star-pip)] shadow-[0_0_8px_var(--constellation-beam)]" />
                            </div>
                            <span className="hidden sm:inline font-serif tracking-[0.15em] sm:tracking-[0.2em] font-semibold text-slate-100 text-xs sm:text-sm uppercase whitespace-nowrap">
                                CourseFlow
                            </span>
                        </div>

                        <div className="h-4 sm:h-5 w-[1px] bg-white/10 hidden md:block shrink-0" />

                        {/* Degree Switcher */}
                        <DegreeSelector />

                        {/* Multi-Plan Draft Selector */}
                        <PlanSelector />
                    </div>

                    {/* Right Section: Search, View Mode Toggle, and Desktop Progress Bar */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        {/* Search Action */}
                        <button
                            type="button"
                            onClick={() => setIsSearchOpen(true)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-mono transition-colors"
                            title="Search modules (Ctrl+K)"
                            aria-label="Search courses"
                        >
                            <Search className="w-3.5 h-3.5 text-slate-400" />
                            <span className="hidden lg:inline text-[11px]">Search</span>
                            <kbd className="hidden xl:inline-block px-1 py-0.5 text-[9px] text-slate-500 bg-white/5 border border-white/10 uppercase">
                                ⌘K
                            </kbd>
                        </button>

                        {/* View Mode Toggle: Constellation Map vs Semester Feed */}
                        <div className="inline-flex items-center border border-white/10 bg-white/5 p-0.5 text-xs font-mono">
                            <button
                                type="button"
                                onClick={() => setMobileViewMode('canvas')}
                                className={`px-2 py-0.5 flex items-center gap-1 transition-colors ${
                                    mobileViewMode === 'canvas'
                                        ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/40 font-semibold'
                                        : 'text-slate-400 hover:text-white border border-transparent'
                                }`}
                                title="Constellation Star Chart View"
                                aria-label="Constellation view"
                            >
                                <Network className="w-3 h-3" />
                                <span className="hidden sm:inline">Constellation</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMobileViewMode('list')}
                                className={`px-2 py-0.5 flex items-center gap-1 transition-colors ${
                                    mobileViewMode === 'list'
                                        ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/40 font-semibold'
                                        : 'text-slate-400 hover:text-white border border-transparent'
                                }`}
                                title="Semester List Feed View"
                                aria-label="Semester list view"
                            >
                                <LayoutGrid className="w-3 h-3" />
                                <span className="hidden sm:inline">Semester List</span>
                            </button>
                        </div>

                        {/* Desktop Graduation Bar & PDF Button (Visible on xl and up, >= 1280px) */}
                        <div className="hidden xl:flex items-center gap-3">
                            <div
                                className={`flex items-center gap-2.5 px-3 py-1 rounded-none border text-xs transition-colors shrink-0 ${
                                    progress.isEligible
                                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                                        : 'bg-white/[0.03] border-white/10 text-slate-300'
                                }`}
                                data-testid="graduation-credit-counter"
                            >
                                <div className="flex items-center gap-2">
                                    <div
                                        className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 border shrink-0 ${
                                            progress.isEligible
                                                ? 'border-emerald-400 bg-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                                                : 'border-white/50 bg-[var(--star-pip)] shadow-[0_0_6px_var(--constellation-beam-glow)]'
                                        }`}
                                    />
                                    <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                                        Plan:
                                    </span>
                                    <span className="font-mono font-semibold text-slate-100 text-xs tracking-wider">
                                        {progress.plannedCredits}
                                    </span>
                                    <span className="font-mono text-slate-400 text-xs tracking-wider">
                                        / {targetCredits} Credits
                                    </span>
                                </div>

                                <div className="w-20 2xl:w-28 h-1.5 bg-white/10 relative overflow-hidden shrink-0 border border-white/20">
                                    <div
                                        className="h-full transition-all duration-300 ease-out bg-[var(--constellation-beam)] shadow-[0_0_8px_var(--constellation-beam-glow)]"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>

                                <span className="font-mono font-bold text-slate-300 text-xs w-9 text-right">
                                    {percentage}%
                                </span>
                            </div>

                            {children}
                            <ExportPdfButton />
                        </div>
                    </div>
                </div>

                {/* Sub-Horizon (Visible on screens < 1280px: Mobile, Tablet, Laptops): Credit Meter & PDF Button */}
                <div className="xl:hidden px-3 sm:px-6 py-2 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
                    <div
                        className="flex items-center gap-2 flex-1 min-w-0"
                        data-testid="graduation-credit-counter-mobile"
                    >
                        <div className="flex items-baseline gap-1 text-xs font-mono shrink-0">
                            <span className="text-slate-400 text-[10px] uppercase">Plan:</span>
                            <span className="font-semibold text-slate-100">{progress.plannedCredits}</span>
                            <span className="text-slate-400">/{targetCredits} Credits</span>
                            <span className="text-[10px] text-slate-400">({percentage}%)</span>
                        </div>
                        <div className="flex-1 h-1.5 bg-white/10 relative overflow-hidden border border-white/20 min-w-[50px] max-w-sm">
                            <div
                                className="h-full transition-all duration-300 ease-out bg-[var(--constellation-beam)]"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    </div>

                    <ExportPdfButton className="!py-1 !px-2.5 !text-[10px]" />
                </div>
            </header>

            {/* Course Search Modal */}
            <CourseSearchModal
                isOpen={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
            />
        </>
    );
});
