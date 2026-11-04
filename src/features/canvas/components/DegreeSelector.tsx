import type { ChangeEvent } from 'react';
import { ChevronDown, GraduationCap } from 'lucide-react';
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
 * Dispatches `setActiveProgram` to the Zustand planner store, clearing irrelevant selections
 * and re-rendering the layout graph dynamically.
 */
export function DegreeSelector({
    className = '',
    programs = AVAILABLE_PROGRAMS,
    onChange,
}: DegreeSelectorProps) {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const setActiveProgram = usePlannerStore((state) => state.setActiveProgram);

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const nextId = e.target.value;
        setActiveProgram(nextId);
        onChange?.(nextId);
    };

    return (
        <div className={`relative inline-flex items-center ${className}`}>
            <div className="absolute left-3 pointer-events-none text-indigo-400 flex items-center">
                <GraduationCap className="w-4 h-4" />
            </div>
            <select
                aria-label="Select Degree Program"
                value={activeProgramId}
                onChange={handleChange}
                className="appearance-none bg-slate-900/90 hover:bg-slate-800 text-slate-100 text-xs sm:text-sm font-medium pl-9 pr-8 py-1.5 rounded-lg border border-slate-700/80 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all cursor-pointer shadow-sm"
                data-testid="degree-selector"
            >
                {programs.map((program) => (
                    <option
                        key={program.id}
                        value={program.id}
                        className="bg-slate-900 text-slate-100 py-1"
                    >
                        {program.name}
                    </option>
                ))}
            </select>
            <div className="absolute right-2.5 pointer-events-none text-slate-400 flex items-center">
                <ChevronDown className="w-3.5 h-3.5" />
            </div>
        </div>
    );
}
