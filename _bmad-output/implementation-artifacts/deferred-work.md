- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-1-project-scaffold.md`
  summary: Add an SPA/wildcard fallback (serve `index.html` on 404) to the Fastify static-file registration in `src/api/server.ts`.
  evidence: Story 1.1 only needs to serve one static landing page, so no fallback is needed yet. Stories 1.4/1.5 add real UI views; once the frontend has client-side routes, a deep link or browser refresh on a non-root path will 404 without this.
- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-1-project-scaffold.md`
  summary: Add a root-level `npm run lint` covering backend `src/` code (frontend already has `oxlint` wired via `frontend/package.json`).
  evidence: Story 1.1's AC only covers the start command and landing page, not lint tooling; AGENTS.md already tracks this as an open TODO. Backend TypeScript has zero lint coverage today.

## Deferred from: code review of spec-1-1-project-scaffold.md (2026-09-17)

- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-1-project-scaffold.md`
  summary: Add a CI pipeline (e.g. GitHub Actions) that runs `npm test` and `npm run build` on push.
  evidence: No `.github/` workflows exist. Pre-existing gap — this review's own diff is what first created a test suite worth running in CI. Choosing a CI platform/workflow shape is a bigger infra decision than this story's scope.
- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-1-project-scaffold.md`
  summary: Add an SPA/wildcard fallback (serve `index.html` on 404) to the Fastify static-file registration.
  evidence: Re-confirmed by this review's Edge Case Hunter layer. Same gap already logged above from the earlier oneshot review — not a new item, just corroborated.
- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-1-project-scaffold.md`
  summary: Fix spec-1-1-project-scaffold.md's Implementation Notes — it says the `frontend/dist` build-output coupling comment lives in `src/api/server.ts`; it's actually in `src/api/app.ts` (moved there when `server.ts` was split into `app.ts` + a thin entry point).
  evidence: Confirmed by reading both files. Real inaccuracy, but the fix means editing the spec document itself, which this review's triage rules route to deferred rather than patching directly.

## Deferred from: user manual testing of spec-1-2-store-equipmentcloud-credentials-securely-select-environment.md (2026-09-17)

- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-2-store-equipmentcloud-credentials-securely-select-environment.md`
  summary: Introduce real app navigation (the settings screen should be one screen among several, not the entire app) once a second screen is needed.
  evidence: User feedback after manual testing — expected the settings screen to be a distinct dialog/screen, not the app's sole view. Accepted as fine for Story 1.2 (no navigation system existed to build on), but should be addressed properly starting with the first story that adds a second screen (at latest Story 1.4, SoftwareCenter overview).

## Deferred from: code review of spec-1-3-verify-the-equipmentcloud-connection.md (2026-09-18)

- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-3-verify-the-equipmentcloud-connection.md`
  summary: Distinguish a locked/inaccessible Windows credential store from a genuinely unconfigured environment in `KeyringCredentialsAdapter`, so `/api/settings/test-connection` (and other routes built on `readStored`) don't tell the Product Owner an environment "is not configured" when it actually is, just momentarily inaccessible.
  evidence: Confirmed by reading `keyring-credentials-adapter.ts` — `readStored`'s try/catch (introduced in Story 1.2) treats any read failure the same as "no entry found." Pre-existing behavior from Story 1.2, unchanged by this diff, just newly reachable (and more visibly misleading) through the new connection-test route.

## Deferred from: bmad-build multi-goal split (2026-09-21)

- source_spec: none
  summary: Add search/filter and category-grouping to the Software & Sets overview tables, plus a "Datum" (`updated_on`) column for Sets.
  evidence: Found already implemented (uncommitted) in `SoftwareOverview.tsx` alongside the Settings-dialog extraction. It touches a different area (the overview tables, not settings/environment switching) and is independently shippable, so it was split out — the current intent was narrowed to the Settings dialog goal only.

## Deferred from: code review of spec-settings-dialog.md (2026-09-21)

- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-settings-dialog.md`
  summary: Add `.claude/settings.local.json` (or a broader `.claude/*.local.json` pattern) to `.gitignore` — it's a per-machine Claude Code plugin setting, not project content.
  evidence: Confirmed it was already an untracked file (`?? .claude/`) in the repo's `git status` before this story's work began; this review's own diff-staging step (`git add -N .`) is what first surfaced it as "new" in a diff. Pre-existing repo-hygiene gap, not caused by this story.

## Deferred from: code review of spec-software-overview-search-filter.md (2026-09-22)

- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-software-overview-search-filter.md`
  summary: Make the Sets table sortable by the new "Datum" column (currently only sorted by name within each category group).
  evidence: Flagged during review as a reasonable enhancement now that the column exists, but the deferred-work item this story implements only asked for the column to be added, not for sortability — not part of this spec's Intent or Acceptance Criteria.
- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-software-overview-search-filter.md`
  summary: Wire deeper accessibility for the new Software/Sets overview controls — associate each category group's `<summary>` with its table via `aria-labelledby`, and put match counts / "no matches" messages in an `aria-live` region so a screen-reader user is told when search/filter results change.
  evidence: All interactive controls already have `aria-label`s; this is a refinement beyond that baseline. No accessibility requirement is recorded for this internal single-user tool — worth a future pass if that changes.

