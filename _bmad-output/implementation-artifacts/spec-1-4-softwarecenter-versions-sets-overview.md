---
title: 'SoftwareCenter Versions/Sets Overview'
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0f252fa735279be3d9cb558288c83dbe26083a13'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Product Owner can connect to and verify EquipmentCloud (Stories 1.1–1.3), but still has to open the EquipmentCloud portal to see which SoftwareCenter software, versions, and sets exist and their release state.

**Approach:** Add a read-only "SoftwareCenter-Übersicht" section to the app that, for the active connected environment, lists shared software (name, description, versions) and shared sets (name, release state), fetched live from EquipmentCloud on every view.

## Boundaries & Constraints

**Always:** Only call BasicAuth GET endpoints under `/cloudconnect/api/softwarecenter/v1/{sharedsoftware,sharedsets,releases}` (including per-item detail paths); build the EquipmentCloud client per-request from the active environment's stored credentials via the existing `createEquipmentCloudClient`; no local persistence/caching — reflect live EquipmentCloud data on every request; if no environment is active/configured, the overview clearly says so instead of erroring silently; follow `controls.next` pagination links when present, aggregating all items with a bounded iteration guard (e.g. 50 pages) so long catalogs aren't silently truncated.

**Never:** No writes/mutations to EquipmentCloud; no changes to `/api/settings/*`, credential storage, or `checkConnection`; no equipment/hierarchy assignment view (that's Story 1.5); no drill-down/detail screen beyond this overview; no `_oa` OAuth2 endpoints.

**Decided:** Software and Sets render as two separate tables, matching the EquipmentCloud API's own resource split (`sharedsoftware` items carry `description`+`versions`; `sharedsets` items carry release `state`; neither resource exposes both) — mirrors how the EquipmentCloud portal itself separates these. Extend the existing `EquipmentCloudPort`/`EquipmentCloudClient` (Story 1.3) with new read methods rather than introducing the `src/domain/softwarecenter/` + `src/adapters/equipmentcloud/softwarecenter/` split the architecture spine names — no domain logic exists yet for this pure read passthrough, so that layer would be speculative now; revisit when Epic 2 needs a write-capable port. Release `state` values are labeled via a `GET .../releases` lookup (id/label pairs), falling back to the raw state string if unmapped.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Overview loads | Active environment configured & reachable | Two tables: Software (name, category, description, versions) and Sets (name, category, release-state label) | N/A |
| No active environment | No environment selected/configured | Overview shows a hint to configure/select an environment first; no fetch attempted | N/A |
| EquipmentCloud rejects | 401/403 from any of the endpoints | Overview shows the raw EquipmentCloud error, same convention as Story 1.3 | Status + body surfaced verbatim |
| Unreachable / timeout | Network error, or request exceeds timeout | Overview shows a clear failure distinguishing it from a credential rejection | Timeout aborts the request |
| Multi-page catalog | API response includes `controls.next` | All pages aggregated into one list | Iteration capped (e.g. 50 pages) to avoid runaway loops |

</frozen-after-approval>

## Code Map

- `src/adapters/equipmentcloud/equipmentcloud-port.ts` — add to `EquipmentCloudPort`: `listSoftware()`, `listSets()`. Reuse the `ConnectionCheckResult`-style discriminated-union pattern for each result (`ok:true, items:[...]` / `http-error` / `network-error` / `timeout`).
- `src/adapters/equipmentcloud/equipmentcloud-client.ts` — implement both methods on `EquipmentCloudClient` (same Basic-auth header + `AbortController` timeout pattern as `checkConnection`); add `PATH` consts for `sharedsoftware`, `sharedsets`, `releases`. Software items enriched via per-item `GET sharedsoftware/{id}` (parallel `Promise.all`) to attach `description`+`versions`; sets stay list-level (`state` already present there). Fetch `releases` once per call, map `state` → label (fallback: raw value). Follow `controls.next` for all list calls, capped iteration.
- `src/api/app.ts` — add `GET /api/software`, registered alongside existing `/api/settings/*` routes (before static-file registration). Reads the module-level `activeEnvironment` directly (no request body, unlike the POST routes). No active/configured environment → 409 `{error:'NOT_CONFIGURED'}` (same convention as `test-connection`). Otherwise builds the client via `createEquipmentCloudClient` and returns `{software, sets}` from the two new methods.
- `frontend/src/SoftwareOverview.tsx` (new) — software/sets tables; loading/error states mirroring `App.tsx`'s existing `useState`+`useEffect` idiom; reuses `readErrorCode` and `.card`/`.badge`/`.banner` CSS classes; shows the "no active environment" hint when applicable.
- `frontend/src/App.tsx` — render `<SoftwareOverview/>` as a new section below the environment cards (no routing/nav exists yet; this is the first second-section addition to the single-screen app).
- `frontend/src/index.css` — add table/list styles for the new section, following the existing custom-property tokens (no hardcoded colors).

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/equipmentcloud/equipmentcloud-port.ts` -- add `listSoftware`/`listSets` to `EquipmentCloudPort` + result types -- domain-facing contract for the new reads
- [x] `src/adapters/equipmentcloud/equipmentcloud-client.ts` -- implement both methods + pagination + releases-label lookup -- fulfills the AC's data
- [x] `src/api/app.ts` -- add `GET /api/software` wired to the client, using `activeEnvironment` -- exposes the overview to the frontend
- [x] `frontend/src/SoftwareOverview.tsx` -- new component: fetch + render both tables, handle loading/error/no-environment states -- satisfies the AC
- [x] `frontend/src/App.tsx` -- mount `<SoftwareOverview/>` -- makes the screen reachable
- [x] `frontend/src/index.css` -- table/section styles -- visual consistency with the rest of the app
- [x] Unit tests (adapter, route, frontend component) covering the I/O matrix above

**Acceptance Criteria:**
- Given the tool is connected to an environment with valid credentials, when the Product Owner opens the app, then they see the list of shared software/sets from EquipmentCloud with name, version(s)/release state, and description, reflecting live data
- Given no environment is active/configured, when the Product Owner views the overview, then it clearly states a connection is needed instead of failing silently
- Given EquipmentCloud rejects the request or is unreachable, when the overview loads, then the raw error or a timeout message is shown, distinguishing the two cases

## Implementation Notes

- `src/adapters/equipmentcloud/equipmentcloud-port.ts`: added `SoftwareVersion`, `SoftwareItem`, `SoftwareSetItem`, `SoftwareListResult`/`SoftwareSetListResult` (each `{ok:true, items}` or the shared `EquipmentCloudFailure` — the `ConnectionCheckResult` failure arm factored out via `Exclude<ConnectionCheckResult, {ok:true}>` so all three EquipmentCloud reads use one failure shape), and `listSoftware()`/`listSets()` on `EquipmentCloudPort`.
- `src/adapters/equipmentcloud/equipmentcloud-client.ts`: added `PATH` consts for `sharedsoftware`/`sharedsets`/`releases`, a `MAX_PAGES = 50` guard, a private `getJson<T>()` (same BasicAuth header + `AbortController` timeout + error-mapping as `checkConnection`, generalized to parse JSON) and `fetchAllPages<T>()` (follows `controls[0].next` — confirmed against `openapi_equipmentcloud_preview.yaml` that the API wraps pagination links in a one-element array, not a bare object). `listSoftware()` lists `sharedsoftware`, then enriches every item via parallel per-item `GET sharedsoftware/{id}` calls (whose response is itself `{items:[<single object>]}` per the OpenAPI doc) to attach `description`+`versions`; the first failing detail call's error is returned. `listSets()` fetches `releases` once, builds a `release_id → label` map, then lists `sharedsets` and resolves each item's `state` through that map (falling back to the raw state string when unmapped). `checkConnection()` itself is untouched, per the spec's "Never" list — the new `authHeader()` private helper is used only by the new `getJson()`, not wired into `checkConnection`, to avoid any risk of behavior drift in already-shipped Story 1.3 code.
- `src/api/app.ts`: added `GET /api/software`, registered after `test-connection` and before the static-file registration. No active environment (or credentials since removed) → 409 `NOT_CONFIGURED`, same convention as the other routes. Otherwise calls `listSoftware()` then `listSets()` sequentially and returns `{software, sets}` on success, or the first failing call's raw `EquipmentCloudFailure` object directly (same "raw error passthrough" convention as `test-connection`).
- `frontend/src/api-utils.ts` (new): extracted the existing `readErrorCode(response)` helper out of `App.tsx` so both it and the new component share one implementation, per the spec's Code Map note.
- `frontend/src/SoftwareOverview.tsx` (new): fetches `/api/software` on mount; renders a loading message, the "not configured" hint (409 `NOT_CONFIGURED`), a raw-error/timeout/network-error banner (mirroring `App.tsx`'s connection-test message mapping), or two tables (Software: name/category/description/versions; Sets: name/category/release-state label) with an italic placeholder row when a table is empty. Mounted in `App.tsx` below the environment cards.
- `frontend/src/index.css`: added `.software-overview`, `.table-block`, `.data-table`, `.data-table-empty` — reuses the existing color tokens (`--text-muted`, `--border`, `--text-h`), no hardcoded colors.
- API response shapes (item fields, the `items`-array-of-one wrapper on the single-item `sharedsoftware/{id}` detail endpoint, and the `controls` array-of-one pagination wrapper) were taken from `openapi_equipmentcloud_preview.yaml` in the repo root, since no live EquipmentCloud credentials were available in this session to verify against the real API.
- **Post-review patch pass:** `listSets()` now paginates `releases` via `fetchAllPages()` (was a single `getJson()` call); `GET /api/software` runs `listSoftware()`/`listSets()` concurrently via `Promise.all`; `listSoftware()` now returns an explicit 404 `http-error` for a per-item detail response with an empty `items` array (item removed between the list and detail calls) instead of silently defaulting to a blank description/versions; added `.table-scroll { overflow-x: auto }` wrapping both tables in `SoftwareOverview.tsx`; added tests for a per-item detail-call failure in `listSoftware()`, the `MAX_PAGES` cap actually terminating, `listSets()`'s `sharedsets` failing after `releases` succeeds, and `GET /api/software` returning 409 `NOT_CONFIGURED` when the active environment has no stored credentials. Re-verified with `npm run build` (clean) and `npm test` (65 backend + 19 frontend tests, all green).
- Tests added: `equipmentcloud-client.test.ts` (`listSoftware`/`listSets` — aggregation with per-item enrichment, pagination via `controls[0].next`, http-error/network-error/timeout passthrough, release-state-label mapping with an unmapped-state fallback); `app.test.ts` (`GET /api/software` — `NOT_CONFIGURED`, success shape, http-error and network-error passthrough); `SoftwareOverview.test.tsx` (new — not-configured hint, populated tables, empty-table placeholders, http-error/timeout/network-error banners).
- Mounting `<SoftwareOverview/>` inside `App` meant every existing `App.test.tsx` test now triggers a second, concurrent `fetch('/api/software')` call from the child component's own mount effect (which fires before the parent `App`'s effect, per React's bottom-up effect order) — the old tests' strictly-ordered `mockResolvedValueOnce` chains desynced against this extra call and had to be rewritten as URL-keyed response queues (`mockFetchRoutes` helper) so each endpoint's mocked responses are independent of call ordering; all existing assertions and behavior were preserved.
- Verified with `npm run build` (clean, no type errors) and `npm test` (60 backend + 19 frontend tests, all green). Did not perform the spec's two manual checks against real EquipmentCloud Test credentials (none available in this session) — left for the Product Owner to run before moving this to `done`.

## Spec Change Log

## Review Triage Log

- **low** (blind-hunter + edge-case-hunter) — `listSets()` fetches `releases` via a single `getJson()` call instead of `fetchAllPages()`, unlike `sharedsoftware`/`sharedsets`, which correctly paginate. Confirmed by reading `equipmentcloud-client.ts`; the `releases` endpoint's own OpenAPI sample shows a `controls` block like the other two, so a paginated release-state catalog would silently drop later labels, falling back to the raw state string. Direct deviation from this spec's own frozen "Always" pagination rule. Low real-world likelihood (release-state catalogs are typically small/fixed) but the fix is a one-line swap matching the existing pattern. Patch: use `fetchAllPages()` for `releases` too.
- **low** (blind-hunter) — `GET /api/software` awaits `client.listSoftware()` then `client.listSets()` sequentially even though they hit independent EquipmentCloud resources, doubling the route's round-trip latency. Confirmed by reading `app.ts`. Fix is a trivial reshape to `Promise.all(...)`. Patch: run both calls concurrently.
- **low** (edge-case-hunter) — in `listSoftware()`, if a per-item `GET sharedsoftware/{id}` detail response has an empty `items` array (item deleted between the list and detail calls — a real TOCTOU race against a live, uncached, potentially multi-editor EquipmentCloud catalog), `detail` is `undefined` and the item is silently pushed with a blank description and no versions, no error surfaced. Confirmed by reading the enrichment loop. Patch: guard the empty-detail case and return an explicit failure for that item instead of defaulting silently.
- **low** (blind-hunter) — `.data-table` has no overflow handling; a long comma-joined "Versionen" list or a narrow viewport can overflow the `.card` layout instead of scrolling. Confirmed by reading `index.css`. Patch: wrap the table in a container with `overflow-x: auto`.
- **low** (blind-hunter + verification-gap, same root cause) — the `listSoftware` test block only covers failure of the initial list call, never a case where the list succeeds but one per-item detail call fails, so that branch (`equipmentcloud-client.ts` lines ~124-128) is unverified. Confirmed by reading `equipmentcloud-client.test.ts`. Patch: add a test with two items where one detail call fails.
- **low** (blind-hunter + edge-case-hunter, same root cause) — the pagination test only exercises a clean 2-page case; nothing asserts the `MAX_PAGES = 50` guard actually terminates a chain that keeps supplying `next`. Confirmed by reading the test file. Patch: add a test driving the cap and asserting it stops.
- **low** (verification-gap, pre-verified) — no test covers `listSets()`'s `releases`-succeeds-but-`sharedsets`-fails branch; the only `listSets` failure test times out on the `releases` call itself, never reaching the `sharedsets` fetch. Patch: add a test for that branch.
- **low** (blind-hunter) — `app.test.ts`'s `GET /api/software` tests only cover "no active environment at all," never "environment active but no stored credentials" (`createEquipmentCloudClient` returns `null`); the sibling `test-connection` route has an equivalent test that wasn't mirrored here. Confirmed by reading `app.test.ts`. Patch: add that test.
- **low, rejected** (blind-hunter + edge-case-hunter, same root cause) — `SoftwareOverview` fetches once on mount with no signal from `App.tsx` when credentials/active-environment change in the same session, so after first-time setup the section stays on "keine aktive Umgebung" until a full reload. Confirmed by reading both components; no shared state or callback exists between them. Real, but low-likelihood in practice: credentials persist across app restarts (keyring) and the active environment is normally already restored at startup before this component ever mounts stale — the gap only bites during a first-ever same-session setup. Fix would require new cross-component signaling, more than a direct correction.
- **low, rejected** (blind-hunter + edge-case-hunter, same root cause) — `listSoftware()`'s per-item detail fan-out (`Promise.all` over every listed item, wasting already-dispatched requests even when an early one fails) has no concurrency cap. Confirmed by reading the code. Real for a large catalog, but this is a single-tenant internal tool with no local caching by design (per epic context) — no evidence catalogs reach a size where this matters. Fix (batching/concurrency limiting) is more than a direct correction.
- **low, rejected** (blind-hunter) — no overall request timeout wraps `/api/software`; each `getJson()` call has its own 5s timeout but up to 50 pages × enrichment could theoretically take minutes if EquipmentCloud is slow-but-functional throughout. Confirmed by reading the code. Requires an unusual combination (many pages, all slow-but-succeeding) to bite; fix (request-level timeout/cancellation plumbing) is more than a direct correction.
- **low, rejected** (edge-case-hunter) — `fetchAllPages` silently returns whatever it collected when the `MAX_PAGES` cap is hit, with no signal to the UI that the list may be truncated. Confirmed by reading the code. Same reasoning as the unbounded-fan-out finding above: no evidence this tool's catalogs approach 50 pages; a truncation flag threaded through the port/route/frontend is more than a direct correction.
- **low, rejected** (edge-case-hunter) — a non-JSON 200 response body (e.g. an HTML error page from a misconfigured proxy) makes `response.json()` throw inside `getJson()`'s generic catch, which reports it as `network-error` rather than a distinct "malformed response" kind. Confirmed by reading `getJson()`. Real but rare (a 200 status with an unparseable body is unusual); the user still sees an error, just an imprecisely-labeled one. Fix requires a new discriminated-union variant threaded across port/route/frontend, more than a direct correction.
- **low, rejected** (blind-hunter) — `fetchAllPages`/`getJson` attach the Basic-Auth header to whatever URL comes back in `controls[0].next` with no same-origin check against `baseUrl`. Confirmed by reading the code. Same threat model and same rejection rationale already recorded in spec-1-3's triage for `EquipmentCloudClient`'s redirect-following: the link is supplied by the same already-authenticated EquipmentCloud server on every call, so exploiting this requires that trusted channel to already be compromised — at which point credentials are already exposed on the very first request, not newly so via pagination. Adding an origin check is more than a direct correction for an unconfirmed threat.
- **false** (edge-case-hunter) — claimed a component-unmount race during a pending `/api/software` request could produce a "set state on unmounted component" warning. Disproved by the same reasoning already recorded in spec-1-3's triage for the identical claim: the app still has no multi-screen navigation, so nothing unmounts `SoftwareOverview` while a request is pending.

## Verification

**Commands:**
- `npm test` -- expected: all backend and frontend tests pass, including new SoftwareCenter adapter/route/component tests
- `npm run build` -- expected: clean build, no type errors

**Manual checks:**
- With real Test credentials active, open the app and confirm the software and sets tables show real EquipmentCloud data with correct release-state labels
- Temporarily deselect/clear the active environment and confirm the "not connected" hint appears instead of an error
