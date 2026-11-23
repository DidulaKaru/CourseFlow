import { useState } from 'react';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import { PLANNER_HASH } from '@/core/hashRoute';
import { uploadSyllabus } from '@/features/mis/api/extraction';
import { DocumentQueueTable } from '@/features/mis/components/DocumentQueueTable';
import { MisUploadDropzone } from '@/features/mis/components/MisUploadDropzone';
import { useExtractionJobPolling } from '@/features/mis/hooks/useExtractionJobPolling';
import { useUploadQueueStore } from '@/features/mis/store/uploadQueueStore';
import { validateUpload } from '@/features/mis/utils/uploadRules';

let uploadCounter = 0;
const nextLocalId = () => `upload-${Date.now()}-${(uploadCounter += 1)}`;

/** Faculty screen for uploading Module Information Sheets and tracking their extraction (CF-214). */
export function MisIngestionPage() {
    const entries = useUploadQueueStore((state) => state.entries);
    const [rejections, setRejections] = useState<string[]>([]);
    useExtractionJobPolling();

    const handleFiles = (files: File[]) => {
        const { addUpload, setProgress, setUploadFailed, setJob } = useUploadQueueStore.getState();
        const rejected: string[] = [];
        for (const file of files) {
            const problem = validateUpload(file);
            if (problem) {
                rejected.push(problem);
                continue;
            }
            const localId = nextLocalId();
            addUpload({ localId, fileName: file.name, sizeBytes: file.size });
            void uploadSyllabus(file, (fraction) => setProgress(localId, fraction)).then((result) => {
                if (result.ok) setJob(localId, result.job, result.uploadedBefore);
                else setUploadFailed(localId, result.message);
            });
        }
        setRejections(rejected);
    };

    return (
        <div className="h-full overflow-y-auto bg-canvas text-ink" data-testid="mis-ingestion-page">
            <header className="border-b border-line bg-surface">
                <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 sm:px-6">
                    <a
                        href={PLANNER_HASH}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Back to planner
                    </a>
                </div>
            </header>

            <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
                <div>
                    <h1 className="text-2xl font-bold text-ink">Syllabus uploads</h1>
                    <p className="mt-1 text-base text-ink-muted">
                        Upload Module Information Sheets and we'll extract the course details for you to review
                        before anything reaches the catalog.
                    </p>
                </div>

                <MisUploadDropzone onFiles={handleFiles} />

                {rejections.length > 0 && (
                    <div role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
                        <p className="flex items-center gap-2 font-medium">
                            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {rejections.length === 1 ? "This file wasn't uploaded:" : `These ${rejections.length} files weren't uploaded:`}
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-10">
                            {rejections.map((message) => (
                                <li key={message}>{message}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <section aria-labelledby="mis-queue-heading" className="space-y-3">
                    <div>
                        <h2 id="mis-queue-heading" className="text-lg font-semibold text-ink">
                            Recent uploads
                        </h2>
                        <p className="text-sm text-ink-muted">Uploads from this session. Statuses update automatically.</p>
                    </div>
                    <DocumentQueueTable entries={entries} />
                </section>
            </main>
        </div>
    );
}
