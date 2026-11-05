import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Copy, Edit2, Plus, Trash2, Check } from 'lucide-react';
import { usePlannerStore } from '@/core/store';

export function PlanSelector() {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const plans = usePlannerStore((state) => state.plans[activeProgramId] ?? []);
    const activePlanId = usePlannerStore((state) => state.activePlanId);
    const setActivePlan = usePlannerStore((state) => state.setActivePlan);
    const createPlan = usePlannerStore((state) => state.createPlan);
    const duplicatePlan = usePlannerStore((state) => state.duplicatePlan);
    const renamePlan = usePlannerStore((state) => state.renamePlan);
    const deletePlan = usePlannerStore((state) => state.deletePlan);

    const [isOpen, setIsOpen] = useState(false);
    const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const activePlan = plans.find((p) => p.id === activePlanId) || plans[0];

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setEditingPlanId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCreateNew = () => {
        createPlan(`Plan ${plans.length + 1}`);
        setIsOpen(false);
    };

    const handleDuplicate = (planId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        duplicatePlan(planId);
    };

    const handleDelete = (planId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (plans.length <= 1) return;
        deletePlan(planId);
    };

    const handleStartRename = (planId: string, currentName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingPlanId(planId);
        setEditName(currentName);
    };

    const handleSaveRename = (planId: string, e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (editName.trim()) {
            renamePlan(planId, editName.trim());
        }
        setEditingPlanId(null);
    };

    return (
        <div className="relative inline-flex items-center shrink-0" ref={dropdownRef} data-testid="plan-selector">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-mono uppercase tracking-wider border border-white/10 hover:border-white/20 transition-colors select-none w-24 sm:w-32 md:w-36 text-left"
                title="Select or manage study plan drafts"
                aria-expanded={isOpen}
                data-testid="plan-selector-button"
            >
                <span className="w-1.5 h-1.5 rotate-45 bg-[var(--accent-primary)] shrink-0" />
                <span className="truncate flex-1 font-medium text-slate-100">
                    {activePlan ? activePlan.name : 'Study Plan'}
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-[#070B12]/95 backdrop-blur-md border border-white/15 shadow-2xl z-50 py-1 font-sans text-xs">
                    <div className="px-3 py-1.5 border-b border-white/10 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-400">
                        <span>Study Plans</span>
                        <span>{plans.length} Draft{plans.length > 1 ? 's' : ''}</span>
                    </div>

                    <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                        {plans.map((plan) => {
                            const isCurrent = plan.id === activePlanId;
                            const isEditing = editingPlanId === plan.id;

                            return (
                                <div
                                    key={plan.id}
                                    onClick={() => {
                                        if (!isEditing) {
                                            setActivePlan(plan.id);
                                            setIsOpen(false);
                                        }
                                    }}
                                    className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                        isCurrent ? 'bg-white/10 text-white font-medium' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    {isEditing ? (
                                        <form onSubmit={(e) => handleSaveRename(plan.id, e)} className="flex items-center gap-1 flex-1">
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                autoFocus
                                                className="bg-black/50 border border-white/30 text-white px-1.5 py-0.5 text-xs font-mono w-full focus:outline-none focus:border-[var(--constellation-beam)]"
                                            />
                                            <button
                                                type="submit"
                                                className="p-1 hover:bg-white/10 text-emerald-400"
                                                title="Save"
                                            >
                                                <Check className="w-3 h-3" />
                                            </button>
                                        </form>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 truncate flex-1">
                                                <div
                                                    className={`w-1.5 h-1.5 rotate-45 shrink-0 ${
                                                        isCurrent ? 'bg-[var(--constellation-beam)] shadow-[0_0_6px_var(--constellation-beam)]' : 'bg-white/20'
                                                    }`}
                                                />
                                                <span className="truncate font-mono">{plan.name}</span>
                                                <span className="text-[10px] text-slate-500 font-mono">
                                                    ({plan.selectedElectiveIds.length} electives)
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0 opacity-70 hover:opacity-100">
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleStartRename(plan.id, plan.name, e)}
                                                    className="p-1 text-slate-400 hover:text-white"
                                                    title="Rename plan"
                                                >
                                                    <Edit2 className="w-2.5 h-2.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDuplicate(plan.id, e)}
                                                    className="p-1 text-slate-400 hover:text-white"
                                                    title="Duplicate plan"
                                                >
                                                    <Copy className="w-2.5 h-2.5" />
                                                </button>
                                                {plans.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleDelete(plan.id, e)}
                                                        className="p-1 text-slate-400 hover:text-red-400"
                                                        title="Delete plan"
                                                    >
                                                        <Trash2 className="w-2.5 h-2.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="p-2 border-t border-white/10">
                        <button
                            type="button"
                            onClick={handleCreateNew}
                            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-mono uppercase tracking-wider border border-white/10 hover:border-white/20 transition-colors"
                        >
                            <Plus className="w-3 h-3 text-[var(--accent-primary)]" />
                            <span>Create New Plan</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
