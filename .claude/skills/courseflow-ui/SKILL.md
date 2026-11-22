---
name: courseflow-ui
description: CourseFlow's visual design, mobile-first UX rules and UI taste (friendly, light, inviting study planner). Use before creating or changing any React component, Tailwind class, CSS, layout, copy, icon, animation or interaction in frontend/src, when migrating legacy Skyrim-styled code, and when judging whether a UI looks and feels right.
---

# CourseFlow UI

CourseFlow is a friendly study planner that's on the student's side, and most students use it on a phone. The full spec, including tokens, type scale, states, copy and the migration table, is in `design-philosophy.md`. Read it before your first UI change in a session. This skill is the working summary and the judgment layer.

> The old Skyrim / constellation / dark-glass direction is retired. If a sprint plan or older doc asks for "obsidian glass", Cinzel or glowing beams, follow `design-philosophy.md` instead and mention the conflict in your report.

## Work order

1. **Start at 375px.** Sketch the mobile layout first (what's on screen, where the thumb goes, what scrolls). Then check 320px and widen to desktop. Desktop adds; it never replaces.
2. **Use tokens only:** `bg-canvas`, `bg-surface`, `bg-surface-muted`, `border-line`, `text-ink`, `text-ink-muted`, `text-ink-subtle`, plus `accent`, `accent-strong`, `accent-soft` and `success`/`warning`/`danger` (with `-soft` variants). No raw hex in classes (`bg-[#...]`), because that breaks the department theming.
3. **Reuse before building.** Check `frontend/src/features/**/components/` for an existing card, chip, sheet or button pattern. If the component is still legacy-styled, migrate it with the table in design-philosophy.md section 10 rather than copying the old classes.
4. **If you touch a legacy line, migrate it.** The `ui-migration` check rejects legacy tokens (`constellation-*`, `star-pip`, `font-serif`, Cinzel, `skyrim-*`), raw hex class values and sub-12px text on new or changed lines. Use `cf-allow: <reason>` only for a real exception, such as a third-party style override.

## Mobile rules (non-negotiable)

- Touch targets are at least 44×44px (`min-h-11`), with 8px or more between targets.
- Body text is 16px, meta text 13–14px, and nothing is smaller than 12px (`text-xs`).
- There's no horizontal page scroll at 320px. Titles wrap to 2 lines, then truncate.
- Primary actions go in the thumb zone: a sticky bottom bar or the bottom sheet footer, with `pb-[env(safe-area-inset-bottom)]`.
- Course details open in a **bottom sheet** under 768px, with a drag handle, swipe-down and a 44px close button. Focus is trapped while open and returns to the card that opened it.
- Nothing depends on hover. Every affordance works by tap.
- Use `min-h-dvh` rather than `h-screen`. Never disable pinch zoom.
- Keep it light on mid-range phones: lazy-load heavy views (graph, PDF), skip large `backdrop-blur`, and animate only opacity and transform.

## Taste

- **One job per screen.** Each screen has one primary action in `bg-accent text-white rounded-xl`. Everything else is secondary (`border-line` or text buttons).
- **Friendly, not childish.** Use soft radius (`rounded-2xl` cards, `rounded-full` chips), generous whitespace and gentle `shadow-sm`. No gradients, neon, glows, emoji or cartoon illustrations in core flows.
- **States speak in three channels:** color, Lucide icon and word (*Completed*, *Planned*, *Needs CO2210*). A blocked course explains how to unlock it.
- **Hierarchy through size and weight**, not color. A card reads as code · credits on one line, then the title, then the state chip. Don't stack more than two chips on a card.
- **Words are part of the design.** Use "you", sentence case and specific numbers ("3 credits left to graduate"). Empty states suggest the next action. Errors reassure the student and offer a retry. See the copy table in design-philosophy.md section 8.
- **Delight in small doses.** A check-mark scale-in or progress fill at 150–250ms `ease-out` is fine. Nothing loops or bounces, and `prefers-reduced-motion` is respected.
- **Catalog strings verbatim.** Never rephrase course codes, titles or credits.

## Accessibility (never regress)

- Contrast meets AA. The tokens pass as defined, so don't lighten text. Input borders use `ink-subtle` (`line` is decorative only).
- Keep `role`, `aria-label`, `tabIndex={0}` and keyboard handlers on course cards and nodes. Enter/Space activate, and Escape closes sheets and modals.
- Visible focus uses `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`.
- Layouts survive 200% text zoom, so don't put fixed heights on text containers.
- Don't touch canvas camera props or `translateExtent` in a styling change (see CLAUDE.md). Resolve courses via `getProgramCourses(activeProgramId)`.

## Done checklist

- [ ] Checked at 375px and 320px first, then desktop, in both CE (teal) and EE (orange).
- [ ] Touch targets are at least 44px, body text 16px, no horizontal scroll, and safe areas are respected.
- [ ] States use color, icon and label. Copy is friendly and specific.
- [ ] `python scripts/check_invariants.py --only ui,ui-migration` passes.
- [ ] A component test (Vitest + jsdom, nearest `__tests__/`) covers new interactive behavior, including keyboard.
- [ ] Ran the app (`npm run dev`) and looked at it at phone width. For a larger change, ran the `design-critic` agent.
