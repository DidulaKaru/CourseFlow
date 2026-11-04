import { CurriculumCanvas } from '@/features/canvas/CurriculumCanvas';
import { mockCourses } from '@/data/mockCourses';

export default function App() {
    return (
        <main className="w-screen h-screen overflow-hidden bg-slate-950">
            <CurriculumCanvas
                courses={mockCourses}
                programName="Computer Engineering"
            />
        </main>
    );
}
