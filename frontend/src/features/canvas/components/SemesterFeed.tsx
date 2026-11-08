import { useMemo } from 'react';
import { AlertTriangle, Check, Plus, ChevronRight } from 'lucide-react';
import { usePlannerStore, calculateSemesterCredits } from '@/core/store';
import { getProgramCourses } from '@/data/mockCourses';
import { evaluatePlannedPrerequisite } from '@/core/algorithms/ast_evaluator';
import type { Course, CourseType } from '@/types/curriculum';

const TYPE_STYLES: Record<CourseType, { badge: string; label: string }> = {
    CORE: {
        badge: 'border-white/15 text-slate-300 bg-white/5',
        label: 'CORE',
    },
    ELECTIVE: {
        badge: 'border-white/15 text-slate-400 bg-white/5',
        label: 'ELECTIVE',
    },
    CAPSTONE: {
        badge: 'border-amber-500/30 text-amber-300 bg-amber-950/20',
        label: 'CAPSTONE',
    },
    LAB: {
        badge: 'border-cyan-500/30 text-cyan-300 bg-cyan-950/20',
        label: 'LAB',
    },
};

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export function SemesterFeed() {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);
    const toggleElective = usePlannerStore((state) => state.toggleElective);
    const openCourseDrawer = usePlannerStore((state) => state.openCourseDrawer);

    const activeCourses = useMemo(() => getProgramCourses(activeProgramId), [activeProgramId]);

    // Group courses by recommended semester (1 to 8)
    const semesterBuckets = useMemo(() => {
        const buckets: Record<number, Course[]> = {};
        for (let i = 1; i <= 8; i++) {
            buckets[i] = [];
        }
        for (const course of activeCourses) {
            const sem = course.recommendedSemester;
            if (buckets[sem]) {
                buckets[sem].push(course);
            }
        }
        return buckets;
    }, [activeCourses]);

    return (
        <div className="w-full h-full overflow-y-auto font-sans scroll-smooth">
            {/* Sticky Semester Jump Bar */}
            <div className="sticky top-0 z-20 w-full bg-[#030508]/90 backdrop-blur-md border-b border-white/10 py-2 px-3 sm:px-6 lg:px-10 shadow-lg">
                <div className="w-full max-w-[1600px] mx-auto flex items-center justify-between gap-3 overflow-x-auto scrollbar-none">
                    <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-slate-400 shrink-0 hidden sm:inline">
                        Jump to Semester:
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full sm:w-auto">
                        {Array.from({ length: 8 }, (_, i) => i + 1).map((sem) => (
                            <a
                                key={sem}
                                href={`#semester-${sem}`}
                                className="px-2 py-1 text-[10px] sm:text-xs font-mono uppercase tracking-wider text-slate-300 hover:text-white bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 transition-colors shrink-0"
                            >
                                S{sem}
                            </a>
                        ))}
                    </div>
                </div>
            </div>

            <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-10 py-5 sm:py-7 space-y-8 pb-28">
                {Array.from({ length: 8 }, (_, i) => i + 1).map((semIndex) => {
                    const coursesInSem = semesterBuckets[semIndex] ?? [];
                    const semesterCredits = calculateSemesterCredits(semIndex, activeCourses, selectedElectiveIds);
                    const isValidLoad = semesterCredits >= 18 && semesterCredits <= 24;
                    const isUnderload = semesterCredits < 18;

                    return (
                        <section
                            key={semIndex}
                            id={`semester-${semIndex}`}
                            className="space-y-3 scroll-mt-16"
                        >
                            {/* Semester Header Horizon */}
                            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <span className="font-serif text-lg text-slate-500 font-light select-none tracking-widest">
                                        {ROMAN_NUMERALS[semIndex - 1]}
                                    </span>
                                    <h2 className="font-serif uppercase text-xs sm:text-sm font-semibold tracking-[0.15em] text-slate-100">
                                        Semester {semIndex}
                                    </h2>
                                    <span className="text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 px-1.5 py-0.5">
                                        {coursesInSem.length} Modules
                                    </span>
                                </div>

                                {/* Workload Indicator Badge */}
                                <div
                                    className={`text-[10px] sm:text-[11px] font-mono px-2 py-0.5 border flex items-center gap-1.5 shrink-0 ${
                                        isValidLoad
                                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                                            : isUnderload
                                            ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                                            : 'bg-red-950/30 border-red-500/40 text-red-300'
                                    }`}
                                >
                                    <span>{semesterCredits} cr</span>
                                    <span className="text-slate-400">•</span>
                                    <span>{isValidLoad ? 'Valid Load' : isUnderload ? 'Underload (<18)' : 'Overload (>24)'}</span>
                                </div>
                            </div>

                            {/* Courses Grid in this Semester */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3">
                            {coursesInSem.map((course) => {
                                const isElective = course.type === 'ELECTIVE';
                                const isSelected = selectedElectiveIds.includes(course.id);
                                const prereqEval = evaluatePlannedPrerequisite(
                                    course,
                                    activeCourses,
                                    selectedElectiveIds
                                );
                                const typeConfig = TYPE_STYLES[course.type] ?? TYPE_STYLES.CORE;

                                return (
                                    <div
                                        key={course.id}
                                        id={`course-${course.id}`}
                                        role="article"
                                        tabIndex={0}
                                        aria-label={`${course.code}: ${course.title}, ${course.totalCredits} credits, ${typeConfig.label}`}
                                        onClick={() => openCourseDrawer(course)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                openCourseDrawer(course);
                                            }
                                        }}
                                        className={`group relative p-3 bg-[#070B12]/85 border transition-all cursor-pointer flex flex-col justify-between hover:border-[var(--constellation-beam)]/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--constellation-beam)] focus-visible:border-[var(--constellation-beam)] ${
                                            isSelected
                                                ? 'border-emerald-500/40 ring-1 ring-emerald-500/20 bg-[#0A1018]'
                                                : !prereqEval.isSatisfied
                                                ? 'border-red-500/30 bg-red-950/10'
                                                : 'border-white/10'
                                        }`}
                                    >
                                        <div>
                                            {/* Top Row: Code, Type, Credits */}
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono font-semibold text-xs text-slate-100">
                                                        {course.code}
                                                    </span>
                                                    <span className={`text-[9px] font-mono px-1 py-0.5 border uppercase ${typeConfig.badge}`}>
                                                        {typeConfig.label}
                                                    </span>
                                                </div>
                                                <span className="font-mono text-xs font-semibold text-[var(--accent-primary)]">
                                                    {course.totalCredits} cr
                                                </span>
                                            </div>

                                            {/* Title */}
                                            <h3 className="text-xs font-medium text-slate-100 line-clamp-2 leading-snug group-hover:text-white">
                                                {course.title}
                                            </h3>
                                        </div>

                                        {/* Bottom Action / Status */}
                                        <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
                                            {/* Prerequisite status */}
                                            <div>
                                                {prereqEval.status === 'no_prereqs' ? (
                                                    <span className="text-slate-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-none">No Prereqs</span>
                                                ) : prereqEval.isSatisfied ? (
                                                    <span className="text-emerald-300 bg-emerald-950/20 border border-emerald-500/30 px-1.5 py-0.5 rounded-none flex items-center gap-1">
                                                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                                                        <span>Prereqs Met</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-red-400 bg-red-950/20 border border-red-500/30 px-1.5 py-0.5 rounded-none flex items-center gap-1" title={prereqEval.summary}>
                                                        <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                                                        <span>Missing Prereqs</span>
                                                    </span>
                                                )}
                                            </div>

                                            {/* Elective Toggle Button */}
                                            {isElective ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleElective(course.id);
                                                    }}
                                                    className={`px-2 py-0.5 border flex items-center gap-1 uppercase tracking-wider text-[9px] transition-colors ${
                                                        isSelected
                                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                                                            : 'bg-white/5 text-slate-300 border-white/15 hover:border-white/30 hover:text-white'
                                                    }`}
                                                >
                                                    {isSelected ? (
                                                        <>
                                                            <Check className="w-2.5 h-2.5" />
                                                            <span>In Plan</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Plus className="w-2.5 h-2.5" />
                                                            <span>Add to Plan</span>
                                                        </>
                                                    )}
                                                </button>
                                            ) : (
                                                <span className="text-slate-500 uppercase tracking-widest text-[9px] flex items-center gap-0.5">
                                                    <span>Inspect</span>
                                                    <ChevronRight className="w-2.5 h-2.5" />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
            </div>
        </div>
    );
}
