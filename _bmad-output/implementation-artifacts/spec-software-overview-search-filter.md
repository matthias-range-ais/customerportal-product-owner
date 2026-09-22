---
title: 'SoftwareCenter Overview: Search, Filter & Category Grouping'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a2aacc66c68b5ffa4aa4675125e7eec39f8d5714'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The SoftwareCenter overview (Story 1.4) renders the Software and Sets tables as flat, unfiltered lists. As the real EquipmentCloud data grows, the Product Owner has no way to find a specific item or narrow the Sets table by release state or category, and the Sets table has no indication of when a set was last updated. This was deferred out of the Settings-dialog story (`spec-settings-dialog.md`, 2026-09-21 multi-goal split) as an independently shippable deliverable; it was already implemented and working (tests green, build clean) in that story's working tree before being reverted purely for scope sequencing.

**Approach:** Add a search input to the Software table (matches name/category/description) and to the Sets table (matches name/category, combinable with a release-state filter), group the Sets table's rows into collapsible per-category sections, and add a "Datum" column to Sets sourced from EquipmentCloud's `updated_on` field — end to end from `equipmentcloud-client.ts` through the port and the `/api/software` route to the UI.

## Boundaries & Constraints

**Always:**
- Search is client-side over the already-fetched `/api/software` payload — no new query parameters or backend filtering.
- Follow the existing nullable-`category` handling already in `equipmentcloud-client.ts` (`?? ''`); do not weaken or duplicate it.
- Keep all GUI text German; keep using the existing `.card`/`.table-block`/`.table-scroll`/`.data-table` styling conventions already in `index.css`.
- `updatedOn` flows through unmodified from EquipmentCloud's `sharedsets` `updated_on` (ISO-8601, confirmed present in `openapi_equipmentcloud_preview.yaml`'s `sharedsets` example) — format it for display, never alter the stored value.

