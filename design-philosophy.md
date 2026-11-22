# CourseFlow Design Philosophy

> **Personality:** a friendly study planner that's on the student's side. It's calm, warm and clear, like a good academic advisor with a nice notebook.
> **Primary platform:** mobile phones (375px is the reference width, 320px is the minimum). Desktop is the enhanced experience, not the other way round.

This replaces the earlier Skyrim "perk constellation" direction, which users found dark and hostile. Any Skyrim, constellation, obsidian or glass styling mentioned in older docs or sprint plans is superseded by this file.

---

## 1. Principles

1. **Phone first, thumb first.** Design every screen at 375px before thinking about desktop. Put primary actions where a thumb reaches: the bottom of the screen, a bottom sheet or a sticky footer.
2. **Clarity over cleverness.** A student should answer "What can I take next semester?" within five seconds of opening the app. If decoration doesn't help with that question, leave it out.
3. **Warm, never hostile.** Use light, airy surfaces, soft rounded shapes and encouraging words. A blocked course is a next step, not a failure, so explain how to unlock it.
4. **Status is never color alone.** Every state pairs color with an icon and a word, such as *Completed*, *Planned*, *Locked* or *Needs CO2210*.
5. **Respect the record.** Course codes, titles and credit values are official catalog data. Show them verbatim, and never rephrase, abbreviate or translate them.

## 2. Color

Light-first, with warm neutrals and one department accent. Components use **tokens only** and never raw hex values, which keeps both departments (and a future dark mode) working.

```css
/* index.css — Tailwind v4 */
@theme {
  --color-canvas: #FAFAF9;         /* app background, warm off-white */
  --color-surface: #FFFFFF;        /* cards, sheets */
  --color-surface-muted: #F5F5F4;  /* grouped rows, inputs */
  --color-line: #E7E5E4;           /* default borders, dividers */
  --color-line-strong: #D6D3D1;    /* decorative emphasis only (1.5:1); input borders use ink-subtle */
  --color-ink: #1C1917;            /* primary text */
  --color-ink-muted: #57534E;      /* secondary text (7.6:1 on white) */
  --color-ink-subtle: #78716C;     /* meta text, minimum allowed (4.8:1 on white, 4.6:1 on canvas); also input borders */

  --color-success: #15803D;  --color-success-soft: #DCFCE7;
  --color-warning: #B45309;  --color-warning-soft: #FEF3C7;
  --color-danger:  #B91C1C;  --color-danger-soft:  #FEE2E2;

  --font-display: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

/* Department accent: swapped at runtime via document.documentElement.dataset.department */
@theme inline {
  --color-accent: var(--dept-accent);
  --color-accent-strong: var(--dept-accent-strong);
  --color-accent-soft: var(--dept-accent-soft);
}
:root, [data-department="ce"] {    /* Computer Engineering: teal */
  --dept-accent: #0F766E;          /* white text on it: 5.5:1 */
  --dept-accent-strong: #115E59;
  --dept-accent-soft: #CCFBF1;
}
[data-department="ee"] {           /* Electrical Engineering: warm orange */
  --dept-accent: #C2410C;          /* white text on it: 5.2:1 */
  --dept-accent-strong: #9A3412;
  --dept-accent-soft: #FFEDD5;
}
```

Usage:
- The app background is `bg-canvas`. Cards are `bg-surface border border-line`. Grouped or secondary areas are `bg-surface-muted`.
- Accent fills (`bg-accent text-white`) are for one primary action per screen and for selected states. Soft tints (`bg-accent-soft text-accent-strong`) are for chips and highlights.
- `danger` is reserved for destructive actions and real errors. A missing prerequisite is `warning`, not `danger`.
- Avoid pure black (`#000`), dark full-screen backgrounds, neon glows and saturated gradients.

### Course states

