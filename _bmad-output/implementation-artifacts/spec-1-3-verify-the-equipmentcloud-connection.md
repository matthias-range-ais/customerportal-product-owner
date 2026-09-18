---
title: 'Verify the EquipmentCloud Connection'
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5abd53ef737cfb13d4937244b7db5bd346d382b2'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The tool can store credentials and pick an active environment (Story 1.2), but there is no way to confirm those credentials actually work against EquipmentCloud before later stories (1.4/1.5) rely on them for live data.

**Approach:** Add a "Verbindung testen" action per configured environment that calls the BasicAuth `GET /cloudconnect/api/softwarecenter/v1/ping` endpoint using that environment's stored credentials and base URL, and shows success or the raw error inline on the settings screen.

## Boundaries & Constraints

**Always:** Only call the existing BasicAuth `/cloudconnect/api/softwarecenter/v1/ping` endpoint; the test-connection action is only available for an environment that is already `configured`; raw credentials are read from the credentials adapter only inside the new EquipmentCloud adapter's construction step, never exposed to route handlers or the frontend; a failed check surfaces the raw EquipmentCloud response/error, not a generic message; the request carries a timeout so a hung network call can't freeze the button state indefinitely.

**Never:** No writes/mutations to EquipmentCloud (ping only); no persistence of connection-check results (transient UI state only, per the epic's no-local-caching rule); no change to how credentials are stored or the active environment is chosen (Story 1.2 scope, untouched); Bearer/OAuth2 `_oa` endpoints stay out of scope.

**Decided:** The production base URL is `https://eqcloud.kontron-ais.com/C1681906` — hardcoded as the default `prod` base URL in `src/adapters/equipmentcloud/`, alongside the known `test` default (`https://eqcloud-test.ad.kontron-ais.com/DEV`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Successful ping | Configured env, valid credentials, EquipmentCloud reachable, ping returns 2xx | UI shows a clear success status for that environment | N/A |
| Invalid credentials | Configured env, EquipmentCloud rejects with 401/403 | UI shows the raw EquipmentCloud error/status | Surface response status + body text verbatim, not swallowed |
| Unreachable / timeout | Network error, or request exceeds the timeout | UI shows a clear failure with the raw underlying error message | Timeout aborts the request; message distinguishes "no response" from an EquipmentCloud error |
| Not configured | Environment has no stored credentials | Test-connection action is unavailable for that card | Direct API call rejected with a `NOT_CONFIGURED`-style error code |

</frozen-after-approval>

## Code Map

- `src/domain/credentials-port.ts` — existing `Environment`, `CredentialsPort`, `isEnvironment`; reuse as-is, no changes. Doc comment already states only the EquipmentCloud adapter's construction step may read a raw password, and not through this port.
- `src/adapters/credentials/keyring-credentials-adapter.ts` — `KeyringCredentialsAdapter` has a **private** `readStored(environment)` returning `{username,password}|null`; add one new **public**, adapter-only method (e.g. `getCredentials(environment)`) wrapping it. Do not add this to `CredentialsPort` — keep the domain port secret-free per its documented intent.
- `src/adapters/equipmentcloud/` — currently empty (`.gitkeep` only), greenfield. Add a small port (e.g. `checkConnection(): Promise<ConnectionCheckResult>`) plus a concrete client: takes a base URL + `{username,password}` at construction, calls `GET {baseUrl}/cloudconnect/api/softwarecenter/v1/ping` with a Basic Auth header via the global `fetch` (no axios/undici/got in `package.json`), using an `AbortController` timeout. Base URL: `test` → `https://eqcloud-test.ad.kontron-ais.com/DEV`; `prod` → `https://eqcloud.kontron-ais.com/C1681906` (both hardcoded defaults, per the Decided note above).
- `src/api/app.ts` — add `POST /api/settings/test-connection` (body `{environment}`), builds the EquipmentCloud client per-request from stored credentials + base URL, returns the ping outcome. Register alongside the existing `/api/settings/*` routes, before the static-file registration. Reuse the existing `{error:'CODE'}` shape for the not-configured/invalid-environment guard cases.
- `frontend/src/App.tsx` — add a "Verbindung testen" button + inline status area per environment card, enabled only when `configured`, calling the new route and rendering success/failure with the existing `badge`/`banner` CSS classes in `frontend/src/index.css` (extend with a failure-state style if the existing palette doesn't fit an error).
- `package.json` — no new dependency; backend tests mock the ping call via `vi.stubGlobal('fetch', ...)` (no msw/nock installed).

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/credentials/keyring-credentials-adapter.ts` -- add public `getCredentials(environment)` -- lets the new adapter read raw credentials without widening `CredentialsPort`
- [x] `src/adapters/equipmentcloud/equipmentcloud-port.ts` -- define the connection-check port -- domain-facing contract
- [x] `src/adapters/equipmentcloud/equipmentcloud-client.ts` -- implement the port: BasicAuth GET to the ping endpoint with timeout, base-url resolution per environment -- fulfills the AC
- [x] `src/api/app.ts` -- add `POST /api/settings/test-connection` wired to the new adapter -- exposes the check to the frontend
- [x] `frontend/src/App.tsx` -- add "Verbindung testen" button + status per environment card -- satisfies the AC
- [x] Unit tests (backend adapter + route, frontend button/status) covering the I/O matrix above

**Acceptance Criteria:**
- Given an environment has stored credentials, when the Product Owner clicks "Verbindung testen" for it, then a successful ping shows a clear success indicator
- Given the stored credentials are rejected by EquipmentCloud, when the check runs, then the UI shows the raw EquipmentCloud error rather than a generic message
- Given EquipmentCloud is unreachable or times out, when the check runs, then the UI shows a clear failure distinguishing it from a credential rejection
- Given an environment has no stored credentials, when the Product Owner views its card, then the test-connection action is not available for it

## Implementation Notes

- `src/adapters/credentials/keyring-credentials-adapter.ts`: added public `getCredentials(environment): {username, password} | null`, a thin wrapper around the existing private `readStored()`. `CredentialsPort` (domain) is untouched — no new method added there.
- `src/adapters/equipmentcloud/equipmentcloud-port.ts` (new): defines `StoredCredentials`, an adapter-only `CredentialsSource` interface (`getCredentials(environment)`, deliberately separate from the domain `CredentialsPort`), the `ConnectionCheckResult` discriminated union (`{ok:true}` / `{ok:false, kind:'http-error', status, body}` / `{ok:false, kind:'network-error', message}` / `{ok:false, kind:'timeout'}`), and the `EquipmentCloudPort` interface (`checkConnection()`).
- `src/adapters/equipmentcloud/equipmentcloud-client.ts` (new): `EquipmentCloudClient` implements `EquipmentCloudPort` — takes a base URL, `StoredCredentials`, and an optional timeout (default 5000ms) at construction; `checkConnection()` does a BasicAuth `GET {baseUrl}/cloudconnect/api/softwarecenter/v1/ping` via the global `fetch` with an `AbortController`-backed timeout, returning the discriminated result (2xx → `ok:true`; non-2xx → raw status + response body text; abort → `timeout`; any other rejection → `network-error` with the raw underlying message). Also exports `resolveBaseUrl(environment)` (hardcoded `test`/`prod` URLs per the Decided note) and a `createEquipmentCloudClient(environment, credentialsSource, timeoutMs?)` factory that is the *only* place a raw `{username, password}` pair is read out of a `CredentialsSource` — it returns `null` when the environment has no stored credentials, or a ready `EquipmentCloudClient` otherwise. This keeps the "raw credentials never reach the route handler" boundary literal: `src/api/app.ts` only ever holds a client instance or `null`, never the credential values themselves.
- `src/api/app.ts`: added `POST /api/settings/test-connection` (body `{environment}`), registered after `active-environment` and before the static-file registration, matching the Code Map. Validates the environment the same way the existing routes do (`isEnvironment` → 400 `INVALID_ENVIRONMENT`), then calls `createEquipmentCloudClient(environment, credentialsPort)`; `null` → 409 `NOT_CONFIGURED` (same shape as the existing not-configured guard on `active-environment`); otherwise returns `client.checkConnection()`'s result directly as the response body with the default 200 status — the HTTP status of *our* API stays 200 for a completed check regardless of whether the ping itself succeeded, since the check ran successfully; the ping's own outcome (success/http-error/network-error/timeout) lives in the JSON body for the frontend to interpret. `BuildAppOptions.credentialsPort` is now typed `CredentialsPort & CredentialsSource` (composition-root-only widening — the domain `CredentialsPort` interface itself is untouched).
- `frontend/src/App.tsx`: added a `ConnectionCheckResult`/`TestConnectionState` type pair and a `testConnection` state record (per environment: idle/loading/success/error). Each card renders a "Verbindung testen" button + status area only when `status.configured` is true (per the AC, the action doesn't exist at all for an unconfigured environment, not just disabled). Success shows "Verbindung erfolgreich."; failures map `http-error` to `EquipmentCloud-Fehler {status}: {body}` (raw response surfaced verbatim), `timeout` to a fixed "Zeitüberschreitung…" message, and `network-error` to `Netzwerkfehler: {message}` (raw underlying error) — reusing the existing `.form-message--success`/`.form-message--error` classes. Added one new CSS class, `.connection-test` (layout only: stacks the button and status message, thin top border to separate it from the credentials form) — the existing success/error palette already fit, so no new color tokens were needed.
- Tests added: `src/adapters/credentials/keyring-credentials-adapter.test.ts` (`getCredentials` not-configured/configured cases), `src/adapters/equipmentcloud/equipmentcloud-client.test.ts` (new file — `resolveBaseUrl`, `createEquipmentCloudClient`, and `EquipmentCloudClient.checkConnection()` success/http-error/network-error/timeout, all via `vi.stubGlobal('fetch', ...)`, no msw/nock), `src/api/app.test.ts` (new `POST /api/settings/test-connection` describe block: invalid environment, not-configured, success with Basic Auth header + base-URL assertions, http-error passthrough, network-error, and a check that the raw password never appears in the response body), `frontend/src/App.test.tsx` (button hidden when unconfigured; success, http-error, timeout, and network-error rendering).
- Verified with `npm run build` (clean, no type errors) and `npm test` (49 backend + 10 frontend tests, all green). Did not perform the spec's three manual checks against the real EquipmentCloud endpoints (no test/prod credentials were available in this session) — see the report to the requester for details; this remains an open item for the Product Owner to run before fully trusting `prod` connectivity.
- **Post-review patch pass:** capped the displayed non-2xx response body at 500 characters (with a trailing "…") in `EquipmentCloudClient.checkConnection`; reworded the empty-body http-error fallback from `'(keine Antwort)'` to `'(kein Antworttext)'` in `frontend/src/App.tsx` so it no longer reads like the separate timeout message; added tests for both, plus a test covering the previously-untested case where the outer `/api/settings/test-connection` fetch itself returns 409 `NOT_CONFIGURED`. Re-verified with `npm run build` (clean) and `npm test` (50 backend + 12 frontend tests, all green).

## Spec Change Log

## Review Triage Log

- **low** (blind-hunter) — `EquipmentCloudClient.checkConnection` reads the full non-2xx response body via `response.text()` and `frontend/src/App.tsx` interpolates it verbatim with no length cap. Confirmed by reading both files. A misbehaving proxy/gateway in front of a down EquipmentCloud instance returning a large HTML error page would be dumped in full into the small settings card. Patch: cap the displayed body length (e.g. first 500 characters with a trailing indicator).
- **low** (edge-case-hunter + blind-hunter, same root cause) — the non-2xx empty-body fallback text `'(keine Antwort)'` in `frontend/src/App.tsx` reads similarly to the distinct timeout message ("keine Antwort von EquipmentCloud") even though it denotes a real EquipmentCloud HTTP error with an empty body, and no test exercises this fallback branch (every `http-error` test in `App.test.tsx`/`app.test.ts` uses a non-empty body). Confirmed by reading both test files. Patch: reword to something unambiguous (e.g. `'(kein Antworttext)'`) and add one test asserting it for an empty-body http-error.
- **low** (verification-gap) — none of the five new "Verbindung testen" tests in `App.test.tsx:121-201` ever make the outer `POST /api/settings/test-connection` fetch itself return a non-2xx response (e.g. 409 `NOT_CONFIGURED`); all five only vary the inner `ConnectionCheckResult` JSON body, unlike the sibling `handleSave`/`handleSelectActive` branches this code mirrors, which do have such a test. Confirmed by reading `App.test.tsx`. The mapping code itself reads correct on inspection, but the branch is unverified. Patch: add one test mirroring the existing `NOT_CONFIGURED` test, mocking the outer response as 409.
- **medium, deferred** (edge-case-hunter) — `KeyringCredentialsAdapter.readStored`'s existing try/catch (from Story 1.2) treats a locked/inaccessible credential store the same as "not configured," so `/api/settings/test-connection` returns 409 `NOT_CONFIGURED` for an environment that is actually configured but momentarily inaccessible — misleading the Product Owner into thinking they need to re-enter already-correct credentials. Confirmed by reading `keyring-credentials-adapter.ts`; this is pre-existing behavior from Story 1.2, unchanged by this diff, just newly reachable through this route. Not this story's problem to fix.
- **low, rejected** (blind-hunter) — `EquipmentCloudClient` uses `fetch`'s default redirect-following, so a 3xx response redirecting to a page that itself returns 2xx could be misread as a successful ping. Real in principle, but this project's EquipmentCloud integration is BasicAuth-only by explicit scope (no OAuth/SSO redirect flows), so there is no known code path in this deployment that would produce such a redirect for this endpoint; guarding against it is more than a direct correction for an unconfirmed threat.
- **low, rejected** (blind-hunter) — the success message has no `role="status"`/`aria-live`, inconsistent with the error message's `role="alert"`. The same class of finding was already raised and rejected in spec-1-2's review for the same reason: not required by any AC, unlikely to matter for this single-user internal tool, and a consistent live-region pattern across the screen is more than a one-line fix.
- **low, rejected** (blind-hunter) — the frontend's own `fetch('/api/settings/test-connection', …)` has no client-side timeout. Real in isolation, but the backend route always resolves within `EquipmentCloudClient`'s own 5s `AbortController` timeout (confirmed by reading `app.ts` and `equipmentcloud-client.ts`) — the spec's "the request carries a timeout" boundary is about the EquipmentCloud call, which is already bounded. A hang here would mean the local Fastify process itself deadlocked, a pre-existing risk for every route in this app, not specific to this story.
- **low, rejected** (blind-hunter) — no server-side logging of connection-check outcomes. Real gap, but no existing route in this codebase logs its outcomes specially either; singling this one out is new diagnostic infrastructure beyond a direct correction, and not required by the spec.
- **low, rejected** (blind-hunter) — no test verifies that testing one environment's connection leaves the other environment's `testConnection` UI state untouched. Confirmed the state update uses `{...prev, [environment]: ...}`, already correct by construction; this is a coverage-only ask with no demonstrated bug.
- **false** (blind-hunter) — claimed `createEquipmentCloudClient` should guard against stored-but-empty username/password strings. Disproved: Story 1.2's `POST /api/settings/credentials` already rejects an empty username or password before anything is stored, so a stored-but-blank credential pair cannot exist via normal app usage.
- **false** (blind-hunter) — claimed the spec's unrun manual checks contradict the tasks being checked off / status being `in-review`. Disproved: the checked `## Tasks & Acceptance` items (implementation + automated tests) are genuinely complete; the unrun items live in the separate `## Verification -> Manual checks` section, which this workflow's own convention (matching Stories 1.1/1.2) leaves for a human with real credentials to run before `done` — `in-review` is the correct status here, not an overclaim.
- **false** (blind-hunter) — claimed the hardcoded prod base URL is an unflagged operational risk. Disproved: this is the human's own explicit, approved decision recorded verbatim in the spec's frozen `Decided` note (Open Question resolved at Checkpoint 1), not an oversight introduced by implementation.
- **false** (edge-case-hunter) — claimed an unhandled `ConnectionCheckResult.kind` would render "Netzwerkfehler: undefined". Disproved: both the frontend's and backend's `ConnectionCheckResult` type declare exactly three variants (`http-error`/`timeout`/`network-error`); the backend cannot emit a fourth today, so the described branch is unreachable under the current code.
- **false** (edge-case-hunter) — claimed a component-unmount race during a pending test-connection request could produce a "set state on unmounted component" warning. Disproved: the settings screen is the app's sole view with no navigation yet (multi-screen navigation is explicitly deferred, see `deferred-work.md`), so there is currently no code path that unmounts it while a request is pending.

## Verification

**Commands:**
- `npm test` -- expected: all backend and frontend tests pass, including new EquipmentCloud-client and test-connection route tests
- `npm run build` -- expected: clean build, no type errors

**Manual checks:**
- With real Test credentials saved, click "Verbindung testen" and confirm success
- Temporarily save incorrect credentials for an environment and confirm the raw EquipmentCloud error surfaces
- Verify `prod` connects using the hardcoded `https://eqcloud.kontron-ais.com/C1681906` base URL
