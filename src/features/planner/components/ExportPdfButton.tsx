import { useMemo, useSyncExternalStore } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download } from 'lucide-react';

import { usePlannerStore } from '@/core/store';
import { getProgram, getProgramCourses } from '@/data/mockCourses';
import type { DegreeProgram } from '@/types/curriculum';
import { StudyPlanPDF } from '../StudyPlanPDF';
import { getPdfFileName } from '../utils/pdfFilename';

export interface ExportPdfButtonProps {
    program?: DegreeProgram;
    fileName?: string;
    className?: string;
}

const emptySubscribe = () => () => {};

/**
 * Client-Side PDF Study Plan Exporter Button (CF-116).
 * Embeds `@react-pdf/renderer`'s `PDFDownloadLink` in the top navigation bar.
 * Clicking generates and triggers immediate download of a 2-page academic study plan
 * with 8-semester tabular credit breakdown and graduation compliance verification stamp.
 */
export function ExportPdfButton({
    program: injectedProgram,
    fileName: customFileName,
    className = '',
}: ExportPdfButtonProps) {
    const isClient = useSyncExternalStore(
        emptySubscribe,
        () => true,
        () => false
    );

    const activeProgramId = usePlannerStore((state) => state.activeProgramId);
    const selectedElectiveIds = usePlannerStore((state) => state.selectedElectiveIds);
    const completedCourseIds = usePlannerStore((state) => state.completedCourseIds);

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
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/70 text-white/80 text-xs font-semibold cursor-not-allowed ${className}`}
                data-testid="export-pdf-button-loading"
                aria-label="Preparing study plan export"
            >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>Download Plan PDF</span>
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
                    completedCourseIds={completedCourseIds}
                    totalCreditsRequired={activeProgram.totalCreditsRequired}
                />
            }
            fileName={dynamicFileName}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer select-none ${className}`}
            data-testid="export-pdf-button"
            aria-label="Download academic study plan PDF"
        >
            {({ loading }) => (
                <>
                    <Download className={`w-3.5 h-3.5 shrink-0 ${loading ? 'animate-bounce' : ''}`} />
                    <span className="whitespace-nowrap">
                        {loading ? 'Preparing PDF...' : 'Download Plan PDF'}
                    </span>
                </>
            )}
        </PDFDownloadLink>
    );
}
