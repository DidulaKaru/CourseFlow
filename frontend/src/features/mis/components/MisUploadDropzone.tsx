import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { ACCEPTED_UPLOAD_TYPES } from '@/features/mis/utils/uploadRules';

interface MisUploadDropzoneProps {
    onFiles: (files: File[]) => void;
}

/** Drop syllabus files here, or choose them with the button (the only option on touch screens). */
export function MisUploadDropzone({ onFiles }: MisUploadDropzoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    // dragenter/dragleave fire for every child element; count them so hovering a child does not flicker.
    const dragDepth = useRef(0);

    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

    const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setIsDragging(true);
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
        if (!hasFiles(event)) return;
        dragDepth.current = Math.max(dragDepth.current - 1, 0);
        if (dragDepth.current === 0) setIsDragging(false);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onFiles(files);
    };

    return (
        <div
            onDragEnter={handleDragEnter}
            onDragOver={(event) => {
                if (hasFiles(event)) event.preventDefault();
            }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-testid="mis-dropzone"
            data-dragging={isDragging}
            className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-200 motion-reduce:transition-none sm:py-10 ${
                isDragging ? 'border-accent bg-accent-soft' : 'border-ink-subtle bg-surface'
            }`}
        >
            <FileUp
                className={`h-10 w-10 transition-transform duration-200 motion-reduce:transition-none ${isDragging ? 'scale-110 text-accent-strong' : 'text-ink-muted'}`}
                aria-hidden="true"
            />
            <div>
                <p className="text-base font-semibold text-ink">
                    {isDragging ? 'Drop to upload' : 'Drag syllabus files here'}
                </p>
                <p className="mt-1 text-sm text-ink-muted">PDF or Word (.docx), up to 15 MB each</p>
            </div>
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                Choose files
            </button>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_UPLOAD_TYPES}
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                data-testid="mis-file-input"
                onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    // Reset so choosing the same file again still fires a change event.
                    event.target.value = '';
                    if (files.length > 0) onFiles(files);
                }}
            />
        </div>
    );
}
