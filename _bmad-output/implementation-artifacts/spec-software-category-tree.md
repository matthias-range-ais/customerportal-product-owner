---
title: 'Software Table: Category Tree with Click-to-Expand Detail'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '840e04afdc15bb67013b0539a9404dcd1ef4aab0'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Software table is a flat list with a "Versionen" column that eats too much horizontal space. Sets already has a category-grouped tree; Software doesn't. Sets' category groups also default to open on load, which will get noisy once Software groups exist too. This is the first of two deliverables split out of a larger usability request (2026-09-22 multi-goal split, then a token-budget split); the Sets multi-select status filter is deferred separately in `deferred-work.md`.

**Approach:** Give the Software table the same category-grouped tree as Sets: collapsed by default, each category header showing the filtered item count. Expanding a category shows a plain list of its software names — no Kategorie or Versionen column. Clicking a software name expands an inline, full-row detail block beneath it with the description and version names. Sets' existing category groups also switch to collapsed-by-default (their `open` attribute is currently hardcoded), so both tables behave consistently.

## Boundaries & Constraints

**Always:**
- `/api/software` keeps returning every item's `description`/`versions` eagerly, exactly as today — this only changes when that data is *displayed* (on click), not when it's fetched. No backend/port/client changes.
- Reuse the existing grouping pattern (`groupSetsByCategory` in `SoftwareOverview.tsx`) — generalize it into one function both `SoftwareTable` and `SoftwareSetsSection` use, rather than duplicating grouping/sorting logic.
- Category counts reflect the currently search-filtered item set, exactly like Sets already does.
- Keep all GUI text German; keep using existing `.card`/`.table-block`/`.category-group`/`.filter-bar`/`.filter-input` conventions and CSS custom properties (no hardcoded colors).

**Never:**
- Do not add a new backend endpoint or lazy-load version/description data per item — that's an explicitly undecided future idea (noted by the user, not part of this spec); keep the existing eager-fetch-everything behavior.
- Do not touch the Sets status filter's `<select>` — the multi-select chip rework is a separate, deferred spec. Only Sets' `open`-by-default attribute changes here.
- Do not touch the Settings dialog, environment switching, or the two-column table layout shipped in earlier stories.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Software grouped by category | Software items span multiple categories | Categories list collapsed, each showing `Kategorie (N)` where N is the search-filtered count; expanding one shows that category's software names only | A category with 0 matches after filtering doesn't render (same as Sets today) |
| Expand a software item | Product Owner clicks a software name inside an expanded category | An inline detail block appears showing the description and a comma-joined version list, spanning the full row width | No description → shows a clear placeholder; no versions → shows a clear placeholder, not an empty area |
| Collapse another item | An item's detail is already expanded; Product Owner clicks a different item | The previous detail collapses, the newly clicked one expands (one expanded at a time) | Clicking the already-expanded item again collapses it |
| Collapsed-by-default on load | Page loads with Software and Sets data | Every category `<details>` in both tables starts closed; nothing is pre-expanded | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/SoftwareOverview.tsx` -- current state: `SoftwareTable` is a flat `<table>` (Name/Kategorie/Beschreibung/Versionen) with a search box; `SoftwareSetsSection` groups via `groupSetsByCategory` into `<details className="category-group" open>` (hardcoded open). Changes:
  - Generalize `groupSetsByCategory` into `groupByCategory<T extends { category: string; name: string }>(items: T[])` (same trim/sort-by-name/sort-by-category-with-`'de-DE'` behavior); use it from both `SoftwareTable` and `SoftwareSetsSection`.
  - Rewrite `SoftwareTable`: keep the existing search input/`matchesSoftwareQuery`; replace the flat `<table>` with `category-groups`/`category-group` `<details>` markup (no `open` attribute) mirroring Sets' structure, each group rendering a `<ul className="software-list">` of clickable items (name only). Add `expandedId` state (`number | null`; clicking the already-expanded item collapses it, clicking another replaces it). The expanded item renders a `.software-detail` block with `item.description || 'Keine Beschreibung vorhanden.'` and `item.versions.length ? item.versions.map(v => v.name).join(', ') : 'Keine Versionen vorhanden.'`.
  - Remove Sets' hardcoded `open` attribute on `<details className="category-group">` so it also defaults to collapsed.
- `frontend/src/index.css` -- add `.software-list`, `.software-list-item`, `.software-list-row` (clickable, full-width, hover state — reuse `--border`/`--accent`/`--text-h` tokens), `.software-detail` (description + versions block). Reuse existing `.filter-bar`/`.filter-input`/`.category-group` rules, don't duplicate them.
- `frontend/src/SoftwareOverview.test.tsx` -- Software-table tests currently assert flat-table content (description/versions text visible without interaction) and need rewriting for the click-to-expand flow. The Sets "groups sets by category into open-by-default sections..." test needs renaming and reworking now that groups start closed (assert closed-by-default, then click `<summary>` to expand before asserting row content). Add coverage for every I/O & Edge-Case Matrix row above.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/SoftwareOverview.tsx` -- add the generalized `groupByCategory` helper, used by both tables -- removes duplicated grouping/sorting logic
- [x] `frontend/src/SoftwareOverview.tsx` -- rewrite `SoftwareTable` as a collapsed-by-default category tree with a clickable, expandable item list (no Versionen/Kategorie columns) -- delivers the Software-table restructuring
- [x] `frontend/src/SoftwareOverview.tsx` -- drop the hardcoded `open` on Sets' category groups -- delivers the shared collapsed-by-default requirement
- [x] `frontend/src/index.css` -- add the new list/detail styles -- styles the new UI
- [x] `frontend/src/SoftwareOverview.test.tsx` -- rewrite/extend tests per the Code Map notes and the I/O & Edge-Case Matrix, including updating the Sets open-by-default test -- verifies the new behavior
- [x] Root and frontend test/build suites -- run after the above -- confirm nothing broke

