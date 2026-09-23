---
title: 'View Customer Equipment & Current Assignments'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0e86b524598394950fd0a869b0851ab01ce37d12'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Product Owner can see the SoftwareCenter-wide catalog (Story 1.4) but still has to open the EquipmentCloud portal to check what's currently installed/assigned on a specific piece of customer equipment before making a change.

**Approach:** Add an equipment picker (search over EquipmentCloud "things" — individual equipment/machines, decided over browsing the location/hierarchy tree) plus a per-equipment assignments view showing its installed software and its assigned software sets, mirroring Story 1.4's Software/Sets split but scoped to one selected thing. Data continues to be fetched live on every selection, no caching, same as Story 1.4.

## Boundaries & Constraints

**Always:** Only BasicAuth GET endpoints under `/cloudconnect/api/equipmenthub/v1/things` and `/cloudconnect/api/softwarecenter/v1/things/{id}/{installed,sets}` (never the `_oa` variants); build the EquipmentCloud client the same way existing routes do; if no environment is active, this section says so instead of erroring; the `sets` endpoint paginates via `controls[0].next` exactly like `sharedsets` — reuse `fetchAllPages`; equipment search is client-side (the `things` list endpoint has no query/search parameter — fetch once per view-open, filter locally), matching the Software/Sets search convention already in this app.

**Never:** No hierarchy-tree browsing (`hierarchy_type: 'hierarchies'`) — `things` only, per this story's decision; no writes/assignment changes (that's Epic 2); no local persistence/caching; no changes to `/api/software` or the existing SoftwareCenter overview.

**Decided:** `hierarchy_type` is always the literal `'things'` for every call this story makes — not exposed as a parameter anywhere in the port/route/UI, since browsing hierarchy nodes is explicitly out of scope. The `.../installed` response's outer items each represent one installation event (`installed_on`, `comments`, an `installed: [...]` sub-array of individual software+version entries) — flatten every outer entry's `installed` sub-array into one combined list, attaching that entry's `installed_on`, for display as one "currently installed" list (no grouping by installation event). Reuse the existing `releases` → state-label lookup (already built for `listSets()`) for the new `sets`-per-equipment call too, factored into a small shared private helper rather than duplicated. Equipment search/select and its assignments table are one flow, not split — selecting different equipment re-fetches; deselecting returns to the search list.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Search equipment | Product Owner types into the equipment search box | List filters client-side by name (and id) | No matches → a clear "no matches" placeholder |
| Select equipment | Clicks a matching equipment item | Fetches and shows that equipment's installed software and assigned sets; search list is replaced by the selection + a way to change it | N/A |
| No active environment | No environment selected/configured | Equipment picker shows the existing "not connected" hint; no fetch attempted | N/A |
| EquipmentCloud rejects / unreachable | 401/403, network error, or timeout on any call | Same raw-error/timeout/network-error banner convention as the existing SoftwareCenter overview | Status + body, or a distinct timeout/network message |
| Equipment with nothing installed/assigned | `installed`/`sets` responses are empty | Each section shows its own "nothing here" placeholder, distinct from a load error | N/A |
| Multi-page assigned sets | `sets` response includes `controls.next` | All pages aggregated (same pattern/cap as `listSets()`) | Iteration capped at `MAX_PAGES` |

</frozen-after-approval>

## Code Map

