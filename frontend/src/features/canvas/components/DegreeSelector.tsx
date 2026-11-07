import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { usePlannerStore } from '@/core/store';
import { AVAILABLE_PROGRAMS } from '@/data/mockCourses';
import type { DegreeProgram } from '@/types/curriculum';

export interface DegreeSelectorProps {
    className?: string;
    programs?: DegreeProgram[];
    onChange?: (programId: string) => void;
}

export function DegreeSelector({
    className = '',
    programs = AVAILABLE_PROGRAMS,
    onChange,
}: DegreeSelectorProps) {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const setActiveProgram = usePlannerStore((state) => state.setActiveProgram);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const activeProgram = programs.find((p) => p.id === activeProgramId) || programs[0];

    // Sync root dataset attribute on program change
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.dataset.department =
                activeProgramId === 'electrical-eng' ? 'ee' : 'ce';
        }
    }, [activeProgramId]);

    // Close on click outside or Escape key
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const handleSelect = (nextId: string) => {
        setActiveProgram(nextId);
        if (typeof document !== 'undefined') {
            document.documentElement.dataset.department =
                nextId === 'electrical-eng' ? 'ee' : 'ce';
        }
        onChange?.(nextId);
        setIsOpen(false);
    };

    const handleNativeChange = (e: ChangeEvent<HTMLSelectElement>) => {
        handleSelect(e.target.value);
    };

    return (
        <div
            ref={dropdownRef}
            className={`relative inline-flex items-center shrink-0 ${className}`}
            data-testid="degree-selector"
        >
            {/* Custom Celestial Dropdown Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-mono uppercase tracking-wider border border-white/10 hover:border-white/20 transition-colors select-none text-left cursor-pointer"
                title="Select Degree Program"
                aria-expanded={isOpen}
                data-testid="degree-selector-button"
            >
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 border border-white/60 bg-[var(--star-pip)] shadow-[0_0_6px_var(--constellation-beam)] shrink-0" />
                
                {/* Mobile clean label (no unreadable ellipses) */}
                <span className="sm:hidden font-medium text-slate-100 whitespace-nowrap">
                    {activeProgramId === 'electrical-eng' ? 'Electrical Eng' : 'Computer Eng'}
                </span>

                {/* Tablet / Desktop full label */}
                <span className="hidden sm:inline font-medium text-slate-100 max-w-[210px] xl:max-w-none truncate">
                    {activeProgram.name}
                </span>

                <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Hidden native select for form accessibility and test harness compatibility */}
            <select
                aria-label="Select Degree Program"
                value={activeProgramId}
                onChange={handleNativeChange}
                className="sr-only pointer-events-none"
                tabIndex={-1}
                aria-hidden="true"
            >
                {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                        {program.name}
                    </option>
                ))}
            </select>

            {/* Custom Skyrim Celestial Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 sm:w-84 bg-[#070B12]/95 backdrop-blur-md border border-white/15 shadow-2xl z-50 py-1 font-sans text-xs max-w-[calc(100vw-24px)]">
                    <div className="px-3 py-1.5 border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                        Academic Degree Program
                    </div>
                    {programs.map((prog) => {
                        const isSelected = activeProgramId === prog.id;
                        return (
                            <button
                                key={prog.id}
                                type="button"
                                onClick={() => handleSelect(prog.id)}
                                className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors font-mono text-xs uppercase ${
                                    isSelected
                                        ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-semibold'
                                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                                }`}
                            >
                                <span className="truncate pr-2">{prog.name}</span>
                                {isSelected && (
                                    <Check className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
