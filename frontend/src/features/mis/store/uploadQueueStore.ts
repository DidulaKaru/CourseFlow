import { create } from 'zustand';
import { ACTIVE_JOB_STATUSES } from '@/features/mis/utils/uploadRules';
import type { ExtractionJob, UploadEntry } from '@/features/mis/utils/uploadRules';

interface UploadQueueState {
    /** Newest first. */
    entries: UploadEntry[];
    addUpload: (entry: Pick<UploadEntry, 'localId' | 'fileName' | 'sizeBytes'>) => void;
    setProgress: (localId: string, progress: number) => void;
    setUploadFailed: (localId: string, message: string) => void;
    /** Records the server job for an upload; an identical earlier upload keeps its row instead of gaining a twin. */
    setJob: (localId: string, job: ExtractionJob, uploadedBefore?: boolean) => void;
}

function update(entries: UploadEntry[], localId: string, change: (entry: UploadEntry) => UploadEntry): UploadEntry[] {
    return entries.map((entry) => (entry.localId === localId ? change(entry) : entry));
}

/**
 * This session's syllabus uploads. Kept in memory only: the API has no job listing yet, and file
 * names should not outlive the faculty session on a shared computer.
 */
export const useUploadQueueStore = create<UploadQueueState>()((set) => ({
    entries: [],
    addUpload: ({ localId, fileName, sizeBytes }) =>
        set((state) => ({
            entries: [
                { localId, fileName, sizeBytes, uploadedAt: Date.now(), state: { phase: 'uploading', progress: 0 } },
                ...state.entries,
            ],
        })),
    setProgress: (localId, progress) =>
        set((state) => ({
            entries: update(state.entries, localId, (entry) =>
                entry.state.phase === 'uploading'
                    ? { ...entry, state: { phase: 'uploading', progress: Math.min(Math.max(progress, 0), 1) } }
                    : entry
            ),
        })),
    setUploadFailed: (localId, message) =>
        set((state) => ({
            entries: update(state.entries, localId, (entry) => ({ ...entry, state: { phase: 'upload-failed', message } })),
        })),
    setJob: (localId, job, uploadedBefore = false) =>
        set((state) => {
            const twin = state.entries.find(
                (entry) => entry.localId !== localId && entry.state.phase === 'job' && entry.state.job.jobId === job.jobId
            );
            const withJob = (entry: UploadEntry): UploadEntry => ({
                ...entry,
                state: { phase: 'job', job, uploadedBefore: entry.state.phase === 'job' ? entry.state.uploadedBefore : uploadedBefore },
            });
            if (!twin) return { entries: update(state.entries, localId, withJob) };
            return {
                entries: update(
                    state.entries.filter((entry) => entry.localId !== localId),
                    twin.localId,
                    (entry) => ({ ...withJob(entry), state: { phase: 'job', job, uploadedBefore: true } })
                ),
            };
        }),
}));

export const selectHasActiveJobs = (state: UploadQueueState): boolean =>
    state.entries.some((entry) => entry.state.phase === 'job' && ACTIVE_JOB_STATUSES.includes(entry.state.job.status));
