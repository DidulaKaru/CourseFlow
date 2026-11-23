import { describe, expect, it } from 'vitest';
import { MIS_UPLOADS_HASH, misReviewHash, parseHashRoute } from '@/core/hashRoute';
import {
    DOCX_CONTENT_TYPE,
    MAX_UPLOAD_BYTES,
    PDF_CONTENT_TYPE,
    describeUpload,
    detectedCourseCode,
    documentContentType,
    formatFileSize,
    validateUpload,
} from '@/features/mis/utils/uploadRules';
import type { ExtractionJob, ExtractionJobStatus } from '@/features/mis/utils/uploadRules';

function job(status: ExtractionJobStatus, overrides: Partial<ExtractionJob> = {}): ExtractionJob {
    return {
        jobId: 'job-1',
        filename: 'CO2210.pdf',
        contentType: PDF_CONTENT_TYPE,
        fileHash: 'abc',
        status,
        createdAt: '2026-11-23T09:00:00Z',
        updatedAt: '2026-11-23T09:00:00Z',
        ...overrides,
    };
}

describe('MIS upload rules (CF-214)', () => {
    describe('documentContentType', () => {
        it('keeps a correct declared type', () => {
            expect(documentContentType({ name: 'a.pdf', type: PDF_CONTENT_TYPE })).toBe(PDF_CONTENT_TYPE);
        });

        it('fills in the type from the extension when the browser leaves it empty', () => {
            expect(documentContentType({ name: 'CO2210 MIS.DOCX', type: '' })).toBe(DOCX_CONTENT_TYPE);
            expect(documentContentType({ name: 'syllabus.pdf', type: 'application/octet-stream' })).toBe(PDF_CONTENT_TYPE);
        });

        it('rejects other documents, including legacy .doc', () => {
            expect(documentContentType({ name: 'notes.doc', type: 'application/msword' })).toBeNull();
            expect(documentContentType({ name: 'notes.txt', type: 'text/plain' })).toBeNull();
        });
    });

    describe('validateUpload', () => {
        it('accepts a PDF of exactly 15 MB', () => {
            expect(validateUpload({ name: 'big.pdf', type: PDF_CONTENT_TYPE, size: MAX_UPLOAD_BYTES })).toBeNull();
        });

        it('rejects anything over 15 MB, naming the size', () => {
            expect(validateUpload({ name: 'big.pdf', type: PDF_CONTENT_TYPE, size: MAX_UPLOAD_BYTES + 1 })).toBe(
                'big.pdf is 15.0 MB. Files must be 15 MB or smaller.'
            );
        });

        it('rejects empty files and unsupported types', () => {
            expect(validateUpload({ name: 'blank.docx', type: DOCX_CONTENT_TYPE, size: 0 })).toBe('blank.docx is empty.');
            expect(validateUpload({ name: 'scan.png', type: 'image/png', size: 10 })).toBe(
                "scan.png isn't a PDF or Word (.docx) file."
            );
        });
    });

    it('formats file sizes the way people read them', () => {
        expect(formatFileSize(512)).toBe('512 B');
        expect(formatFileSize(842 * 1024)).toBe('842 KB');
        expect(formatFileSize(3.4 * 1024 * 1024)).toBe('3.4 MB');
    });

    describe('describeUpload', () => {
        it.each([
            [{ phase: 'uploading', progress: 0.42 } as const, 'Uploading 42%', 'progress'],
            [{ phase: 'job', job: job('PENDING'), uploadedBefore: false } as const, 'Extracting', 'progress'],
            [{ phase: 'job', job: job('PROCESSING'), uploadedBefore: false } as const, 'Extracting', 'progress'],
            [{ phase: 'job', job: job('EXTRACTED'), uploadedBefore: false } as const, 'Ready for review', 'success'],
            [{ phase: 'job', job: job('COMMITTED'), uploadedBefore: false } as const, 'Committed', 'neutral'],
        ])('labels %o as %s', (state, label, tone) => {
            expect(describeUpload(state)).toMatchObject({ label, tone });
        });

        it('explains failures with the server message', () => {
            expect(
                describeUpload({ phase: 'job', job: job('FAILED', { errorMessage: 'No text layer found.' }), uploadedBefore: false })
            ).toEqual({ label: 'Extraction failed', tone: 'danger', detail: 'No text layer found.' });
            expect(describeUpload({ phase: 'upload-failed', message: 'Too big.' })).toEqual({
                label: 'Upload failed',
                tone: 'danger',
                detail: 'Too big.',
            });
        });
    });

    it('reads the detected course code from the extracted data', () => {
        expect(detectedCourseCode(job('EXTRACTED', { extractedData: { code: ' co2210 ' } }))).toBe('CO2210');
        expect(detectedCourseCode(job('PENDING'))).toBeNull();
        expect(detectedCourseCode(job('EXTRACTED', { extractedData: { code: 42 } }))).toBeNull();
    });
});

describe('hash routes (CF-214)', () => {
    it.each([
        ['', { name: 'planner' }],
        ['#/', { name: 'planner' }],
        ['#/somewhere-else', { name: 'planner' }],
        [MIS_UPLOADS_HASH, { name: 'mis-uploads' }],
        [`${MIS_UPLOADS_HASH}/`, { name: 'mis-uploads' }],
        [misReviewHash('3f2a-job'), { name: 'mis-review', jobId: '3f2a-job' }],
        ['#/admin/uploads/%E0%A4%A/review', { name: 'planner' }],
    ])('parses %j', (hash, route) => {
        expect(parseHashRoute(hash)).toEqual(route);
    });

    it('round-trips job IDs that need encoding', () => {
        expect(parseHashRoute(misReviewHash('a/b c'))).toEqual({ name: 'mis-review', jobId: 'a/b c' });
    });
});
