import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, X, ArrowRight, Plus, Check } from 'lucide-react';
import { usePlannerStore } from '@/core/store';
import { getProgramCourses } from '@/data/mockCourses';
import type { Course, CourseType } from '@/types/curriculum';

interface CourseSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectCourse?: (course: Course) => void;
}

const TYPE_FILTERS: { label: string; value: 'ALL' | CourseType }[] = [
    { label: 'All Modules', value: 'ALL' },
    { label: 'Core', value: 'CORE' },
    { label: 'Elective', value: 'ELECTIVE' },
    { label: 'Lab', value: 'LAB' },
    { label: 'Capstone', value: 'CAPSTONE' },
];

export function CourseSearchModal({ isOpen, onClose, onSelectCourse }: CourseSearchModalProps) {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);
    const toggleElective = usePlannerStore((state) => state.toggleElective);
    const openCourseDrawer = usePlannerStore((state) => state.openCourseDrawer);

    const [query, setQuery] = useState('');
    const [selectedType, setSelectedType] = useState<'ALL' | CourseType>('ALL');
    const inputRef = useRef<HTMLInputElement>(null);

    const courses = useMemo(() => getProgramCourses(activeProgramId), [activeProgramId]);

    const handleClose = useCallback(() => {
        setQuery('');
        setSelectedType('ALL');
        onClose();
    }, [onClose]);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleClose]);

    // Filter courses based on query and type
    const filteredCourses = useMemo(() => {
        const cleanQuery = query.toLowerCase().trim();
        return courses.filter((course) => {
            if (selectedType !== 'ALL' && course.type !== selectedType) {
                return false;
            }
            if (!cleanQuery) return true;
            return (
                course.code.toLowerCase().includes(cleanQuery) ||
                course.title.toLowerCase().includes(cleanQuery) ||
                course.description.toLowerCase().includes(cleanQuery)
            );
        });
    }, [courses, query, selectedType]);

    if (!isOpen) return null;

    const handleSelect = (course: Course) => {
        openCourseDrawer(course);
        onSelectCourse?.(course);
        handleClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-3 sm:px-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 cursor-pointer"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    handleClose();
                }
            }}
            data-testid="search-modal-backdrop"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Course search"
                className="w-full max-w-2xl bg-[#070B12] border border-white/20 shadow-2xl overflow-hidden flex flex-col max-h-[82vh] font-sans cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search Header Input & Actions */}
                <div className="p-3.5 sm:p-4 border-b border-white/10 flex items-center gap-2.5 sm:gap-3 bg-[#0A0F18]">
                    <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && filteredCourses.length > 0) {
                                e.preventDefault();
                                handleSelect(filteredCourses[0]);
                            }
                        }}
                        placeholder="Search courses by code or title... (e.g. EE2201, Signals)"
                        className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-xs sm:text-sm font-sans focus:outline-none"
                    />

                    {/* Clear text button if query entered */}
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="p-1 text-slate-400 hover:text-white shrink-0"
                            title="Clear search text"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {/* Prominent Close Button */}
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-2.5 py-1 sm:px-3 bg-white/5 hover:bg-white/10 active:bg-white/20 text-slate-200 hover:text-white border border-white/10 hover:border-white/20 transition-colors shrink-0 flex items-center gap-1.5 text-xs font-mono cursor-pointer"
                        aria-label="Close search dialog"
                        data-testid="search-modal-close"
                        title="Close (Esc)"
                    >
                        <X className="w-3.5 h-3.5" />
                        <span className="text-[10px] uppercase tracking-wider font-medium">Close</span>
                        <kbd className="hidden md:inline-block text-[9px] text-slate-400 font-mono ml-0.5 bg-white/5 border border-white/10 px-1 py-0.2">ESC</kbd>
                    </button>
                </div>

                {/* Filter Pills */}
                <div className="px-3.5 sm:px-4 py-2 border-b border-white/10 bg-white/[0.02] flex items-center gap-1.5 sm:gap-2 overflow-x-auto text-xs font-mono">
                    {TYPE_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            onClick={() => setSelectedType(f.value)}
                            className={`px-2 sm:px-2.5 py-0.5 sm:py-1 uppercase tracking-wider text-[10px] sm:text-xs transition-colors shrink-0 ${
                                selectedType === f.value
                                    ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/40 font-medium'
                                    : 'text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/20'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                    <span className="ml-auto text-slate-500 text-[10px] sm:text-[11px] shrink-0 font-mono">
                        {filteredCourses.length} match{filteredCourses.length !== 1 ? 'es' : ''}
                    </span>
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2">
                    {filteredCourses.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 font-mono text-xs">
                            No courses match "{query}"
                        </div>
                    ) : (
                        filteredCourses.map((course) => {
                            const isSelected = selectedElectiveIds.includes(course.id);
                            return (
                                <div
                                    key={course.id}
                                    onClick={() => handleSelect(course)}
                                    className="p-2.5 sm:p-3 hover:bg-white/5 cursor-pointer flex items-center justify-between gap-3 group transition-colors"
                                >
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                            <span className="font-mono font-semibold text-xs text-slate-200 group-hover:text-white">
                                                {course.code}
                                            </span>
                                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 border border-white/10 text-slate-400 bg-white/5">
                                                {course.type}
                                            </span>
                                            <span className="text-[10px] font-mono text-[var(--accent-primary)]">
                                                {course.totalCredits} cr
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-500">
                                                Sem {course.recommendedSemester}
                                            </span>
                                            {isSelected && (
                                                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-1 py-0.2">
                                                    In Plan
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-300 font-medium truncate">
                                            {course.title}
                                        </p>
                                        <p className="text-[11px] text-slate-400 line-clamp-1">
                                            {course.description}
                                        </p>
                                    </div>

                                    {/* Action items: Direct Elective Toggle and Drawer inspect chevron */}
                                    <div className="shrink-0 flex items-center gap-2">
                                        {course.type === 'ELECTIVE' && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleElective(course.id);
                                                }}
                                                className={`px-2 py-1 border text-[10px] font-mono uppercase tracking-wider transition-colors shrink-0 flex items-center gap-1 ${
                                                    isSelected
                                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                                                        : 'bg-white/5 text-slate-300 border-white/15 hover:border-white/30 hover:text-white'
                                                }`}
                                                data-testid={`search-toggle-elective-${course.id}`}
                                                title={isSelected ? 'Remove from plan' : 'Add to plan'}
                                            >
                                                {isSelected ? (
                                                    <>
                                                        <Check className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
                                                        <span>In Plan</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="w-3 h-3 text-slate-400" />
                                                        <span>Add to Plan</span>
                                                    </>
                                                )}
                                            </button>
                                        )}
                                        <div className="text-slate-500 group-hover:text-[var(--accent-primary)] transition-colors">
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
