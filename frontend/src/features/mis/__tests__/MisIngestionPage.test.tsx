// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { misReviewHash } from '@/core/hashRoute';
import { jsonResponse, tokenResponse } from '@/features/admin/__tests__/authFixtures';
import { useAuthStore } from '@/features/admin/store/authStore';
import { POLL_INTERVAL_MS } from '@/features/mis/hooks/useExtractionJobPolling';
import { MisIngestionPage } from '@/features/mis/pages/MisIngestionPage';
import { useUploadQueueStore } from '@/features/mis/store/uploadQueueStore';
import { MAX_UPLOAD_BYTES, PDF_CONTENT_TYPE } from '@/features/mis/utils/uploadRules';
import { FakeXhr } from './fakeXhr';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn<typeof fetch>();

const pdf = (name = 'CO2210 MIS.pdf') => new File(['%PDF-1.7 body'], name, { type: PDF_CONTENT_TYPE });

function jobWith(status: string, extra: Record<string, unknown> = {}) {
    return {
        jobId: 'job-1',
        filename: 'CO2210 MIS.pdf',
        contentType: PDF_CONTENT_TYPE,
        fileHash: 'abc',
        status,
        createdAt: '2026-11-23T09:00:00Z',
        updatedAt: '2026-11-23T09:00:00Z',
        ...extra,
    };
}

const query = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const rows = () => Array.from(document.querySelectorAll('[data-testid="mis-queue-row"]'));
const statusText = () => query('[data-testid="mis-status"]')?.textContent;

function chooseFiles(files: File[]) {
    const input = query<HTMLInputElement>('[data-testid="mis-file-input"]');
    if (!input) throw new Error('file input missing');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    act(() => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function dragEvent(type: string, files: File[] = []) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files } });
    return event;
}

describe('MisIngestionPage (CF-214)', () => {
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers();
        FakeXhr.instances = [];
        vi.stubGlobal('XMLHttpRequest', FakeXhr);
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        localStorage.clear();
        useAuthStore.setState({ token: 'token-1', expiresAt: Date.now() + 3_600_000, user: tokenResponse().user });
        useUploadQueueStore.setState({ entries: [] });
        document.body.innerHTML = '';
        const container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(<MisIngestionPage />));
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('starts with an empty queue that says what to do', () => {
        expect(document.body.textContent).toContain('No uploads yet. Drop a syllabus above to get started.');
    });

    it('highlights the dropzone while files are dragged over it', () => {
        const zone = query('[data-testid="mis-dropzone"]');

        act(() => {
            zone?.dispatchEvent(dragEvent('dragenter'));
        });
        expect(zone?.getAttribute('data-dragging')).toBe('true');
        expect(zone?.textContent).toContain('Drop to upload');

        act(() => {
            zone?.dispatchEvent(dragEvent('dragleave'));
        });
        expect(zone?.getAttribute('data-dragging')).toBe('false');
    });

    it('uploads a dropped PDF and shows its progress', () => {
        act(() => {
            query('[data-testid="mis-dropzone"]')?.dispatchEvent(dragEvent('drop', [pdf()]));
        });

        expect(rows()).toHaveLength(1);
        act(() => FakeXhr.latest().progress(40, 100));

        expect(statusText()).toBe('Uploading 40%');
        expect(query('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40');
    });

    it('rejects unsupported and oversized files before uploading, and still uploads the good one', () => {
        const oversized = new File(['%PDF-'], 'huge.pdf', { type: PDF_CONTENT_TYPE });
        Object.defineProperty(oversized, 'size', { value: MAX_UPLOAD_BYTES + 1 });

        chooseFiles([pdf(), new File(['x'], 'notes.txt', { type: 'text/plain' }), oversized]);

        const alert = query('[role="alert"]')?.textContent;
        expect(alert).toContain("These 2 files weren't uploaded:");
        expect(alert).toContain("notes.txt isn't a PDF or Word (.docx) file.");
        expect(alert).toContain('huge.pdf is 15.0 MB. Files must be 15 MB or smaller.');
        expect(FakeXhr.instances).toHaveLength(1);
        expect(rows()).toHaveLength(1);
    });

    it('polls the job until it is ready, then offers an active review link', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: jobWith('PROCESSING') }));
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ success: true, data: jobWith('EXTRACTED', { extractedData: { code: 'CO2210' } }) })
        );
        chooseFiles([pdf()]);

        await act(async () => FakeXhr.latest().respond(202, { success: true, data: jobWith('PENDING') }));
        expect(statusText()).toBe('Extracting');
        expect(document.body.textContent).toContain('Not found yet');

        await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
        expect(statusText()).toBe('Extracting');

        await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
        expect(statusText()).toBe('Ready for review');
        expect(rows()[0].textContent).toContain('CO2210');
        const review = Array.from(document.querySelectorAll('a')).find((link) => link.textContent?.includes('Review extraction'));
        expect(review?.getAttribute('href')).toBe(misReviewHash('job-1'));

        await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('shows why extraction failed', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ success: true, data: jobWith('FAILED', { errorMessage: 'No readable text in this PDF.' }) })
        );
        chooseFiles([pdf()]);

        await act(async () => FakeXhr.latest().respond(202, { success: true, data: jobWith('PENDING') }));
        await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));

        expect(statusText()).toBe('Extraction failed');
        expect(rows()[0].textContent).toContain('No readable text in this PDF.');
        expect(document.body.textContent).not.toContain('Review extraction');
    });

    it('shows the server reason when an upload is refused', async () => {
        chooseFiles([pdf()]);

        await act(async () => FakeXhr.latest().respond(400, { detail: 'The file is not a valid PDF document.' }));

        expect(statusText()).toBe('Upload failed');
        expect(rows()[0].textContent).toContain('The file is not a valid PDF document.');
    });
});
