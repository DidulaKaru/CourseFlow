import { useEffect } from 'react';
import { usePlannerStore } from '@/core/store';
import { getProgram } from '@/data/mockCourses';
import { CurriculumCanvas } from '@/features/canvas/CurriculumCanvas';
import { TopNav } from '@/features/canvas/components/TopNav';
import { SemesterFeed } from '@/features/canvas/components/SemesterFeed';
import { ErrorBoundary } from '@/features/common/ErrorBoundary';
import { ModuleDetailsDrawer } from '@/features/drawer/ModuleDetailsDrawer';

export default function App() {
    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const mobileViewMode = usePlannerStore((state) => state.mobileViewMode);
    const setMobileViewMode = usePlannerStore((state) => state.setMobileViewMode);
    const activeProgram = getProgram(activeProgramId);

    // Dynamic Theme Engine: Synchronize Skyrim Department Constellation ('ce' | 'ee')
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.dataset.department =
                activeProgramId === 'electrical-eng' ? 'ee' : 'ce';
        }
    }, [activeProgramId]);

    // On mobile devices, default initial view mode to list for optimal readability
    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setMobileViewMode('list');
        }
    }, [setMobileViewMode]);

    return (
        <ErrorBoundary fallbackTitle="CourseFlow System Disruption">
            <div className="w-full h-screen overflow-hidden bg-[#030508] text-[#F8FAFC] flex flex-col relative skyrim-canvas-bg font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
                <TopNav
                    courses={activeProgram.courses}
                    program={activeProgram}
                    totalCreditsRequired={activeProgram.totalCreditsRequired}
                />
                <main className="flex-1 w-full relative overflow-hidden">
                    <ErrorBoundary fallbackTitle="Canvas Engine Disruption">
                        {mobileViewMode === 'list' ? (
                            <SemesterFeed />
                        ) : (
                            <CurriculumCanvas
                                key={activeProgram.id}
                                courses={activeProgram.courses}
                                programName={activeProgram.name}
                            />
                        )}
                    </ErrorBoundary>
                    <ModuleDetailsDrawer />
                </main>
            </div>
        </ErrorBoundary>
    );
}