**Acceptance Criteria:**
- Given Software items across several categories, when the page loads, then every category is collapsed and shows its filtered item count; expanding one shows only that category's software names, with no Versionen or Kategorie column.
- Given an expanded category, when the Product Owner clicks a software item, then a full-width detail block with its description and version names appears beneath it, without a separate network request.
- Given the Sets table, when the page loads, then its category groups are also collapsed by default (not open, as before).

## Implementation Notes

- Software's "no data"/"no matches" placeholders changed from a table row (`<tr><td colSpan={4}>`) to a plain `<p className="data-table-empty">`, since `SoftwareTable` no longer renders a `<table>`. Sets' empty-state markup is unchanged. Existing placeholder-text assertions still pass unchanged.
- `.software-list-row` reuses `--border`/`--accent`/`--accent-bg`/`--text` custom properties (the spec's Code Map named `--text-h` as an example token; `--text` was used instead since it's the body-text token already used for similar row text elsewhere) — no hardcoded colors were introduced.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | `SoftwareTable`'s `expandedId` state isn't reset when the visible item set changes (environment switch changing the `items` prop, or the search query narrowing/widening results) | medium | Confirmed at `SoftwareOverview.tsx:118-135`: `expandedId` is plain `useState`, never reset on `items`-prop change or `query` change. Two independent reviewers (blind-hunter, edge-case-hunter) flagged this; on an environment switch, if the new item list happens to contain an item sharing the previously-expanded numeric id, its detail auto-shows without a click, misattributing data the user never requested | patch |
| 2 | Category-count badge lacks a test that narrows a category via search while it stays visible, so a regression reverting the count source to the unfiltered `items` list would ship silently | medium | Verification-gap layer traced it: `shows each category collapsed with its filtered item count` (`SoftwareOverview.test.tsx`) runs with an empty query, so `filtered === items` and can't distinguish a filtered vs. unfiltered count source; the zero-match test only asserts group disappearance, not a shrinking-but-nonzero count. The spec's `<frozen-after-approval>` I/O matrix explicitly requires "search-filtered count" | patch |
| 3 | `.software-list-row` has no `:focus-visible` rule, unlike the app's other interactive controls | low | Confirmed: `.filter-input:focus-visible` and `.field input:focus-visible` (`index.css:235,392`) both use `box-shadow: 0 0 0 3px var(--accent-bg)`; the new `.software-list-row` (`index.css:540`) has no matching rule. Fix is a direct one-rule addition matching an established pattern, so kept despite low severity | patch |
| 4 | Missing `aria-controls`/`id` pairing between the expand button and `.software-detail`, no `role="region"`, unlabeled `<p>` tags for description/versions | low | Checked: no `aria-controls`/`role="region"` convention exists anywhere else in `frontend/src` (grepped) — this isn't an established house pattern the diff broke, and the fix (ids, ARIA wiring, or labelled regions) is more than a direct correction. Rejected per the low-severity/non-trivial-fix rule | rejected |
| 5 | `<details className="category-group"><summary>…(count)</summary>` header markup is duplicated near-identically in `SoftwareTable` and `SoftwareSetsSection` | low | The spec only asked to generalize the grouping/sorting *function* (done via `groupByCategory`), not the header JSX. Duplication is ~3 lines with low drift risk; extracting a shared header component is more than a trivial fix. Rejected per the low-severity/non-trivial-fix rule | rejected |
| 6 | Software's empty state (`items.length === 0`) now renders a bare `<p>` while Sets' equivalent branch still renders a full `<table>`, a visual inconsistency between the two sections | false | This is the direct, intended consequence of the frozen spec's Code Map, which explicitly directs replacing Software's `<table>` with `<details>`/list markup while leaving Sets' structure untouched aside from the `open` attribute — not a defect introduced beyond what the intent specified | false |
| 7 | No test covers collapsing a category `<details>` while an item inside it is expanded, and no test exercises the keyboard path (Enter/Space) instead of `fireEvent.click` | low | Speculative test-coverage suggestions, not a demonstrated bad outcome — the matrix doesn't require either interaction, and native `<details>`/`<button>` keyboard operability is browser-provided, not app logic under test elsewhere in this codebase. Rejected | rejected |

