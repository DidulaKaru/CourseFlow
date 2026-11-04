import { type ChangeEvent, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePlannerStore } from '@/core/store';
import { AVAILABLE_PROGRAMS } from '@/data/mockCourses';
import type { DegreeProgram } from '@/types/curriculum';

export interface DegreeSelectorProps {
    className?: string;
    programs?: DegreeProgram[];
    onChange?: (programId: string) => void;
}

/**
 * Degree Program Dropdown Selector.
 * Allows instant switching between programs (e.g. Computer Engineering, Electrical Engineering).
 * Dispatches `setActiveProgram` to the Zustand planner store, clears irrelevant selections,
 * and synchronizes the root document department attribute ('ce' | 'ee').
 */
export function DegreeSelector({
    className = '',
    programs = AVAILABLE_PROGRAMS,
    onChange,
}: DegreeSelectorProps) {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const setActiveProgram = usePlannerStore((state) => state.setActiveProgram);

    // Sync root dataset attribute on program change
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.dataset.department =
                activeProgramId === 'electrical-eng' ? 'ee' : 'ce';
        }
    }, [activeProgramId]);

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const nextId = e.target.value;
        setActiveProgram(nextId);
        if (typeof document !== 'undefined') {
            document.documentElement.dataset.department =
                nextId === 'electrical-eng' ? 'ee' : 'ce';
        }
        onChange?.(nextId);
    };

    return (
        <div className={`relative inline-flex items-center ${className}`}>
            <div className="absolute left-2.5 pointer-events-none flex items-center">
                {/* Skyrim celestial diamond node indicator */}
                <div className="w-2 h-2 rotate-45 border border-white/60 bg-[var(--star-pip)] shadow-[0_0_6px_var(--constellation-beam)]" />
            </div>
            <select
                aria-label="Select Degree Program"
                value={activeProgramId}
                onChange={handleChange}
                className="appearance-none bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-mono uppercase tracking-widest pl-7 pr-7 py-1.5 rounded-none border border-white/10 hover:border-white/25 focus:outline-none focus:border-[var(--constellation-beam)] transition-colors cursor-pointer select-none"
                data-testid="degree-selector"
            >
                {programs.map((program) => (
                    <option
                        key={program.id}
                        value={program.id}
                        className="bg-[#030508] text-slate-200 py-1 font-mono uppercase"
                    >
                        {program.name}
                    </option>
                ))}
            </select>
            <div className="absolute right-2 pointer-events-none text-slate-400 flex items-center">
                <ChevronDown className="w-3 h-3 text-slate-400" />
            </div>
        </div>
    );
}