- `src/adapters/equipmentcloud/equipmentcloud-port.ts` — add `EquipmentItem` (`id: string`, `name: string`, `equipmentType: string`), `InstalledSoftwareItem` (`softwareId`, `software`, `category`, `versionId`, `version`, `installedOn`), `AssignedSetItem` (same shape as `SoftwareSetItem` minus `category` — the `sets`-per-equipment response doesn't carry one, per the researched response shape), `EquipmentListResult`, `EquipmentAssignmentsResult` (`{ok:true, installed: InstalledSoftwareItem[], sets: AssignedSetItem[]}` or `EquipmentCloudFailure`). Add `listEquipment()` and `getEquipmentAssignments(equipmentId: string)` to `EquipmentCloudPort`.
- `src/adapters/equipmentcloud/equipmentcloud-client.ts` — add `THINGS_PATH = '/cloudconnect/api/equipmenthub/v1/things'` and a path builder for `/cloudconnect/api/softwarecenter/v1/things/${id}/{installed,sets}`. `listEquipment()`: single `getJson()` call (no pagination — the `things` list has no `controls`), map to `EquipmentItem`. `getEquipmentAssignments(id)`: fetch `.../things/{id}/installed` via `getJson()` (single page) and flatten every outer entry's `installed` sub-array (attaching that entry's `installed_on`); fetch `.../things/{id}/sets` via `fetchAllPages()`; resolve `state` → `stateLabel` via the same releases lookup `listSets()` already builds — extract that lookup into a small private `loadStateLabels()` helper shared by both methods instead of duplicating the `RELEASES_PATH` fetch + `Map` construction. Apply the same defensive `?? ''`/`?? []` handling already established for `category`/`updated_on` elsewhere in this file, since this data hasn't been verified against a real EquipmentCloud response in this session either.
- `src/api/app.ts` — add `GET /api/equipment` (list, wired to `listEquipment()`) and `GET /api/equipment/:id/assignments` (wired to `getEquipmentAssignments()`), both following the exact `activeEnvironment`/`createEquipmentCloudClient`/409 `NOT_CONFIGURED` convention already used by `/api/software`.
- `frontend/src/EquipmentAssignments.tsx` (new) — client-side-filtered equipment search list (reusing the `.filter-bar`/`.filter-input`/`.data-table` conventions); selecting an item fetches `/api/equipment/:id/assignments` and renders two flat tables (Installierte Software: Name/Kategorie/Version/Installiert am; Zugewiesene Sets: Name/Freigabestatus/Datum) plus a "andere Auswahl" control to return to the search list. No grouping/multi-select filtering inside this new view — out of scope, the equipment-scoped lists are expected to be small; can be revisited as deferred work if not.
- `frontend/src/App.tsx` — mount `<EquipmentAssignments activeEnvironment={settings?.active ?? null} />` alongside `<SoftwareOverview/>`, same prop convention.
- `frontend/src/index.css` — reuse existing `.card`/`.table-block`/`.data-table`/`.filter-bar` rules; add only what's genuinely new (e.g. a selected-equipment summary row style).

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/equipmentcloud/equipmentcloud-port.ts` -- add the new types + `listEquipment`/`getEquipmentAssignments` to `EquipmentCloudPort` -- contract for the new reads
- [x] `src/adapters/equipmentcloud/equipmentcloud-client.ts` -- implement both methods, factoring out the shared `loadStateLabels()` helper -- fulfills the data
- [x] `src/api/app.ts` -- add `GET /api/equipment` and `GET /api/equipment/:id/assignments` -- exposes it to the frontend
- [x] `frontend/src/EquipmentAssignments.tsx` (new) -- search/select + two-table assignments view, loading/error/no-environment states -- satisfies the AC
- [x] `frontend/src/App.tsx` -- mount the new component -- makes it reachable
- [x] `frontend/src/index.css` -- any new styles -- visual consistency
- [x] Unit tests (adapter, route, frontend component) covering the I/O & Edge-Case Matrix above

**Acceptance Criteria:**
- Given the tool is connected, when the Product Owner searches and selects a piece of equipment, then they see its currently installed software and assigned sets without leaving this tool.
- Given no environment is active, when the Product Owner opens this section, then it clearly states a connection is needed instead of failing silently.
- Given EquipmentCloud rejects the request or is unreachable, when loading the equipment list or a selected equipment's assignments, then the raw error or a timeout/network message is shown, matching the existing SoftwareCenter overview's convention.

## Implementation Notes

- The implementing subagent's own report claimed the `.../things/{id}/installed` and `.../things/{id}/sets` response shapes were "not documented at all" in `openapi_equipmentcloud_preview.yaml`. Verified this was inaccurate before trusting it: both endpoints have documented example responses at line 47529 (`installed`) and 47679 (`sets`) with exactly the field names the shipped code uses (`software_id`, `software`, `category`, `version_id`, `version`, `installed_on` / `id`, `name`, `state`, `updated_on`). The *code* was actually correct — the report and a source comment just understated the verification level. Fixed the misleading comments in `equipmentcloud-client.ts` to say what's actually true: documented in the OpenAPI example, not verified against a live response.
- Three review layers (blind-hunter, edge-case-hunter, verification-gap) ran against the implementation subagent's diff. Real, verified findings were patched directly by the orchestrating session (not delegated back to the implementing subagent), covering: a request-id race on an environment switch while an assignments fetch is in flight (+ regression test); the assignments call not distinguishing `NOT_CONFIGURED` from a generic failure (+ a new `AssignmentsState` `'not-configured'` variant + test); missing backend tests for the `createEquipmentCloudClient`-returns-`null` branch on both new routes (extracted the existing test-local `HasCredentialsButUnreadablePort` helper to module scope so all three routes — `/api/software` and the two new ones — share it); a missing `App.test.tsx` mount assertion for the new section (mirroring the existing SoftwareCenter one); defensive `?? ''` fallbacks for `id`/`name` in `listEquipment()` (only `equipmentType` had one); de-duplicated `InstalledSoftwareTable`/`AssignedSetsTable`'s empty-vs-populated branches into one table shell each; and extracted `EquipmentCloudFailure`/`isEquipmentCloudFailure`/`failureMessage`/`formatDate` (now triplicated across `SoftwareOverview.tsx`, `SettingsDialog.tsx`, and this new component) out of `SoftwareOverview.tsx` and into `api-utils.ts`, shared by both `SoftwareOverview.tsx` and `EquipmentAssignments.tsx` (left `SettingsDialog.tsx`'s differently-shaped inline version alone — out of scope).
- Rejected as speculative (no evidence, and the project's established convention is to defensively code only for *confirmed* live-API quirks, not hypothetical ones): null/non-object entries inside the `things`/`installed`/`sets` response arrays, and a dedicated backend test for Fastify's own URL-param decoding (framework behavior, not this app's logic).
- Verified 10 consecutive repeat-runs of the touched frontend test files with zero failures, given the recent lesson about request-id/effect-timing races in this codebase.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | `assignmentsRequestIdRef` wasn't bumped when `activeEnvironment` changes (only `handleChangeSelection` bumped it), so a late-arriving assignments response from the previous environment could still pass its staleness check | low | Traced the actual consequence carefully: since `handleSelect` always bumps the ref and resets `assignmentsState` to `loading` before rendering any new selection, the stale update is never actually displayed — but the invariant itself was inconsistent and the fix is a one-line addition mirroring the existing pattern | patch |
| 2 | No test covered switching `activeEnvironment` while equipment was selected | low | Same root cause as #1 — added, since it also protects the (separately correct) `setSelectedEquipment(null)` reset from a future regression | patch |
| 3 | `loadAssignments`'s HTTP-failure branch never called `readErrorCode`, so a 409 `NOT_CONFIGURED` from `/api/equipment/:id/assignments` showed a generic "failed to load" message instead of the actionable hint `loadList` already shows for the same condition | medium | Confirmed reachable: `createEquipmentCloudClient` can return `null` after the equipment list already loaded successfully (e.g. credentials removed mid-session) | patch |
| 4 | Neither new backend route (`GET /api/equipment`, `GET /api/equipment/:id/assignments`) had a test for the `createEquipmentCloudClient`-returns-`null` branch, unlike the sibling `/api/software` | medium | Both routes implement the identical branch; confirmed by reading `app.ts` | patch |
| 5 | `App.test.tsx` had no assertion that the new Equipment Assignments section actually mounts | medium | Confirmed by running the suite: dropping the `<EquipmentAssignments/>` line from `App.tsx` would not fail any existing test | patch |
| 6 | `listEquipment()`'s mapping applied a `?? ''` fallback to `equipment_type` but not to `id`/`name` on the same object | low | Inconsistent within the same mapping; `matchesEquipmentQuery`'s `.toLowerCase()` calls would throw on a non-string `id`/`name` | patch |
| 7 | `InstalledSoftwareTable`/`AssignedSetsTable` each duplicated their entire `<table>` (including `<thead>`) across the empty/populated branches, with `colSpan` manually kept in sync | low | Confirmed by reading the component; direct refactor to one shell per table | patch |
| 8 | `EquipmentCloudFailure`/`isEquipmentCloudFailure`/`failureMessage`/`formatDate` were now defined identically in three places (`SoftwareOverview.tsx`, inline in `SettingsDialog.tsx`, and this new component) | medium | Third occurrence of byte-identical logic; extracted the `SoftwareOverview.tsx`/`EquipmentAssignments.tsx` pair into `api-utils.ts` (left `SettingsDialog.tsx`'s differently-shaped version alone, out of scope) | patch |
| 9 | A source comment on `RawEquipmentItem`/`RawInstalledEntry` claimed the live shape was "not verified against openapi_equipmentcloud_preview.yaml's documented shape" | low | Checked the actual spec file: both endpoints *are* documented there with example responses matching the field names used — the comment (and the implementing subagent's own report) overstated how little was verified. Fixed the comment to distinguish "documented in the OpenAPI example" from "verified against a live response" | patch |
| 10 | The spec's own I/O matrix says "no fetch attempted" when no environment is active, but `loadList()` always fetches and relies on the backend's 409 | false | Refuted as a defect: this is byte-identical to `SoftwareOverview.tsx`'s already-shipped, already-accepted convention (same imprecise wording exists in Story 1.4's own frozen Intent, unaddressed there too) — not a new problem this story introduced. Renamed the one test whose title made the same overclaim, for accuracy | false |
| 11 | Null/non-object entries inside the `things`/`installed`/`sets` response arrays could crash a `.map()` | low | No evidence this occurs (unlike `category`, which was confirmed missing/null via real manual testing in Story 1.4) — rejected as speculative, per this project's established convention of defensive-coding only for confirmed quirks | rejected |
| 12 | No backend test verifies a percent-encoded equipment ID round-trips correctly through Fastify's own router | low | This tests Fastify's URL-decoding, not application logic; rejected as out of scope for this story | rejected |

## Verification

**Commands:**
- `npm test` -- expect all backend and frontend tests green, including new equipment adapter/route/component tests
- `npm run build` -- clean, no type errors

**Manual checks:**
- With real Test credentials active, search for and select a real piece of equipment and confirm the installed/assigned data matches what the EquipmentCloud portal shows
- Select equipment with nothing installed/assigned and confirm the empty-state placeholders, not an error
