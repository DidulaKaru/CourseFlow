import { Pencil } from 'lucide-react';
import { hasPermission, useAuthStore } from '@/features/admin/store/authStore';
import { useCatalogEditsStore } from '@/features/admin/store/catalogEditsStore';
import type { Course } from '@/types/curriculum';

interface EditCourseButtonProps {
    course: Course;
    /** `node` is a compact icon pinned to the card's top-right corner; `drawer` is the full labelled button. */
    placement: 'node' | 'drawer';
}

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Opens the course editor. Renders nothing unless the signed-in account has `courses:write`. */
export function EditCourseButton({ course, placement }: EditCourseButtonProps) {
    const canEdit = useAuthStore(hasPermission('courses:write'));
    const openCourseEditor = useCatalogEditsStore((state) => state.openCourseEditor);
    if (!canEdit) return null;

    const label = `Edit ${course.code}`;
    if (placement === 'node') {
        return (
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    openCourseEditor(course.id);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                className={`nodrag absolute -top-3 right-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-surface-muted ${FOCUS_RING}`}
                aria-label={label}
                title={label}
                data-testid={`edit-course-${course.id}`}
            >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={() => openCourseEditor(course.id)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-muted ${FOCUS_RING}`}
            aria-label={label}
            data-testid="drawer-edit-course"
        >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit course
        </button>
    );
}