| State | Look | Icon (Lucide) | Label |
| --- | --- | --- | --- |
| Completed | `bg-success-soft`, `text-success` | `CircleCheck` | Completed |
| Planned / selected | `border-accent`, `bg-accent-soft/40` | `CalendarCheck` | Planned |
| Available | `bg-surface`, `border-line` | none | — |
| Locked (missing prerequisite) | `bg-surface-muted`, `text-ink-muted` | `Lock` | Needs `<code>` |
| Failed / retake | `bg-warning-soft`, `text-warning` | `RotateCcw` | Retake |

## 3. Typography

Use two friendly sans-serif families and no all-caps headings.

| Role | Class | Mobile size | Notes |
| --- | --- | --- | --- |
| Screen title | `font-display font-bold` | 22–24px | Sentence case |
| Section / semester heading | `font-display font-semibold` | 18px | "Semester 3" |
| Card title (course title) | `font-sans font-semibold` | 16px | Up to 2 lines, then truncate with full title in details |
| Body | `font-sans` | **16px** | 16px also stops iOS from zooming when an input gets focus |
| Meta (code, credits, chips) | `font-sans font-medium tabular-nums` | 13–14px | Course codes use `tracking-wide`, not monospace |
| Smallest allowed | `text-xs` | 12px | Only for tertiary meta. Never use `text-[9px]`/`[10px]`/`[11px]` |

Line height 1.5 for body, 1.25 for headings. Keep line length under about 70 characters on desktop.

## 4. Shape, space and elevation

- **Rounded and soft.** Cards and sheets are `rounded-2xl` (16px), buttons and inputs `rounded-xl` (12px), chips and pills `rounded-full`.
- **Elevation is gentle.** Cards at rest use `shadow-sm` or just a border. Sheets and menus use `shadow-lg`. There are no colored glows.
- **Spacing** follows the 4px scale. Screen gutters are 16px on mobile (`px-4`) and 24–32px on desktop. Card padding is `p-4`, and the gap between cards is `gap-3`.
- **Touch targets** are at least **44×44px** (`min-h-11 min-w-11`), with at least 8px between adjacent targets.

## 5. Mobile experience (the primary product)

- **Default view is the semester list** (`SemesterFeed`), with one vertically scrolling column of semester sections. The prerequisite graph is an optional "Map" view.
- **App bar:** compact, with the program name and a credit progress bar ("96 of 150 credits"). Long names truncate, and the bar never wraps to two lines.
- **Semester sections:** the semester header sticks while its courses scroll, and shows the semester credit total plus a load status (*Light load*, *Good load*, *Heavy load*).
- **Course card:** shows the code and credits on one line, the title (up to 2 lines) and the state chip. Tapping anywhere on the card opens details. There are no hover-only affordances anywhere.
- **Details open in a bottom sheet**, not a side drawer, on screens under 768px. The sheet has a drag handle, a 44px close button, swipe-down to close and Escape on keyboards. Content: what it is, what it needs (prerequisites as tappable chips), what it unlocks, and one primary action ("Add to plan" or "Mark completed").
- **Primary actions sit in the thumb zone:** a sticky bottom bar or the sheet footer, padded with `pb-[env(safe-area-inset-bottom)]`.
- **Safe areas and viewport:** respect `env(safe-area-inset-*)`, use `min-h-dvh` (not `h-screen`) and never disable pinch zoom in the viewport meta.
- **No horizontal page scroll** at 320px. Long titles wrap, and tables become stacked rows.
- **Performance is part of the design.** Keep the list view usable on a mid-range phone: lazy-load the graph view and the PDF renderer, avoid large blur effects, and keep animations GPU-friendly (opacity and transform only).

## 6. Desktop enhancements

- The graph (React Flow) becomes the default view at ≥ 1024px. It shows light canvas dots on `bg-canvas`, white rounded course nodes and gentle curved edges in `--color-line-strong`.
- Selecting a course highlights its prerequisites in `accent` and what it unlocks in `success`, and fades everything else to about 30% opacity. Highlighting never flashes or pulses continuously.
- Details can use a right-side panel instead of a sheet. Hover may *add* information but never be the only way to reach it.
- Canvas camera rules (finite `translateExtent`, vertical scroll pan, no scroll zoom) still apply. See CLAUDE.md.

