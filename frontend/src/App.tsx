import { useEffect } from 'react';
import { usePlannerStore } from '@/core/store';
import { getProgram } from '@/data/mockCourses';
import { CurriculumCanvas } from '@/features/canvas/CurriculumCanvas';
import { TopNav } from '@/features/canvas/components/TopNav';
import { ModuleDetailsDrawer } from '@/features/drawer/ModuleDetailsDrawer';

export default function App() {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const activeProgram = getProgram(activeProgramId);

    // Dynamic Theme Engine: Synchronize Skyrim Department Constellation ('ce' | 'ee')
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.dataset.department =
                activeProgramId === 'electrical-eng' ? 'ee' : 'ce';
        }
    }, [activeProgramId]);

    return (
        <div className="w-screen h-screen overflow-hidden bg-[#030508] text-[#F8FAFC] flex flex-col relative skyrim-canvas-bg font-sans">
            <TopNav
                courses={activeProgram.courses}
                program={activeProgram}
                totalCreditsRequired={activeProgram.totalCreditsRequired}
            />
            <main className="flex-1 w-full h-[calc(100vh-3.5rem)] relative overflow-hidden">
                <CurriculumCanvas
                    key={activeProgram.id}
                    courses={activeProgram.courses}
                    programName={activeProgram.name}
                />
                <ModuleDetailsDrawer />
            </main>
        </div>
    );
}
