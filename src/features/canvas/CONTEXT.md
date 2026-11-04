# Canvas & Graph Feature Slice

## Responsibilities
- **Viewport Canvas (`CurriculumCanvas.tsx` - CF-111):** Embeds `@xyflow/react` (React Flow v12) with zoom, pan, minimap, and fit-view controls. Wraps node and edge collections derived from `calculateLayout()`, handles smoothstep routing with animated active highlight strokes, and implements hover/click handlers to dim non-connected nodes and illuminate upstream prerequisite dependencies and downstream unlocked electives.
- **Dependency Highlighting Engine (`utils/graphHighlight.ts` - CF-111):** Transitive graph traversals computing upstream prerequisite chains (cyan `#06b6d4`), downstream unlocked electives (emerald `#10b981`), active focus nodes (indigo `#6366f1`), and dimmed unrelated nodes/edges (opacity 0.25).
- **Custom Node (`components/CourseNode.tsx` - CF-111/CF-112):** Tailwind card rendering course code, credit badge, course type badge (`CORE`, `ELECTIVE`, `CAPSTONE`, `LAB`), title, spanning module indicators, and incoming/outgoing handles (`Position.Left` target, `Position.Right` source). Dynamically renders `highlightStatus` (`active`, `upstream`, `downstream`, `dimmed`, `normal`).
- **Swimlanes (`SwimlaneHeader.tsx` - CF-113):** 8 vertical semester swimlane columns spaced horizontally at $X = (\text{semesterIndex} - 1) \times 280\text{px}$. Each header displays real-time credit loads with warning pills (Green if $18 \le \text{credits} \le 24$, Amber/Red alert if $< 18$ or $> 24$).
- **Degree Selector (`DegreeSelector.tsx` - CF-115):** Dropdown toggling active degree curriculum in `usePlannerStore`.

## Invariants
- Nodes are constrained to their respective semester column on the X-axis ($X = (\text{semesterIndex} - 1) \times 280\text{px}$). Dagre handles vertical ($Y$-axis) ordering only.
- Node types (`nodeTypes`) must be declared outside component render loops to preserve memoization and ensure 60 FPS viewport rendering.
- Components read and dispatch to `usePlannerStore` (`@/core/store`).
- Strictly adhere to `@/types/curriculum` types.
