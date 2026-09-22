---
title: 'Sets Table: Multi-Select Status Filter Chips'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Sets table's release-state filter (`SoftwareSetsSection` in `frontend/src/SoftwareOverview.tsx`) is a single-select `<select>` — the Product Owner can only filter to one status at a time. This is the last deliverable split out of a larger usability request (2026-09-22 multi-goal split, then a token-budget split); the Software category tree already shipped separately.

**Approach:** Replace the single `stateFilter: string` state with `selectedStates: string[]`. The existing `<select>` becomes an "add" control: it always displays its placeholder option, and choosing a status adds it to `selectedStates` (already-selected statuses are excluded from its `<option>`s, so the same status can't be added twice) instead of directly driving the filter. Selected statuses render as removable chips (label + a `×` button) below the filter bar. Filtering becomes OR logic across all selected statuses, AND'd with the existing search query — exactly like today's single-select AND-with-search, just generalized from "one status or none" to "any of N statuses or none". An empty selection behaves exactly like today's "Alle Status" (no filtering). No other part of `SoftwareSetsSection` (search, category grouping, sorting, the Sets table's own collapsed-by-default state) changes.

</frozen-after-approval>

## Implementation Notes

- The "add" `<select>` is kept always reset to `value=""` (its placeholder, "+ Status hinzufügen") — it never reflects a selected status itself, since selection state now lives entirely in the `selectedStates` array/chips. Its `aria-label` changed from "Nach Freigabestatus filtern" to "Freigabestatus hinzufügen" to match its new "add" semantics, which required updating the two existing tests that referenced the old label.
- `addableStateOptions` filters `stateOptions` down to states not already in `selectedStates`, so a status can't be added as a duplicate chip; removing a chip makes its status selectable again.
- Added `.chips`/`.chip`/`.chip-remove` styles reusing `--accent`/`--accent-bg`/`--accent-border` tokens, consistent with the existing `.badge`/`.category-count` pill styling already in `index.css`.
- Test assertions on chip presence/absence had to be scoped to the chip `<ul aria-label="Ausgewählte Freigabestatus-Filter">` specifically (`within(chipList)` / `getByRole('list', {name: ...})`), rather than a bare `screen.getByText(label)` — a status label like "Entwurf" also appears as hidden `<details>` table-cell content and/or a `<select>` `<option>`, so an unscoped text query is ambiguous once more than one of those is present.
- Replaced the old single-select test with an equivalent chip-based version, and added two new tests: OR logic across two selected chips, and removing a chip both restoring its option to the dropdown and widening the result set again.
- Blind Hunter review found: `selectedStates` wasn't reset on an environment switch (unlike `SoftwareTable`'s already-established `expandedId` reset pattern) — fixed with the same `useEffect(() => ..., [items])` approach, plus a regression test. Chips rendered in click/insertion order instead of the alphabetical order used elsewhere in this filter bar — fixed by sorting `selectedStates` by label before rendering. No test combined 2+ chips with a simultaneous search query — added one. Three more findings (focus management on chip removal, dark-mode hover contrast, the empty-string state sentinel) were real but pre-existing-pattern or non-trivial-fix issues, deferred to `deferred-work.md` rather than patched here.
- While verifying, discovered `SoftwareOverview.test.tsx` is intermittently flaky independent of this story's changes (confirmed via `git stash` against the prior committed state) — logged to `deferred-work.md` rather than investigated here, since it predates and is unrelated to this spec's diff. `npm test`/`npm run build` passed cleanly on the run used for this spec's verification.

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | `selectedStates` isn't reset when `items` changes (environment switch) | medium | Directly analogous to `SoftwareTable`'s already-validated `expandedId`-reset pattern for the same class of staleness; without it, a chip for a status code absent from the new environment's data would show a raw code and silently zero out the results | patch |
| 2 | Selected-status chips render in insertion order, not the alphabetical order used by the "hinzufügen" dropdown, category groups, and in-group rows elsewhere in this component | low | Confirmed inconsistent with the rest of the component's sort conventions; fix is a direct one-line sort | patch |
| 3 | No test combines 2+ selected chips with a simultaneous search query — the diff's hardest boolean path (`(OR across states) AND (search match)`) was unverified | medium | Confirmed by reading all existing tests: one covers 1-chip+search, another covers 2-chips+no-search, none combine both | patch |
| 4 | No focus management when a chip's "×" button (and thus the chip) is removed from the DOM | low | Real for keyboard/screen-reader users, but no established focus-management convention exists elsewhere in `frontend/src`, and the fix requires choosing a sensible focus target — not a direct correction. Deferred | deferred |
| 5 | `.chip-remove:hover` (white text on `--accent`) fails WCAG AA contrast in dark mode (~2.54:1) | low | Verified by contrast calculation, but identical to `.button--primary`'s already-shipped dark-mode styling — not a new/isolated regression this diff introduced in isolation; fixing it here alone would be inconsistent. Deferred as a broader dark-mode contrast pass | deferred |
| 6 | A Sets item with `state === ''` could never be added as a chip (the placeholder option shares the same empty-string value) | low | Pre-existing from the original single-select's identical `stateFilter === ''` sentinel, not newly introduced; no evidence any real EquipmentCloud `state` is ever empty. Deferred | deferred |
| 7 | `SoftwareOverview.test.tsx` is intermittently flaky (~25-40% failure rate across repeated runs), symptom: a `fireEvent`-then-assert not finding expected content | maybe-false (would be medium-high if a real product bug; confirmed as pre-existing test-infra flakiness, not a product defect) | Confirmed via `git stash` to the prior committed state (`942f264`) still showing the same ~25% flake rate with the same symptom pattern — not caused by this spec's diff. What would settle root cause: instrument with React DevTools profiler or `act()` diagnostics, or isolate whether it's specific to `<select>`-with-dynamic-`<option>`-list interactions | deferred |
