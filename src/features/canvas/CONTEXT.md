# Canvas & Graph Feature Slice

## Responsibilities
- **Viewport Canvas (`CurriculumCanvas.tsx`):** Embeds `@xyflow/react` (React Flow v12) with zoom, pan, minimap, and fit-view controls.
- **Swimlanes (`SwimlaneHeader.tsx`):** 8 vertical semester swimlane columns spaced horizontally at $X = (\text{semesterIndex} - 1) \times 280\text{px}$. Each header displays real-time credit loads with warning pills (Green if $18 \le \text{credits} \le 24$, Amber/Red alert if $< 18$ or $> 24$).
- **Custom Node (`CourseNode.tsx`):** Tailwind card rendering course code, credit badge, course type badge (`CORE`, `ELECTIVE`, `CAPSTONE`), title, and prerequisite satisfaction indicators. Supports hover dependency highlighting and click-to-open drawer.
- **Degree Selector (`DegreeSelector.tsx`):** Dropdown toggling active degree curriculum in `usePlannerStore`.

## Invariants
- Nodes are constrained to their respective semester column on the X-axis ($X = (\text{semesterIndex} - 1) \times 280\text{px}$). Dagre handles vertical ($Y$-axis) ordering only.
- Components read and dispatch to `usePlannerStore` (`@/core/store`).
- Strictly adhere to `@/types/curriculum` types.
