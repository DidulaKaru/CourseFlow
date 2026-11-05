import { memo, useMemo, useSyncExternalStore } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download } from 'lucide-react';

import { usePlannerStore } from '@/core/store';
import { getProgram, getProgramCourses } from '@/data/mockCourses';
import { StudyPlanPDF } from '@/features/planner/StudyPlanPDF';
import { getPdfFileName } from '@/features/planner/utils/pdfFilename';
import type { DegreeProgram } from '@/types/curriculum';

export interface ExportPdfButtonProps {
    program?: DegreeProgram;
    customFileName?: string;
    className?: string;
}

const emptySubscribe = () => () => {};

/**
 * Skyrim Aesthetic PDF Exporter Action Button (CF-116).
 * Renders an accessible download button linking to the client-compiled StudyPlanPDF document.
 * Safely guards against SSR hydration mismatch using useSyncExternalStore.
 */
export const ExportPdfButton = memo(function ExportPdfButton({
    program: injectedProgram,
    customFileName,
    className = '',
}: ExportPdfButtonProps) {
    // Client-side hydration guard
    const isClient = useSyncExternalStore(
        emptySubscribe,
        () => true,
        () => false
    );

    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);
    const activePlanId = usePlannerStore((state) => state.activePlanId);
    const plans = usePlannerStore((state) => state.plans);
    const activePlan = plans[activeProgramId]?.find((p) => p.id === activePlanId);

    const activeProgram = injectedProgram ?? getProgram(activeProgramId);
    const activeCourses = getProgramCourses(activeProgram.id);

    const dynamicFileName = useMemo(() => {
        if (customFileName) return customFileName;
        return getPdfFileName(activeProgram.name);
    }, [customFileName, activeProgram.name]);

    // Initial server/static placeholder before mount
    if (!isClient) {
        return (
            <button
                type="button"
                disabled
                className={`inline-flex items-center gap-1.5 sm:gap-2 border border-white/15 bg-white/5 text-slate-400 text-xs font-mono uppercase tracking-widest px-2.5 sm:px-3 py-1 sm:py-1.5 cursor-not-allowed select-none rounded-none shrink-0 ${className}`}
                data-testid="export-pdf-button-loading"
                aria-label="Preparing study plan export"
            >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span><span className="hidden sm:inline">Download Plan </span>PDF</span>
            </button>
        );
    }

    return (
        <PDFDownloadLink
            document={
                <StudyPlanPDF
                    program={activeProgram}
                    courses={activeCourses}
                    selectedElectiveIds={selectedElectiveIds}
                    totalCreditsRequired={activeProgram.totalCreditsRequired}
                    planName={activePlan?.name}
                />
            }
            fileName={dynamicFileName}
            className={`inline-flex items-center gap-1.5 sm:gap-2 border border-white/15 bg-white/5 hover:bg-white/10 active:border-white/30 text-slate-200 text-xs font-mono uppercase tracking-widest px-2.5 sm:px-3 py-1 sm:py-1.5 transition-colors cursor-pointer select-none rounded-none shadow-sm shrink-0 ${className}`}
            data-testid="export-pdf-button"
            aria-label="Download academic study plan PDF"
        >
            {({ loading }) => (
                <>
                    <Download className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                    <span className="font-medium">
                        {loading ? 'Preparing PDF...' : <><span className="hidden sm:inline">Download Plan </span>PDF</>}
                    </span>
                </>
            )}
        </PDFDownloadLink>
    );
});
