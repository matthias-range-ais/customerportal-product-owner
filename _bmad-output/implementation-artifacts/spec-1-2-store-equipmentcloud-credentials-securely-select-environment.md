---
title: 'Store EquipmentCloud Credentials Securely & Select Environment'
type: 'feature'
created: '2026-09-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c0c691cb3c2fa1e2619ea02ea8802d281bb09de8'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The scaffold has no way to enter or store EquipmentCloud credentials, and no concept of a "Test" vs "Production" environment — every later story (starting with 1.3's connection check) needs both to exist first.

**Approach:** Add a connection/settings screen where the Product Owner enters a username/password for Test and separately for Production; saving stores each via Windows Credential Manager (`@napi-rs/keyring`), never on disk. The screen also lets them pick which environment is active and always shows which one that is.

## Boundaries & Constraints

**Always:** Username+password reach the OS credential store only, via a `src/adapters/credentials/` implementation of a new domain `CredentialsPort` — never written to disk, a config file, logs, or git. Once saved, a password is never sent back to the frontend or re-displayed; the settings screen can only show whether an environment is "configured", not the secret. `src/domain/` stays free of `@napi-rs/keyring`/Fastify imports.

**Never:** No EquipmentCloud network calls (that's Story 1.3 — this story only stores local credentials and tracks the active environment). No local-DB/storage-adapter work (still deferred to CAP-2). No general app navigation/routing system — this screen is the app's current sole view, replacing today's placeholder landing page.

**Decided:** The active environment is in-memory only — never persisted, and reset on every process restart. It defaults to `prod`, overridable at startup via an `EQUIPMENTCLOUD_ENV` env var (`test` or `prod`, mirroring the existing `HOST`/`PORT` pattern in `src/api/server.ts`). Local/automated runs (e.g. `npm test`, and any future dev workflow that would otherwise hit Production by default) must pass `EQUIPMENTCLOUD_ENV=test` explicitly. The UI can still switch the active environment at runtime (in-memory, per the I/O matrix above) — that choice just doesn't survive a restart.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save credentials | Username + password submitted for Test or Production | Stored via keyring; screen shows that environment as "configured" | Empty username or password → reject with a validation message, nothing stored |
| Overwrite | Save submitted for an environment that already has stored credentials | Old entry is replaced | N/A |
| Switch active environment | User selects an environment with stored credentials | Becomes active; screen updates to show it | Selecting an environment with no stored credentials → rejected with a message to configure it first |
| First launch | No credentials stored for either environment yet | Both shown as "not configured"; no environment is active | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/` — currently empty; add a `CredentialsPort` interface (`saveCredentials(env, username, password)`, `hasCredentials(env): boolean`) and an `Environment = 'test' | 'prod'` type. No method here may return a raw secret — only the (later, Story 1.3) EquipmentCloud adapter construction step reads one, directly from the credentials adapter.
- `src/adapters/credentials/` — currently empty (`.gitkeep` only); implement `CredentialsPort` using `@napi-rs/keyring`'s `Entry` class (not yet installed — confirmed real package, sync API: `new Entry(service, account)`, `.setPassword(str)`, `.getPassword()`, `.deletePassword()`). One `Entry` per environment, `account` fixed to the environment name (`'test'`/`'prod'`) so it's always retrievable without already knowing the username; store `JSON.stringify({ username, password })` as the entry's password value.
- `src/api/app.ts` — register new routes here: environment status, save credentials, set active environment. Existing `buildApp()`/static-serving setup stays as-is.
- `src/api/server.ts` / `src/api/env.ts` — read `EQUIPMENTCLOUD_ENV` (default `'prod'`) at startup using the existing `envOrDefault()` helper, pass it into `buildApp()` as the initial active environment (in-memory state lives wherever `buildApp()` wires the routes — no new persistence).
- `frontend/src/App.tsx` — replace the current placeholder landing page with the settings screen (two credential forms, an active-environment switcher, and a clear indicator of which one is active).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/credentials-port.ts` -- define `CredentialsPort` and `Environment` -- gives the adapter and API routes a shared contract
- [x] `src/adapters/credentials/keyring-credentials-adapter.ts` -- implement `CredentialsPort` via `@napi-rs/keyring` -- one entry per environment, per Code Map
- [x] `src/api/app.ts` -- add settings routes (status / save credentials / set active environment) wired to the adapter -- exposes the port to the frontend
- [x] `frontend/src/App.tsx` (and any new components under `frontend/src/`) -- build the settings screen -- satisfies the story's AC
- [x] `src/api/server.ts` -- read `EQUIPMENTCLOUD_ENV` (default `prod`) via `envOrDefault()` and pass it to `buildApp()` -- sets the in-memory startup default per the Decided note above
- [x] Unit tests for the credentials adapter and the new routes, covering the I/O matrix above

**Acceptance Criteria:**
- Given the tool is freshly started, when the Product Owner opens it, then they see the connection/settings screen with Test and Production credential fields
- Given they submit a username/password for an environment, when it saves, then that environment shows as configured and the password is never echoed back
- Given at least one environment is configured, when they select it as active, then the screen clearly shows it as the active environment
- Given an environment has no stored credentials, when they try to select it as active, then the switch is rejected with a clear message

## Implementation Notes

- `src/domain/credentials-port.ts`: `Environment = 'test' | 'prod'` and `CredentialsPort` with exactly the two methods the spec names (`saveCredentials`, `hasCredentials`); no `getCredentials`/raw-read method added here since no consumer needs one until Story 1.3, and the spec is explicit that only that story's EquipmentCloud-adapter construction step reads a raw secret, and does so directly from the concrete adapter, not through this port.
- `src/adapters/credentials/keyring-credentials-adapter.ts`: `KeyringCredentialsAdapter` takes an optional `service` string (default `'customerportal-product-owner'`), overridable so tests never touch the real Windows Credential Manager. One `Entry` per environment, `account` fixed to `'test'`/`'prod'`; password value is `JSON.stringify({ username, password })`. Checked the installed `@napi-rs/keyring@2.1.0`'s actual type defs (`node_modules/@napi-rs/keyring/index.d.ts`): `Entry.getPassword()` returns `string | null` on this version rather than throwing when absent, so `hasCredentials` checks `!== null` (wrapped in try/catch to also treat a locked/inaccessible/ambiguous store as "not configured" rather than crash the settings screen).
- `src/adapters/credentials/keyring-credentials-adapter.test.ts`: unit-tests the adapter against a `vi.mock('@napi-rs/keyring')` in-memory fake `Entry`, not the real OS credential store — deterministic, portable, and avoids leaving real Windows Credential Manager entries behind from automated test runs.
- `src/api/app.ts`: added `GET /api/settings` (status snapshot), `POST /api/settings/credentials`, `POST /api/settings/active-environment`. `buildApp()` gained `credentialsPort` (default: real `KeyringCredentialsAdapter`) and `initialEnvironment` (default `'prod'`) options, both injectable — every test in `app.test.ts` passes an in-memory `CredentialsPort` test double so no backend test touches the real credential store either.
- Response shape on all three routes is a `{ environments: { test: {configured}, prod: {configured} }, active }` snapshot — never a secret. Error responses are a machine-readable `{ error: 'INVALID_ENVIRONMENT' | 'MISSING_CREDENTIALS' | 'NOT_CONFIGURED' }` code (English, per AGENTS.md's code-is-English convention); the frontend maps each code to the German user-facing message, keeping the API itself language-neutral.
- Resolved an apparent tension between the frozen "Decided" note (active environment "defaults to `prod`") and the I/O matrix's "First launch: ... no environment is active" row: `buildApp()`'s `initialEnvironment` is only actually adopted as `active` if that environment already has stored credentials (same rule as the runtime switch-rejection case) — otherwise `active` stays `null`. Verified manually: fresh keyring state + default env → `active: null`; same state + `EQUIPMENTCLOUD_ENV=test` after saving Test credentials → `active: "test"`.
- `src/api/server.ts`: reads `EQUIPMENTCLOUD_ENV` via the existing `envOrDefault()` (default `'prod'`); an unrecognized value throws before `buildApp()` is called, hitting the existing try/catch → `console.error` + exit code 1 fail-fast path already established for the missing-frontend-build case, rather than silently falling back to `'prod'` (a silent fallback risked masking a typo that would point the tool at Production when the user meant Test).
- `frontend/src/App.tsx`: replaced the placeholder landing page with the settings screen — one `<section>` per environment (Test/Produktion) with a credential form (username/password, `Speichern`) and a per-section "Konfiguriert"/"Nicht konfiguriert" + "· Aktiv" indicator, plus an "Aktive Umgebung: …" line and a disabled-when-already-active "Als aktive Umgebung auswählen" button per section. All GUI text in German per AGENTS.md; loads `GET /api/settings` on mount; password fields are cleared (not re-populated) after a successful save, and the backend never returns a password to begin with.
- Found and fixed a pre-existing test-infra gap while adding `App.test.tsx` cases: `frontend/src/test-setup.ts` had no `afterEach(cleanup)`, and this project's `vite.config.ts` doesn't set `test.globals: true`, so Testing Library's automatic DOM cleanup between tests silently never ran — harmless with the old single-test file, but caused multiple stacked renders (and "found multiple elements" failures) once more than one test rendered `<App />`. Added the explicit `afterEach(cleanup)` to `test-setup.ts`.
- Verified with `npm run build` (clean) and `npm test` (26 backend + 5 frontend tests, all green), plus manual checks against the real Windows Credential Manager (via `node dist/api/server.js`): fresh state → both environments "not configured", `active: null`; saved Test credentials → `test.configured: true`; selecting `prod` as active before it has credentials → `409 {"error":"NOT_CONFIGURED"}`, `active` stays `null`; selecting `test` → `active: "test"`; restarting without `EQUIPMENTCLOUD_ENV` → `active: null` again (default `prod`, not configured — confirms the in-memory reset, doesn't carry over the previous `test` selection); `EQUIPMENTCLOUD_ENV=staging` → exits 1 with a clear error. Deleted the real keyring entry created during this manual verification afterward so no test data was left in the Product Owner's real Windows Credential Manager.

## Verification

**Commands:**
- `npm test` -- expected: all backend and frontend tests pass, including new credentials-adapter and settings-route tests
- `npm run build` -- expected: clean build, no type errors

**Manual checks:**
- Start the app fresh (no prior keyring entries for this app), confirm both environments show "not configured" and no environment is active
- Enter and save Test credentials, confirm they can then be selected as active and the UI reflects it
- Restart the process without `EQUIPMENTCLOUD_ENV` set and confirm it defaults back to `prod` regardless of what was active before the restart; confirm `EQUIPMENTCLOUD_ENV=test npm start` starts with `test` active instead

## Review Triage Log

- **high** (verification-gap) — `src/api/server.test.ts`'s two tests spawn the real `server.ts` via `tsx` without setting `EQUIPMENTCLOUD_ENV`, and without any way to inject a fake `CredentialsPort`. Since `server.ts` now calls `buildApp({ initialEnvironment })` with no `credentialsPort` override, `buildApp` defaults to the real `KeyringCredentialsAdapter`, and its `hasCredentials('prod')` check hits the real Windows Credential Manager on every `npm test` run — confirmed by reading both files. Directly contradicts this spec's own "Decided" note ("automated runs ... must pass `EQUIPMENTCLOUD_ENV=test` explicitly") and `app.test.ts`'s own stated intent ("no test in this file should ever touch the real Windows Credential Manager"). Patch: pass `EQUIPMENTCLOUD_ENV: 'test'` in both `runServer(...)` calls in `server.test.ts`.
- **medium** — `POST /api/settings/credentials` validates `username`/`password` trimmed (`.trim() === ''`) but calls `credentialsPort.saveCredentials(environment, username, password)` with the raw, untrimmed values. Confirmed by reading `src/api/app.ts`. A copy-pasted credential with incidental whitespace passes validation but is stored differently than intended, surfacing later as a confusing EquipmentCloud auth failure in Story 1.3. Patch: trim before storing.
- **medium** (edge-case-hunter + verification-gap, same root cause) — `handleSave`/`handleSelectActive` in `frontend/src/App.tsx` call `fetch(...)` with no `try/catch`, unlike `loadSettings`'s existing pattern. Confirmed by reading the file. A network-level rejection (not just a non-OK response) is unhandled — the user gets no feedback at all, worse than a normal error message. Patch: wrap both in `try/catch` mirroring `loadSettings`.
- **low** (edge-case-hunter + blind-hunter, same root cause) — `KeyringCredentialsAdapter.saveCredentials` has no try/catch around `entry.setPassword()`, unlike `hasCredentials`'s guard for a locked/inaccessible store; no test exercises a throwing write either. Confirmed by reading the adapter and its test file. Patch: guard the write and have the route return a distinguishable error code on failure; add a test for both.
- **low** — `isEnvironment()` in `src/api/app.ts` isn't exported; `parseEquipmentCloudEnv()` in `src/api/server.ts` re-implements the identical `'test' | 'prod'` check inline. Confirmed by reading both files. A third environment or a rename only needs to change in one place to silently diverge from the other. Patch: move the type guard to `src/domain/credentials-port.ts` and import it in both places.
- **low** — the password `<input>` uses `autoComplete="current-password"`, the wrong semantic for a field that sets/overwrites a stored credential rather than logging in — `new-password` is correct and avoids the browser offering an unrelated saved password. Confirmed by reading `App.tsx`. Patch: one-attribute fix.
- **low** — `handleSave` clears the username together with the password after a successful save; only the password needs to be withheld per the spec. Confirmed by reading `App.tsx`. Forces retyping the username to rotate a password later, with no stated reason to do so. Patch: only clear the password field.
- **low** — no test exercises switching active environment between two environments that both already have stored credentials (e.g. test → prod → test) — the actual day-to-day usage pattern. Confirmed by reading `app.test.ts`; every activation test starts from `active: null`. Patch: add one test.
- **low** — no test exercises a whitespace-only *username* (only whitespace-only password and empty username are covered). Confirmed by reading `app.test.ts`. Patch: add one test, mirroring the existing whitespace-password case.
- **false** — reviewer claimed `docs/sprint-status.yaml` (`in-progress`) and this spec's frontmatter (`in-review`, set at the start of this review step) "disagree" as a defect. Disproved: this workflow syncs `sprint-status.yaml` at defined points (implement → `in-progress`, finalize → `review`/`done`), not continuously in lockstep with the spec's own status field — the diff was captured mid-review, which is exactly when they're expected to differ momentarily.
- **low, rejected** — no length/content limit on stored credentials before writing to the OS credential store. Real, but this is a single local, single-user tool (NFR9) with no untrusted input path — the only source of an oversized value would be the Product Owner themselves. Fix (validation, limits, error messaging) is more than a direct correction for a risk with no realistic trigger here.
- **low, rejected** (blind-hunter + edge-case-hunter, same root cause) — no busy/disabled state on the Save/"Als aktive Umgebung auswählen" buttons; a rapid double-click could fire overlapping requests. Real, but low-impact (last response wins, no data corruption) for a single local user on their own settings page, and the fix (per-environment pending-state tracking across two buttons) is more than a direct correction.
- **low, rejected** — inconsistent accessibility treatment: error messages use `role="alert"`, the save-success message doesn't use `role="status"`/`aria-live`. Real, but not required by any AC and unlikely to matter for this single-user internal tool; the fix (a consistent live-region pattern across the screen) is more than a one-line correction.
- **low, rejected** — `CredentialsPort` has no `deleteCredentials`/reset method, even though the underlying `Entry` supports `deletePassword()`. Real gap versus the library's capability, but not versus the AC: overwriting an environment's credentials with corrected values already fully recovers from a mistake (the end state — correct credentials active — is identical to delete-then-re-enter). Adding real delete capability (port method, adapter, route, UI, tests) is a new feature beyond a direct correction, and the frozen Intent doesn't ask for it.

