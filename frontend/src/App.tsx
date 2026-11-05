import { useEffect } from 'react';
import { usePlannerStore } from '@/core/store';
import { getProgram } from '@/data/mockCourses';
import { CurriculumCanvas } from '@/features/canvas/CurriculumCanvas';
import { TopNav } from '@/features/canvas/components/TopNav';
import { ErrorBoundary } from '@/features/common/ErrorBoundary';
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
        <ErrorBoundary fallbackTitle="CourseFlow System Disruption">
            <div className="w-screen h-screen overflow-hidden bg-[#030508] text-[#F8FAFC] flex flex-col relative skyrim-canvas-bg font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
                <TopNav
                    courses={activeProgram.courses}
                    program={activeProgram}
                    totalCreditsRequired={activeProgram.totalCreditsRequired}
                />
                <main className="flex-1 w-full h-[calc(100vh-3.5rem)] relative overflow-hidden">
                    <ErrorBoundary fallbackTitle="Canvas Engine Disruption">
                        <CurriculumCanvas
                            key={activeProgram.id}
                            courses={activeProgram.courses}
                            programName={activeProgram.name}
                        />
                    </ErrorBoundary>
                    <ModuleDetailsDrawer />
                </main>
            </div>
        </ErrorBoundary>
    );
}
