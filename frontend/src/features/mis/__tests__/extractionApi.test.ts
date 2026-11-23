// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, tokenResponse } from '@/features/admin/__tests__/authFixtures';
import { selectIsAdminMode, useAuthStore } from '@/features/admin/store/authStore';
import {
    UPLOAD_NETWORK_ERROR_MESSAGE,
    UPLOAD_SESSION_ENDED_MESSAGE,
    fetchExtractionJob,
    uploadSyllabus,
} from '@/features/mis/api/extraction';
import { DOCX_CONTENT_TYPE } from '@/features/mis/utils/uploadRules';
import { FakeXhr } from './fakeXhr';

const pendingJob = {
    jobId: 'job-1',
    filename: 'CO2210.docx',
    contentType: DOCX_CONTENT_TYPE,
    fileHash: 'abc',
    status: 'PENDING',
    createdAt: '2026-11-23T09:00:00Z',
    updatedAt: '2026-11-23T09:00:00Z',
};

const docx = () => new File(['PK\u0003\u0004 body'], 'CO2210.docx', { type: '' });

describe('uploadSyllabus (CF-214)', () => {
    beforeEach(() => {
        FakeXhr.instances = [];
        vi.stubGlobal('XMLHttpRequest', FakeXhr);
        localStorage.clear();
        useAuthStore.setState({ token: 'token-1', expiresAt: Date.now() + 60_000, user: tokenResponse().user });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('posts the file as multipart `file` with the admin token and a declared DOCX type', () => {
        void uploadSyllabus(docx(), () => {});

        const request = FakeXhr.latest();
        expect(request.method).toBe('POST');
        expect(request.url).toBe('/api/v1/extraction/upload');
        expect(request.headers.Authorization).toBe('Bearer token-1');
        const sent = request.body?.get('file');
        expect(sent).toBeInstanceOf(File);
        expect((sent as File).name).toBe('CO2210.docx');
        expect((sent as File).type).toBe(DOCX_CONTENT_TYPE);
    });

    it('reports upload progress and resolves with the new job on 202', async () => {
        const progress: number[] = [];
        const result = uploadSyllabus(docx(), (fraction) => progress.push(fraction));
        const request = FakeXhr.latest();

        request.progress(25, 100);
        request.progress(100, 100);
        request.respond(202, { success: true, data: pendingJob });

        expect(progress).toEqual([0.25, 1]);
        expect(await result).toEqual({ ok: true, job: pendingJob, uploadedBefore: false });
    });

    it('flags a 200 as a file that was uploaded before', async () => {
        const result = uploadSyllabus(docx(), () => {});
        FakeXhr.latest().respond(200, { success: true, data: { ...pendingJob, status: 'EXTRACTED' } });

        expect(await result).toMatchObject({ ok: true, uploadedBefore: true });
    });

    it.each([
        [400, 'The file is not a valid DOCX document.'],
        [413, 'Documents must be 15 MB or smaller.'],
    ])('shows the server reason for a %i', async (status, detail) => {
        const result = uploadSyllabus(docx(), () => {});
        FakeXhr.latest().respond(status, { detail });

        expect(await result).toEqual({ ok: false, message: detail });
    });

    it('signs the user out on a 401', async () => {
        const result = uploadSyllabus(docx(), () => {});
        FakeXhr.latest().respond(401, { detail: 'Token expired' });

        expect(await result).toEqual({ ok: false, message: UPLOAD_SESSION_ENDED_MESSAGE });
        expect(selectIsAdminMode(useAuthStore.getState())).toBe(false);
    });

    it('explains a network failure', async () => {
        const result = uploadSyllabus(docx(), () => {});
        FakeXhr.latest().fail();

        expect(await result).toEqual({ ok: false, message: UPLOAD_NETWORK_ERROR_MESSAGE });
    });
});

describe('fetchExtractionJob (CF-214)', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        useAuthStore.setState({ token: 'token-1', expiresAt: Date.now() + 60_000, user: tokenResponse().user });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the job with the admin token', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ success: true, data: pendingJob }));

        expect(await fetchExtractionJob('job-1')).toEqual({ ok: true, job: pendingJob });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/v1/extraction/jobs/job-1');
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1');
    });

    it('marks a 404 job as gone', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ detail: 'Not found' }, 404));

        expect(await fetchExtractionJob('job-1')).toMatchObject({ ok: false, gone: true });
    });

    it('treats a network failure as temporary', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

        expect(await fetchExtractionJob('job-1')).toMatchObject({ ok: false, gone: false });
    });
});
