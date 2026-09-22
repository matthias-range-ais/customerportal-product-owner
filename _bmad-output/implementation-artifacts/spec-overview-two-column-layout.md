---
title: 'SoftwareCenter Overview: Responsive Two-Column Layout'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The whole app is capped at `.page { max-width: 640px; }` (`frontend/src/index.css`), so on any normal desktop window the Software and Sets tables in `SoftwareOverview.tsx` stack in a narrow column with lots of unused horizontal space, even though there's plenty of room to show both side by side. This was split out of a larger usability request (2026-09-22 multi-goal split) as the first, lowest-risk piece; the Software-table restructuring and the Sets multi-select filter are deferred separately in `deferred-work.md`.

**Approach:** Widen `.page`'s `max-width` (to roughly 1200px, still centered) so there's room for two columns. In `SoftwareOverview.tsx`, wrap the `<SoftwareTable/>` and `<SoftwareSetsSection/>` elements (currently direct children of the `.card.software-overview` section) in a new `<div className="overview-tables">`. Style `.overview-tables` in `index.css` as a flex column (stacked, current behavior) by default, switching to a flex row via `@media (min-width: 960px)` so the two tables sit left/right once there's enough width. Give each `.table-block` child `min-width: 0` at that breakpoint so the existing `.table-scroll { overflow-x: auto }` can still kick in per-table if a table's own content is wider than its half — without it, a flex item's default `min-width: auto` would push the container wider instead of scrolling internally. Use flexbox (not grid), matching the layout approach used everywhere else in this file. No JSX/behavior change inside `SoftwareTable`/`SoftwareSetsSection` themselves — this is a pure layout/CSS change.

</frozen-after-approval>

## Implementation Notes

- `.overview-tables > .table-block` uses an even `flex: 1 1 0` split (both tables get equal width). Deliberate simple default, not tuned per-table content — Software's "Beschreibung" column is longer-text than any Sets column, but the pre-existing `.table-scroll { overflow-x: auto }` already handles a table needing more room than its half by scrolling internally, so an uneven split wasn't necessary to avoid breakage. Revisit if it looks unbalanced in practice.
- The `960px` breakpoint for switching `.overview-tables` to a row was picked as a common "small-laptop-and-up" cutoff, not derived from the tables' actual content width — there's no hard requirement pinning it to a specific value.
- Review (Blind Hunter) caught that widening `.page` to 1200px also widened `.page-header` and `.banner`, which left an awkward gap in the header's `justify-content: space-between` row and overly long banner text lines. Fixed by capping `.page-header` and `.banner` at `max-width: 640px` independently of `.page` — only the overview's two-column area uses the new width.
- Added a regression test (`SoftwareOverview.test.tsx`) asserting the `.overview-tables` wrapper exists and contains both `.table-block` elements as direct children, since the existing content-based tests wouldn't have caught the wrapper being accidentally removed.
- Not verified: an actual browser render at various widths (960–1200px+) with real EquipmentCloud data — no live credentials available in this session. Confirmed instead via `npm run build` + inspecting the built CSS output for the expected rules, and via the automated test suite. The Product Owner should eyeball the layout (window resize around 960px) before relying on it.

## Review Triage Log

- `medium` — Widening `.page` to 1200px also widened `.page-header` and `.banner`, leaving an awkward gap in the header row's `justify-content: space-between` and overly long banner text lines — verified by reading `.page-header-row`'s CSS and the banner usages. Fixed: capped `.page-header` and `.banner` at `max-width: 640px`, independent of `.page`.
- `low` — No test covered the new `.overview-tables` wrapper; every existing assertion is content-based and would pass unchanged even if the wrapper were accidentally reverted to a bare Fragment — verified by reading the existing test file. Fixed: added a test asserting `.overview-tables` exists and contains both `.table-block` elements as direct children.
- `low` — The even `flex: 1 1 0` split and the `960px` breakpoint were undecided/undocumented choices, and `## Implementation Notes` was left empty. Not a functional defect (the existing `.table-scroll` overflow handling covers an uneven-content table regardless of split ratio), but the reasoning is now recorded in `## Implementation Notes` above.
- Not filed as a finding: no live-data browser verification at the target breakpoints — flagged as a limitation (no EquipmentCloud credentials in this session), not a code defect; noted above for the Product Owner to check manually.