**Never:**
- Do not add server-side/query-param filtering, sorting persistence, or URL state — this is local component state only.
- Do not touch the Settings dialog, environment switching, or anything already shipped in `spec-settings-dialog.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Search Software table | Product Owner types into the Software search box | Rows are filtered to items whose name, category, or description contains the query (case-insensitive) | Empty result shows a "no matches" placeholder distinct from the "no data at all" placeholder |
| Search + filter Sets table | Product Owner types a query and/or picks a release-state filter | Rows are filtered by both; remaining rows stay grouped by category | Empty result shows a "no matches for these filters" placeholder |
| Sets grouped by category | Sets table has items across multiple categories | Each category renders as its own collapsible, open-by-default group with a visible item count, groups sorted alphabetically, items within a group sorted by name | A set with no/empty category groups under an empty-string category, not dropped |
| Sets "Datum" column | A set's `updated_on` is a valid ISO date | Column shows the date formatted for a German audience (`de-DE`) | An unparseable `updated_on` falls back to showing the raw string instead of "Invalid Date" |

</frozen-after-approval>

## Code Map

- `frontend/src/SoftwareOverview.tsx` -- currently the Story 1.4 baseline (flat, unfiltered Software/Sets tables) plus Story `spec-settings-dialog.md`'s `activeEnvironment` prop/refetch — keep that prop/refetch as-is. Split the two `<table>` blocks into a `SoftwareTable` component (search input + `matchesQuery` filter over name/category/description) and a `SoftwareSetsSection` component (search input + a release-state `<select>` filter, both applied before grouping by category into `<details>` elements). Add a `formatDate(iso: string)` helper (parse with `new Date`, `toLocaleDateString('de-DE')`, fall back to the raw string on an invalid date) for the new "Datum" column.
- `frontend/src/SoftwareOverview.test.tsx` -- currently the Story 1.4 baseline coverage (not-configured hint, populated tables, empty placeholders, http-error/timeout/network-error banners, refetch-on-environment-change). Add coverage for: Software search filtering, Sets search + state filtering combined, category grouping/counts, and the Datum column's formatting (including an invalid-date fallback).
- `frontend/src/index.css` -- add `.filter-bar`, `.filter-input`, `input[type='search'].filter-input`, `.category-groups`, `.category-group`, `.category-group summary`, `.category-group[open] summary`, `.category-count`, reusing the existing `--border`/`--text-muted`/`--text-h`/`--accent`/`--accent-bg` tokens (no hardcoded colors, matching Story 1.4's convention).
- `src/adapters/equipmentcloud/equipmentcloud-port.ts` -- add `updatedOn: string` to `SoftwareSetItem`.
- `src/adapters/equipmentcloud/equipmentcloud-client.ts` -- add `updated_on: string` to `RawSoftwareSetItem` (leave `RawSoftwareListItem`/`RawSoftwareDetailItem`/`category` nullability untouched); map it to `updatedOn: set.updated_on` in `listSets()` alongside the existing `category: set.category ?? ''`.
- `src/adapters/equipmentcloud/equipmentcloud-client.test.ts` -- add `updated_on` to the existing `listSets()` fixtures and assert `updatedOn` passes through.
- `src/api/app.test.ts` -- the `GET /api/software` sets fixture needs `updated_on` in the mocked `sharedsets` response and `updatedOn` in the expected output (the route passes `client.listSets()`'s items through verbatim, no route code change needed).

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/equipmentcloud/equipmentcloud-port.ts` -- add `updatedOn: string` to `SoftwareSetItem` -- carries the new field through the port contract
- [x] `src/adapters/equipmentcloud/equipmentcloud-client.ts` -- add `updated_on` to `RawSoftwareSetItem` and map it to `updatedOn` in `listSets()` -- sources the field from the live API
- [x] `src/adapters/equipmentcloud/equipmentcloud-client.test.ts`, `src/api/app.test.ts` -- extend existing sets fixtures/assertions with `updated_on`/`updatedOn` -- covers the new field end to end
- [x] `frontend/src/SoftwareOverview.tsx` -- add `SoftwareTable` (search) and `SoftwareSetsSection` (search + state filter + category grouping + Datum column) components -- delivers the feature
- [x] `frontend/src/index.css` -- add the filter-bar/category-group styles -- styles the new controls
- [x] `frontend/src/SoftwareOverview.test.tsx` -- add tests for the I/O & Edge-Case Matrix rows above -- verifies the new behavior
- [x] Root and frontend test/build suites -- run after the above -- confirm nothing broke

**Acceptance Criteria:**
- Given the Software table has items in multiple categories, when the Product Owner types part of an item's description into the search box, then only matching rows remain visible.
- Given the Sets table has items across several categories and release states, when the Product Owner searches and picks a state filter, then only sets matching both remain, still grouped by category with accurate per-group counts.
- Given a set's `updated_on` from EquipmentCloud, when the Sets table renders, then its "Datum" column shows a `de-DE`-formatted date.

## Implementation Notes

- `SoftwareTable` and `SoftwareSetsSection` are internal (non-exported) components in `SoftwareOverview.tsx`, each owning their own `query`/`stateFilter` local state via `useState` — no lifting to the parent, no URL/persisted state, per the "Never" boundary.
- Kept the Sets table's existing "Kategorie" column per row in addition to the new category grouping — the spec's Code Map only calls for adding the Datum column and grouping via `<details>`, not for removing the existing column, so the per-row category was left in place as the more conservative reading.
- Uncategorized sets (`category === ''`) group under a literal empty-string key so they sort first alphabetically, ahead of any named category; the group's `<summary>` shows "Ohne Kategorie" as a readable label for that empty-string group instead of a blank heading.
- `formatDate` falls back to the raw `updatedOn` string (not "Invalid Date") when `new Date(iso)` yields `NaN` via `Number.isNaN(date.getTime())`.
- Fixed one pre-existing test collision: `SoftwareOverview.test.tsx`'s "renders the software and sets tables with live data" test asserted `screen.getByText('Released')`, which became ambiguous once the Sets state filter `<select>` also renders a "Released" `<option>`; changed to `screen.getByRole('cell', { name: 'Released' })` to scope it to the table cell.

