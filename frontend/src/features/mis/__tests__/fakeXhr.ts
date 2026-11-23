/** A scriptable stand-in for XMLHttpRequest: tests drive progress and the response by hand. */
export class FakeXhr {
    static instances: FakeXhr[] = [];

    method = '';
    url = '';
    headers: Record<string, string> = {};
    body: FormData | null = null;
    status = 0;
    responseText = '';
    upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
        onprogress: null,
    };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor() {
        FakeXhr.instances.push(this);
    }

    open(method: string, url: string) {
        this.method = method;
        this.url = url;
    }

    setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
    }

    send(body: FormData) {
        this.body = body;
    }

    progress(loaded: number, total: number) {
        this.upload.onprogress?.({ lengthComputable: true, loaded, total });
    }

    respond(status: number, body: unknown) {
        this.status = status;
        this.responseText = JSON.stringify(body);
        this.onload?.();
    }

    fail() {
        this.onerror?.();
    }

    static latest(): FakeXhr {
        const last = FakeXhr.instances[FakeXhr.instances.length - 1];
        if (!last) throw new Error('no request was sent');
        return last;
    }
}
