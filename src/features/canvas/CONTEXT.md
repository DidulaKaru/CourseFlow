# Canvas & Graph Feature Slice

## Responsibilities
- **Viewport Canvas (`CurriculumCanvas.tsx` - CF-111):** Embeds `@xyflow/react` (React Flow v12) with zoom, pan, minimap, and fit-view controls. Wraps node and edge collections derived from `calculateLayout()`, handles smoothstep routing with animated active highlight strokes, and implements hover/click handlers to dim non-connected nodes and illuminate upstream prerequisite dependencies and downstream unlocked electives.
- **Dependency Highlighting Engine (`utils/graphHighlight.ts` - CF-111):** Transitive graph traversals computing upstream prerequisite chains (cyan `#06b6d4`), downstream unlocked electives (emerald `#10b981`), active focus nodes (indigo `#6366f1`), and dimmed unrelated nodes/edges (opacity 0.25).
- **Custom CourseNode Component (`components/CourseNode.tsx` - CF-112):** Responsive Tailwind CSS v4 course card:
  - **Connection Handles:** Left handle = Target (`type="target"`, `position={Position.Left}`), Right handle = Source (`type="source"`, `position={Position.Right}`).
  - **Header:** Course code (e.g. `CO544`), credit pill (`3 cr`), type badge (`CORE`, `ELECTIVE`, `CAPSTONE`, `LAB`), and direct completion toggle button.
  - **Body:** Course title with full tooltip on hover, multi-semester banner (`2-Sem Spanning`) when duration > 1 semester.
  - **Direct Toggle on Card:** Fast checkbox/button to select/deselect elective courses directly without opening the drawer.
  - **Footer:** Dynamic status badges: `Completed` (emerald badge), `Warning: Unmet` (amber/red alert badge displaying missing prerequisite courses and credit deficits), and `Prereqs Satisfied`.
  - **Dynamic Styling:** Amber/red border alert when prerequisite AST rules are unmet; Indigo border for Core modules; Emerald border for Selected Electives; dynamic integration with canvas hover and selection highlight states.
- **Semester Swimlane Headers & Credit Meters (`components/SwimlaneHeader.tsx` - CF-113):** 8 vertical semester column header banners aligned horizontally via React Flow viewport coordinate transformation ($X_{\text{screen}} = X_{\text{canvas}} \times \text{zoom} + panX$). Features real-time credit summation via `usePlannerStore.getSemesterCredits()`, multi-semester capstone split credit accounting, credit meter progress bars with minimum 18-credit markers, and dynamic compliance pills (Emerald `Valid Load` when $18 \le \text{credits} \le 24$, Rose `< 18 cr Underload` alert badge with `AlertTriangle`, and Amber `> 24 cr Overload` badge).
- **Degree Selector (`DegreeSelector.tsx` - CF-115):** Dropdown toggling active degree curriculum in `usePlannerStore`.

## Invariants
- Nodes are constrained to their respective semester column on the X-axis ($X = (\text{semesterIndex} - 1) \times 280\text{px}$). Dagre handles vertical ($Y$-axis) ordering only.
- Node types (`nodeTypes`) must be declared outside component render loops to preserve memoization and ensure 60 FPS viewport rendering.
- Left handle is strictly Target (`type="target"`), Right handle is strictly Source (`type="source"`).
- Components read and dispatch to `usePlannerStore` (`@/core/store`).
- Strictly adhere to `@/types/curriculum` types.