## Spec Change Log

## Review Triage Log

- `medium` — `RawSoftwareSetItem.updated_on` (`src/adapters/equipmentcloud/equipmentcloud-client.ts`) is typed as a plain non-nullable `string` and mapped straight through (`updatedOn: set.updated_on`), unlike the adjacent `category` field on the same type, which is explicitly `string | null | undefined` with a comment noting the live API omits/nulls it for that field — verified by reading the type and mapping. Given this exact API has already been confirmed (via `equipmentcloud-client.ts`'s own `category` handling and a recorded project fact) to omit/null documented-as-always-present fields, it's plausible `updated_on` can too; a missing value would silently render a blank "Datum" cell instead of surfacing anything. Route: patch — widen the type and coalesce with `?? ''`, mirroring `category`'s exact pattern, plus a regression test for a missing/null `updated_on`.
- `low` — None of the three `localeCompare` calls in `frontend/src/SoftwareOverview.tsx` (`groupSetsByCategory`'s category sort, its within-group name sort, and `SoftwareSetsSection`'s state-filter-label sort) pass a locale, while `formatDate` in the same file explicitly uses `'de-DE'` — verified by reading all three call sites. Inconsistent, could sort German labels with umlauts differently depending on the runtime's default locale. Route: patch — add `'de-DE'` to all three.
- `low` — `groupSetsByCategory` groups by the raw `item.category` string with no trimming; given the same API has already shown documented fields don't always match reality, stray whitespace around a category value would silently create a duplicate, visually-identical group instead of merging into the existing one — verified by reading `groupSetsByCategory`'s `Map` key. Route: patch — trim the grouping key.
- `patch` (pre-verified by verification-gap layer) — the Sets search's category-match branch (`matchesSetQuery`'s `item.category.toLowerCase().includes(...)`) has no test that isolates it from the name-match branch; every existing Sets-search test's expected result is already fully decided by name matching, so a regression that broke or removed category matching in Sets search would ship undetected. Route: patch — add a test searching by a category-only query.
- `false` — Claimed gap: no test for resetting the Sets state filter back to "Alle Status" after narrowing it. Refuted: the empty-string branch (`stateFilter === ''`) is the initial/default state already exercised by "renders the software and sets tables with live data" and "groups sets by category..." (multiple states/categories visible with no filter applied) — resetting re-enters the exact same code path those tests already cover, there is no distinct "reset" logic.
- `false` — Claimed gap: two sets sharing the same `state` could show inconsistent `stateLabel`s in the filter dropdown (first-seen wins in the `Map`). Refuted: `stateLabel` is computed once per set from a single shared `labelByState` lookup in `equipmentcloud-client.ts`'s `listSets()` (`labelByState.get(set.state) ?? set.state`) — all sets with the same `state` are guaranteed the same `stateLabel` within one response, so the described divergence cannot occur.
- `defer` — No way to sort the Sets table by the new "Datum" column (only sorted by name within each category group) — a reasonable enhancement, but not requested by this spec's Intent or Acceptance Criteria; the deferred-work item this story implements only asked for the column to exist, not for sortability.
- `defer` — Deeper accessibility wiring is missing: `<summary>` elements aren't associated with their tables via `aria-labelledby`, and neither the match counts nor the "no matches" messages sit in an `aria-live` region, so a screen-reader user isn't told when a search/filter changes the result count. All interactive controls do already have `aria-label`s. No accessibility requirement is recorded for this internal single-user tool; worth a future pass if that changes.

## Verification

**Commands:**
- `npm test` -- expect all backend tests green, including the extended `updated_on`/`updatedOn` coverage
- `npm run build` -- clean, no type errors
- `cd frontend && npm test` -- frontend suite green, including new search/filter/grouping/date tests
- `cd frontend && npm run build` -- clean, no type errors
