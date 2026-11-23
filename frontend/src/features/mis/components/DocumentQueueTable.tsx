import { CircleAlert, CircleCheck, CheckCheck, ClipboardCheck, FileText, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { misReviewHash } from '@/core/hashRoute';
import { describeUpload, detectedCourseCode, formatFileSize } from '@/features/mis/utils/uploadRules';
import type { StatusTone, UploadEntry } from '@/features/mis/utils/uploadRules';

const TONE_CLASSES: Record<StatusTone, string> = {
    progress: 'bg-accent-soft text-accent-strong',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
    neutral: 'bg-surface-muted text-ink-muted',
};

const TONE_ICONS: Record<StatusTone, ReactNode> = {
    progress: <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />,
    success: <CircleCheck className="h-4 w-4" aria-hidden="true" />,
    danger: <CircleAlert className="h-4 w-4" aria-hidden="true" />,
    neutral: <CheckCheck className="h-4 w-4" aria-hidden="true" />,
};

// One grid for the header and every row, so columns line up on wider screens; phones get stacked cards.
const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,2fr)_5.5rem_6rem_6.5rem_minmax(0,1.6fr)_11.5rem] md:items-center md:gap-4';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function Cell({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={`flex items-baseline gap-2 md:block ${className}`}>
            <span className="text-sm text-ink-muted md:sr-only">{label}</span>
            <span className="min-w-0 text-sm text-ink">{children}</span>
        </div>
    );
}

export function DocumentQueueTable({ entries }: { entries: UploadEntry[] }) {
    if (entries.length === 0) {
        return (
            <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-ink-muted">
                No uploads yet. Drop a syllabus above to get started.
            </p>
        );
    }

    return (
        <div className="rounded-2xl border border-line bg-surface">
            <div className={`hidden border-b border-line px-4 py-3 text-sm font-medium text-ink-muted ${ROW_GRID}`} aria-hidden="true">
                <span>File name</span>
                <span>Size</span>
                <span>Uploaded</span>
                <span>Course code</span>
                <span>Status</span>
                <span className="sr-only">Action</span>
            </div>
            <ul aria-label="Uploaded syllabi" className="divide-y divide-line">
                {entries.map((entry) => {
                    const status = describeUpload(entry.state);
                    const job = entry.state.phase === 'job' ? entry.state.job : null;
                    const code = job ? detectedCourseCode(job) : null;
                    return (
                        <li key={entry.localId} className={`space-y-2 px-4 py-4 md:space-y-0 ${ROW_GRID}`} data-testid="mis-queue-row">
                            <div className="flex min-w-0 items-center gap-2">
                                <FileText className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                                <span className="truncate text-base font-medium text-ink" title={entry.fileName}>
                                    {entry.fileName}
                                </span>
                            </div>
                            <Cell label="Size">{formatFileSize(entry.sizeBytes)}</Cell>
                            <Cell label="Uploaded">{timeFormat.format(entry.uploadedAt)}</Cell>
                            <Cell label="Course code">
                                {code ? <span className="font-medium tracking-wide">{code}</span> : <span className="text-ink-muted">Not found yet</span>}
                            </Cell>
                            <div className="min-w-0">
                                <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${TONE_CLASSES[status.tone]}`}
                                    data-testid="mis-status"
                                >
                                    {TONE_ICONS[status.tone]}
                                    {status.label}
                                </span>
                                {entry.state.phase === 'uploading' && (
                                    <div
                                        role="progressbar"
                                        aria-label={`Uploading ${entry.fileName}`}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={Math.round(entry.state.progress * 100)}
                                        className="mt-2 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-surface-muted"
                                    >
                                        <div
                                            className="h-full origin-left rounded-full bg-accent transition-transform duration-200 motion-reduce:transition-none"
                                            style={{ transform: `scaleX(${entry.state.progress})` }}
                                        />
                                    </div>
                                )}
                                {status.detail && <p className="mt-1 text-sm text-danger">{status.detail}</p>}
                                {entry.state.phase === 'job' && entry.state.uploadedBefore && (
                                    <p className="mt-1 text-sm text-ink-muted">Uploaded before, so this is its existing extraction.</p>
                                )}
                            </div>
                            <div className="pt-1 md:pt-0 md:text-right">
                                {job?.status === 'EXTRACTED' && (
                                    <a
                                        href={misReviewHash(job.jobId)}
                                        className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                    >
                                        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                                        Review extraction
                                    </a>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
