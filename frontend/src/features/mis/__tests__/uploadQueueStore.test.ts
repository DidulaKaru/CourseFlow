import { beforeEach, describe, expect, it } from 'vitest';
import { selectHasActiveJobs, useUploadQueueStore } from '@/features/mis/store/uploadQueueStore';
import { PDF_CONTENT_TYPE } from '@/features/mis/utils/uploadRules';
import type { ExtractionJob, ExtractionJobStatus } from '@/features/mis/utils/uploadRules';

const job = (status: ExtractionJobStatus, jobId = 'job-1'): ExtractionJob => ({
    jobId,
    filename: 'CO2210.pdf',
    contentType: PDF_CONTENT_TYPE,
    fileHash: 'abc',
    status,
    createdAt: '2026-11-23T09:00:00Z',
    updatedAt: '2026-11-23T09:00:00Z',
});

const store = () => useUploadQueueStore.getState();

describe('upload queue store (CF-214)', () => {
    beforeEach(() => {
        useUploadQueueStore.setState({ entries: [] });
    });

    it('adds new uploads at the top in the uploading phase', () => {
        store().addUpload({ localId: 'a', fileName: 'first.pdf', sizeBytes: 10 });
        store().addUpload({ localId: 'b', fileName: 'second.pdf', sizeBytes: 20 });

        expect(store().entries.map((entry) => entry.localId)).toEqual(['b', 'a']);
        expect(store().entries[0].state).toEqual({ phase: 'uploading', progress: 0 });
    });

    it('clamps progress between 0 and 1', () => {
        store().addUpload({ localId: 'a', fileName: 'first.pdf', sizeBytes: 10 });

        store().setProgress('a', 1.4);

        expect(store().entries[0].state).toEqual({ phase: 'uploading', progress: 1 });
    });

    it('moves from upload to server job and tracks whether polling is needed', () => {
        store().addUpload({ localId: 'a', fileName: 'first.pdf', sizeBytes: 10 });
        expect(selectHasActiveJobs(store())).toBe(false);

        store().setJob('a', job('PENDING'));
        expect(selectHasActiveJobs(store())).toBe(true);

        store().setJob('a', job('EXTRACTED'));
        expect(selectHasActiveJobs(store())).toBe(false);
        expect(store().entries[0].state).toEqual({ phase: 'job', job: job('EXTRACTED'), uploadedBefore: false });
    });

    it('records an upload failure', () => {
        store().addUpload({ localId: 'a', fileName: 'first.pdf', sizeBytes: 10 });

        store().setUploadFailed('a', 'Too big.');

        expect(store().entries[0].state).toEqual({ phase: 'upload-failed', message: 'Too big.' });
    });

    it('keeps one row when the same file is uploaded twice', () => {
        store().addUpload({ localId: 'a', fileName: 'CO2210.pdf', sizeBytes: 10 });
        store().setJob('a', job('EXTRACTED'));
        store().addUpload({ localId: 'b', fileName: 'CO2210 copy.pdf', sizeBytes: 10 });

        store().setJob('b', job('EXTRACTED'), true);

        expect(store().entries).toHaveLength(1);
        expect(store().entries[0]).toMatchObject({ localId: 'a', state: { phase: 'job', uploadedBefore: true } });
    });
});
