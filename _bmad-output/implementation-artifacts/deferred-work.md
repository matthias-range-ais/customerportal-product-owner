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
