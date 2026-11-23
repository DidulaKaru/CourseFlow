import { resolveApiUrl } from '@/core/api';
import { adminFetch, useAuthStore } from '@/features/admin/store/authStore';
import { documentContentType } from '@/features/mis/utils/uploadRules';
import type { ExtractionJob } from '@/features/mis/utils/uploadRules';

export type UploadResult =
    | { ok: true; job: ExtractionJob; uploadedBefore: boolean }
    | { ok: false; message: string };

export type FetchJobResult = { ok: true; job: ExtractionJob } | { ok: false; message: string; gone: boolean };

export const UPLOAD_SESSION_ENDED_MESSAGE = 'Your session has ended. Sign in again to upload.';
export const UPLOAD_NOT_PERMITTED_MESSAGE = "Your account isn't permitted to upload syllabi.";
export const UPLOAD_NETWORK_ERROR_MESSAGE = "We couldn't reach the server. Check your connection and try again.";
const UPLOAD_FAILED_MESSAGE = 'Something went wrong uploading this file. Please try again.';

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function jobFrom(body: unknown): ExtractionJob | null {
    const data = (body as { data?: ExtractionJob } | null)?.data;
    return data && typeof data.jobId === 'string' ? data : null;
}

function detailFrom(body: unknown): string | null {
    const detail = (body as { detail?: unknown } | null)?.detail;
    return typeof detail === 'string' ? detail : null;
}

/**
 * POST /api/v1/extraction/upload (multipart field `file`). Uses XMLHttpRequest because fetch
 * cannot report upload progress. Like adminFetch, a 401 signs the user out.
 */
export function uploadSyllabus(file: File, onProgress: (fraction: number) => void): Promise<UploadResult> {
    const contentType = documentContentType(file) ?? file.type;
    const form = new FormData();
    form.append('file', new File([file], file.name, { type: contentType }));

    return new Promise((resolve) => {
        const request = new XMLHttpRequest();
        request.open('POST', resolveApiUrl('/api/v1/extraction/upload'));
        request.setRequestHeader('Accept', 'application/json');
        const { token } = useAuthStore.getState();
        if (token !== null) request.setRequestHeader('Authorization', `Bearer ${token}`);

        request.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
        };
        request.onerror = () => resolve({ ok: false, message: UPLOAD_NETWORK_ERROR_MESSAGE });
        request.onload = () => {
            const body = parseJson(request.responseText);
            const job = jobFrom(body);
            if ((request.status === 200 || request.status === 202) && job) {
                resolve({ ok: true, job, uploadedBefore: request.status === 200 });
                return;
            }
            if (request.status === 401) {
                useAuthStore.getState().logout();
                resolve({ ok: false, message: UPLOAD_SESSION_ENDED_MESSAGE });
                return;
            }
            if (request.status === 403) {
                resolve({ ok: false, message: UPLOAD_NOT_PERMITTED_MESSAGE });
                return;
            }
            resolve({ ok: false, message: detailFrom(body) ?? UPLOAD_FAILED_MESSAGE });
        };
        request.send(form);
    });
}

/** GET /api/v1/extraction/jobs/{jobId}. `gone` means the server no longer knows the job. */
export async function fetchExtractionJob(jobId: string): Promise<FetchJobResult> {
    let response: Response;
    try {
        response = await adminFetch(`/api/v1/extraction/jobs/${encodeURIComponent(jobId)}`);
    } catch {
        return { ok: false, message: UPLOAD_NETWORK_ERROR_MESSAGE, gone: false };
    }
    const body: unknown = await response.json().catch(() => null);
    const job = jobFrom(body);
    if (response.ok && job) return { ok: true, job };
    if (response.status === 404) {
        return { ok: false, message: 'This upload is no longer on the server. Upload the file again.', gone: true };
    }
    return { ok: false, message: detailFrom(body) ?? UPLOAD_FAILED_MESSAGE, gone: false };
}
