import { useEffect } from 'react';
import { fetchExtractionJob } from '@/features/mis/api/extraction';
import { selectHasActiveJobs, useUploadQueueStore } from '@/features/mis/store/uploadQueueStore';
import { ACTIVE_JOB_STATUSES } from '@/features/mis/utils/uploadRules';

export const POLL_INTERVAL_MS = 2000;

/** While any upload is PENDING or PROCESSING, re-reads those jobs until they finish. */
export function useExtractionJobPolling(): void {
    const hasActiveJobs = useUploadQueueStore(selectHasActiveJobs);

    useEffect(() => {
        if (!hasActiveJobs) return;
        const inFlight = new Set<string>();

        const poll = () => {
            const { entries, setJob, setUploadFailed } = useUploadQueueStore.getState();
            for (const entry of entries) {
                if (entry.state.phase !== 'job' || !ACTIVE_JOB_STATUSES.includes(entry.state.job.status)) continue;
                const { jobId } = entry.state.job;
                if (inFlight.has(jobId)) continue;
                inFlight.add(jobId);
                void fetchExtractionJob(jobId).then((result) => {
                    inFlight.delete(jobId);
                    if (result.ok) setJob(entry.localId, result.job);
                    else if (result.gone) setUploadFailed(entry.localId, result.message);
                    // Other failures (network blips) are retried on the next tick.
                });
            }
        };

        const timer = setInterval(poll, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [hasActiveJobs]);
}