## 7. Motion

- Motion is short and soft: 150–250ms, `ease-out`, and only opacity or transform. The bottom sheet slides up in about 250ms.
- A small moment of delight is welcome when a semester plan becomes valid or a course is completed, such as a check-mark scale-in or a progress bar fill. Don't use confetti storms, bounces or looping animations.
- Honor `prefers-reduced-motion: reduce` by replacing slides with fades or nothing.

## 8. Voice and copy

Write as a helpful senior student would: plain, warm and specific. Use "you", use sentence case, and avoid jargon and exclamation-mark spam.

| Instead of | Write |
| --- | --- |
| "PREREQUISITE CONSTRAINT VIOLATION" | "You'll need CO2210 first." |
| "Invalid semester load" | "This semester is a bit heavy (27 credits). Most students take 18–24." |
| "No data" | "No electives planned yet. Browse electives to add some." |
| "System disruption" | "Something went wrong loading your plan. Your saved plans are safe. Try again." |

Empty states always offer the next action. Errors say what happened, reassure the student that their data is safe (when that's true) and give a way forward. Use Lucide icons rather than emoji, because emoji render differently on every phone.

## 9. Accessibility

- Text contrast meets WCAG AA (4.5:1 for body text, 3:1 for large text and UI boundaries). The tokens above are chosen to pass, so don't lighten them.
- Every interactive element is reachable by keyboard and screen reader, with a visible focus ring: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`.
- Keep `role`, `aria-label`, `tabIndex` and keyboard handlers on course cards and nodes. The bottom sheet traps focus while open and returns focus to the card that opened it.
- Support text zoom up to 200% without clipping. Don't put fixed heights on text containers.

## 10. Migrating from the Skyrim theme

The codebase still contains the legacy dark theme. Migrate it component by component, and don't do a big-bang rewrite.

| Legacy | Replace with |
| --- | --- |
| `bg-[#030508]`, `skyrim-canvas-bg` | `bg-canvas` |
| `bg-[#070B12]/85 backdrop-blur-sm` | `bg-surface border border-line shadow-sm` |
| `border-white/10` | `border-line` |
| `text-slate-100` / `text-[#F8FAFC]` | `text-ink` |
| `text-slate-400` | `text-ink-muted` |
| `var(--constellation-beam)`, `var(--accent-primary)` | `accent` utilities (`bg-accent`, `text-accent`, `border-accent`) |
| `var(--star-pip)`, diamond pips | Lucide state icons |
| `font-serif uppercase tracking-[0.2em]` (Cinzel) | `font-display font-semibold` sentence case |
| `font-mono` for codes and credits | `font-medium tabular-nums tracking-wide` |
| `text-[9px]` / `text-[10px]` / `text-[11px]` | `text-xs` at minimum, usually `text-sm` |
| `rounded-sm` / `rounded-none` cards | `rounded-2xl` cards, `rounded-xl` buttons |

`scripts/check_invariants.py` (the `ui-migration` check) rejects legacy tokens, raw hex class values and sub-12px text on **new or changed lines only**. Old code passes until someone touches it, and then the touched lines have to move to the new system.

## 11. Before you merge a UI change

- [ ] Designed and checked at 375px first, then 320px, then desktop
- [ ] Checked in both departments (CE teal, EE orange)
- [ ] Touch targets are at least 44px, body text is 16px, nothing scrolls horizontally, and safe areas are respected
- [ ] Every state uses an icon and a label, not color alone, and contrast passes AA
- [ ] Keyboard and screen reader path works, and focus is visible
- [ ] Reduced motion is respected
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `python scripts/check_invariants.py`
