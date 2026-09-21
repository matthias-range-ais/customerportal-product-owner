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