**Second independent review pass (2026-09-22, same session):** the implementing agent ran its own review→patch→commit cycle above (rows 1-7, commit `f3844b9`) without waiting for the orchestrating session's own review, which the workflow expects to run afterward. The orchestrating session ran all three layers independently against the already-committed diff and found the following. None overlap with rows 1-7 above (already fixed there); two were superseded/split into more precise findings.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 8 | The fix for row 3 added `.software-list-row:focus-visible { border-color: var(--accent); box-shadow: ...; }`, copied from `.filter-input:focus-visible`, but `.software-list-row` itself has `border: none` — `border-color` has no visible effect | low | Confirmed by reading `index.css`: `.filter-input` has a real `1px solid var(--border)` to recolor on focus; `.software-list-row` does not. `box-shadow` alone already provides a visible focus ring, so this is dead CSS, not a functional a11y gap. Direct one-line deletion | patch |
| 9 | The search-input `onChange` resets `expandedId` on every keystroke (guards against a stale detail resurfacing after a search round-trip), but no test exercises "item expanded → search narrows it out → search clears → item reappears" | medium | Pre-verified by the verification-gap layer: read all of `SoftwareOverview.test.tsx`, confirmed no test combines an expanded detail with a subsequent search change. Demonstrated: removing the `setExpandedId(null)` line would let a previously-expanded item's detail silently resurface once search results widen again, with no test catching it | patch |
| 10 | The `useEffect(() => setExpandedId(null), [items])` guard (added for row 1) has no test exercising an environment switch whose new item list reuses a previously-expanded item's numeric `id` for a different item | medium | Pre-verified by the verification-gap layer: EquipmentCloud item ids aren't guaranteed distinct across environments (a recorded project fact). Demonstrated: without the effect, switching environments could auto-expand an unrelated item's detail that happens to share the old `id`, with no test catching a regression to this effect | patch |
| 11 | `expandedId` is a bare `item.id`, not scoped per category — if two software items ever shared an `id`, clicking one would also expand/collapse the other | false | `item.id` is the REST resource key used to fetch per-item detail (`GET /sharedsoftware/{id}`), so it's a global primary key by construction — the same assumption every other `key={item.id}` usage in this codebase (including the pre-existing Sets table) already relies on. Not a new risk introduced by this diff |
| 12 | `deferred-work.md`'s two pre-existing entries from the 2026-09-22 multi-goal split (one describing exactly this Software category-tree work, the other still mentioning "default the category groups to collapsed") aren't updated or marked resolved now that this spec ships them | false | `deferred-work.md`'s own convention (followed consistently all session) is append-only — "Do not modify existing entries or look for duplicates." A stale-but-superseded entry is expected under that rule, not a defect |
| 13 | `SoftwareTable`'s `useEffect(() => setExpandedId(null), [items])` also fires on first mount, forcing an extra render before any interaction | false | React's `useState` setter bails out of re-rendering when the new value is `Object.is`-equal to the current one; `expandedId` is already `null` on mount, so `setExpandedId(null)` here is a no-op — no extra render occurs |
| 14 | No visual affordance (e.g. a chevron) indicates a software-list row is expandable beyond a color/weight change on `aria-expanded` | low | No established convention for expand-affordance icons exists elsewhere in `frontend/src`; `cursor: pointer` and the existing `:hover` background already signal interactivity. Same rejection basis as row 4 (non-trivial fix, no house pattern) |
| 15 | `.software-detail` has no background/border/indent to visually separate it from its row, unlike Sets' table-row-based detail | low | Cosmetic design-decision, not a demonstrated usability defect; `.software-detail` already has padding providing some separation. Fixing this means choosing a visual treatment, which is more than a direct correction — rejected on the same basis as row 5 |

Findings 8-10 were patched directly (dead CSS line removed; both missing regression tests added to `SoftwareOverview.test.tsx`), re-verified with the full suite (69 backend + 48 frontend tests green, clean build), and committed separately from `f3844b9`.

## Verification

**Commands:**
- `npm test` -- expect all backend tests unchanged/green (no backend files touched) and the full frontend suite green, including the rewritten/new tests
- `npm run build` -- clean, no type errors
- `cd frontend && npm test` -- frontend suite green
- `cd frontend && npm run build` -- clean, no type errors
