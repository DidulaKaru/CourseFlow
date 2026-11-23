import { GitBranch } from 'lucide-react';
import { hasPermission, useAuthStore } from '@/features/admin/store/authStore';
import { useCatalogEditsStore } from '@/features/admin/store/catalogEditsStore';
import type { Course } from '@/types/curriculum';

/** Opens the prerequisite rule editor. Renders nothing unless the account has `prerequisites:write`. */
export function EditPrerequisitesButton({ course }: { course: Course }) {
    const canEdit = useAuthStore(hasPermission('prerequisites:write'));
    const openPrerequisiteEditor = useCatalogEditsStore((state) => state.openPrerequisiteEditor);
    if (!canEdit) return null;

    return (
        <button
            type="button"
            onClick={() => openPrerequisiteEditor(course.id)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`Edit prerequisites for ${course.code}`}
            data-testid="drawer-edit-prerequisites"
        >
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            Edit prerequisites
        </button>
    );
}
