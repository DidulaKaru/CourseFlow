# Module Details Drawer Feature Slice

## Responsibilities
- **Drawer Component (`ModuleDetailsDrawer.tsx` - CF-114):** Slide-over inspection panel presenting comprehensive course metadata when a canvas node is clicked.
- **State Integration:** Bound reactively to `isDrawerOpen` and `inspectedCourse` in `usePlannerStore`.
- **Dismissal Mechanisms:** Smooth CSS slide-out on backdrop click, header close button click, or `Escape` keypress.
- **Content Displays:**
  - Course code, full title, total credits pill, course type badge (`CORE`, `ELECTIVE`, `CAPSTONE`, `LAB`), and offering semesters.
  - Comprehensive syllabus description and academic objectives.
  - Prerequisite AST logic rendered in formatted boolean expressions with real-time satisfaction badges.
  - Prerequisite component course dependency chips with interactive `Completed` vs `Missing` status.
  - Mandatory co-requisite course chips requiring concurrent semester enrollment.
  - Multi-semester credit allocation distribution timeline (e.g., `Semester 7: 3 cr` ──► `Semester 8: 3 cr`).
  - Academic contact hours breakdown (Lectures, Labs, Tutorials per week).
  - Interactive action controls: "Add to Study Plan" / "Remove from Study Plan" for electives, and "Mark as Completed" / "Mark as Incomplete" toggle for any module.

## Invariants
- Opening and closing the drawer dispatches strictly through `openCourseDrawer` and `closeCourseDrawer` in `usePlannerStore`.
- Never mutates course definitions directly; all customizations persist through `usePlannerStore` client-side storage.
- Adheres strictly to contracts defined in `@/types/curriculum`.
