import type { components } from '@/types/api';

export type ExtractionJob = components['schemas']['ExtractionJob'];
export type ExtractionJobStatus = components['schemas']['ExtractionJobStatus'];

// Mirrors backend/app/services/extraction_service.py.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const PDF_CONTENT_TYPE = 'application/pdf';
export const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const ACCEPTED_UPLOAD_TYPES = `.pdf,.docx,${PDF_CONTENT_TYPE},${DOCX_CONTENT_TYPE}`;

/**
 * The MIME type to declare for an upload, from its type or extension. Some browsers report an
 * empty type for .docx files, and the server rejects anything but these two declared types.
 */
export function documentContentType(file: Pick<File, 'name' | 'type'>): string | null {
    if (file.type === PDF_CONTENT_TYPE || file.type === DOCX_CONTENT_TYPE) return file.type;
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension === 'pdf') return PDF_CONTENT_TYPE;
    if (extension === 'docx') return DOCX_CONTENT_TYPE;
    return null;
}

/** Why a file can't be uploaded, or null if it can. */
export function validateUpload(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
    if (documentContentType(file) === null) return `${file.name} isn't a PDF or Word (.docx) file.`;
    if (file.size === 0) return `${file.name} is empty.`;
    if (file.size > MAX_UPLOAD_BYTES) {
        return `${file.name} is ${formatFileSize(file.size)}. Files must be 15 MB or smaller.`;
    }
    return null;
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One row of the staging table. `UPLOADING` and upload failures exist only on the client. */
export type UploadState =
    | { phase: 'uploading'; progress: number }
    | { phase: 'upload-failed'; message: string }
    | { phase: 'job'; job: ExtractionJob; uploadedBefore: boolean };

export interface UploadEntry {
    localId: string;
    fileName: string;
    sizeBytes: number;
    uploadedAt: number;
    state: UploadState;
}

export type StatusTone = 'progress' | 'success' | 'danger' | 'neutral';

export interface UploadStatus {
    label: string;
    tone: StatusTone;
    detail?: string;
}

export const ACTIVE_JOB_STATUSES: readonly ExtractionJobStatus[] = ['PENDING', 'PROCESSING'];

export function describeUpload(state: UploadState): UploadStatus {
    switch (state.phase) {
        case 'uploading':
            return { label: `Uploading ${Math.round(state.progress * 100)}%`, tone: 'progress' };
        case 'upload-failed':
            return { label: 'Upload failed', tone: 'danger', detail: state.message };
        case 'job':
            switch (state.job.status) {
                case 'PENDING':
                case 'PROCESSING':
                    return { label: 'Extracting', tone: 'progress' };
                case 'EXTRACTED':
                    return { label: 'Ready for review', tone: 'success' };
                case 'FAILED':
                    return {
                        label: 'Extraction failed',
                        tone: 'danger',
                        detail: state.job.errorMessage ?? 'The document could not be read. Try uploading it again.',
                    };
                case 'COMMITTED':
                    return { label: 'Committed', tone: 'neutral' };
            }
    }
}

/** The course code the extractor found, if it found one. */
export function detectedCourseCode(job: ExtractionJob): string | null {
    const code = job.extractedData?.code;
    return typeof code === 'string' && code.trim() !== '' ? code.trim().toUpperCase() : null;
}
