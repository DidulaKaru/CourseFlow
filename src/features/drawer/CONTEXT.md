# Module Details Drawer Feature Slice

## Responsibilities
- **Drawer Component (`ModuleDetailsDrawer.tsx`):** Slide-over panel presenting comprehensive course metadata when a canvas node is clicked.
- **State Integration:** Bound to `isDrawerOpen` and `inspectedCourse` in `usePlannerStore`.
- **Displays:**
  - Course code, title, and detailed description.
  - Multi-semester credit allocation distribution breakdown (e.g., `Semester 7: 3 cr, Semester 8: 3 cr`).
  - Prerequisite AST logic rendered in human-readable terms.
  - Mandatory co-requisite course chips.
  - Interactive actions: Add/Remove elective from active plan, Mark course as completed.

## Invariants
- Opening and closing the drawer dispatches strictly through `openCourseDrawer` and `closeCourseDrawer` in `usePlannerStore`.
- Never mutates course definitions directly.
