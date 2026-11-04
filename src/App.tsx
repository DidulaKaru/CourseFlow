import { CurriculumCanvas } from '@/features/canvas/CurriculumCanvas';
import { ModuleDetailsDrawer } from '@/features/drawer/ModuleDetailsDrawer';
import { mockCourses } from '@/data/mockCourses';

export default function App() {
    return (
        <main className="w-screen h-screen overflow-hidden bg-slate-950 relative">
            <CurriculumCanvas
                courses={mockCourses}
                programName="Computer Engineering"
            />
            <ModuleDetailsDrawer />
        </main>
    );
}