## Deferred from: bmad-build multi-goal split (2026-09-22)

- source_spec: none
  summary: Restructure the Software table like Sets — group by category (collapsed by default, count of filter-matched items per category), click a category to see its software list without a Versions column, click an individual item to open a full-width detail panel with its description and version list. Whether/when to lazy-load the version list on that click is explicitly undecided by the Product Owner yet.
  evidence: Independently shippable from the layout split and the Sets filter rework — different component structure (grouping + a new detail/drill-down view) and an open design question (lazy-loading) the Product Owner isn't ready to settle. Split out so the layout change (chosen first) isn't blocked on it.
- source_spec: none
  summary: Replace the Sets table's single-select release-state `<select>` with a multi-select chip control (OR logic): picking a status from a list adds it as a removable chip (×), and default the category groups to collapsed on load.
  evidence: Independently shippable — touches only `SoftwareSetsSection`'s filter control and default `<details>` state, unrelated to the layout split or the Software table restructuring.

## Deferred from: bmad-build token-budget split of spec-software-category-tree.md (2026-09-22)

- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-software-category-tree.md`
  summary: Replace the Sets table's single-select release-state `<select>` with a multi-select chip control (OR logic): picking a status from a dropdown adds it as a removable chip (×), removable individually.
  evidence: The user initially chose to keep this together with the Software category-tree work in one spec, but once the combined spec measured ~2000-2400 tokens (target 900-1600) they chose to split after all. Independently shippable — touches only `SoftwareSetsSection`'s filter control; the Sets-groups-default-collapsed part of the earlier deferred item above is absorbed into `spec-software-category-tree.md` instead, alongside the Software tree's own default-collapsed requirement.

## Deferred from: code review of spec-sets-multiselect-status-filter.md (2026-09-22)

- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-sets-multiselect-status-filter.md`
  summary: `frontend/src/SoftwareOverview.test.tsx` is intermittently flaky — running it repeatedly fails a different test roughly 25-40% of the time, always with a `fireEvent`-then-assert-not-found pattern (e.g. `getByText`/`getByRole` not finding content that a preceding interaction should have produced). Needs a dedicated investigation into React/jsdom act() or microtask timing (no `act()` warnings were observed, which is itself a clue), or a jsdom `<select>`-with-dynamically-changing-`<option>`-list quirk.
  evidence: Confirmed pre-existing and not caused by this story: `git stash`-ed this spec's changes back to the prior committed state (`942f264`, before the Sets multi-select filter) and still saw a ~25% failure rate across repeated runs of the same file, with the same symptom pattern. Re-applying this story's changes did not clearly change the base rate (still intermittent, different test fails each time, including both pre-existing and newly-added tests). `npm test` passed cleanly in the verification run for this spec, but CI would need to tolerate or fix this before it can be trusted as a real gate (no CI pipeline exists yet per an earlier deferred entry).
- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-sets-multiselect-status-filter.md`
  summary: Manage focus when a status filter chip is removed (its "×" button is unmounted along with the chip) — e.g. move focus to the "Freigabestatus hinzufügen" select or a remaining chip, instead of letting it fall back to `<body>`.
  evidence: Real for keyboard/screen-reader users, but no established focus-management convention exists elsewhere in `frontend/src` to extend, and the fix requires deciding a sensible focus target, not a direct correction. No accessibility requirement is recorded for this internal single-user tool.
- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-sets-multiselect-status-filter.md`
  summary: `.chip-remove:hover`'s white text on the `--accent` background fails WCAG AA contrast in dark mode (~2.54:1, needs 4.5:1) — but this mirrors `.button--primary`'s identical, already-shipped white-on-accent dark-mode styling, so it's not unique to this new control.
  evidence: Verified via relative-luminance contrast calculation. Fixing `.chip-remove` in isolation while leaving `.button--primary` (and any other white-on-accent control) with the same issue would be inconsistent — this should be a single dark-mode contrast pass across all affected controls, not a one-off patch.
- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-sets-multiselect-status-filter.md`
  summary: A Sets item whose `state` is the empty string (`""`) could never be added as a status chip — the "add" `<select>`'s placeholder option also uses `value=""`, so `onChange` treats picking that state the same as picking nothing.
  evidence: Pre-existing from the original single-select (`stateFilter === ''` was already reserved for "Alle Status" before this diff), not newly introduced. No evidence any real EquipmentCloud `state` value is actually empty (unlike `category`, which is confirmed to arrive null/absent) — worth a proper fix (e.g. a wrapper/sentinel distinct from any real state value) if that's ever observed in practice.
