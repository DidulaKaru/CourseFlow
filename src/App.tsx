import { usePlannerStore } from '@/core/store';
import { getProgram } from '@/data/mockCourses';
import { CurriculumCanvas } from '@/features/canvas/CurriculumCanvas';
import { TopNav } from '@/features/canvas/components/TopNav';
import { ModuleDetailsDrawer } from '@/features/drawer/ModuleDetailsDrawer';

export default function App() {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const activeProgram = getProgram(activeProgramId);

    return (
        <div className="w-screen h-screen overflow-hidden bg-slate-950 flex flex-col relative">
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
