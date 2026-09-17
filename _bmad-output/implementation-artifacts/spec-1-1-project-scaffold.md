---
title: 'Project Scaffold'
type: 'feature' # feature | bugfix | refactor | chore
created: '2026-09-17'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done
route: 'oneshot' # oneshot | dispatch — set by step-02's route gate after design
review_loop_iteration: 0 # incremented by step-04 before each review loopback
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository has planning docs (SPEC, architecture, epics) but zero code — no backend, no frontend, no single start command — so no Epic 1 feature work has anywhere to land.

**Approach:** Scaffold a Fastify 5 (TypeScript) backend and a Vite/React/TypeScript frontend (`npm create vite@latest -- --template react-ts`) inside a Ports & Adapters layout (`src/domain/`, `src/adapters/{equipmentcloud,credentials,storage}/`, `src/api/`), on Node.js 24. One `npm start` builds the frontend and launches the single Fastify process, which serves the built React app and shows a basic landing page.

</frozen-after-approval>

## Implementation Notes

- npm workspaces (`workspaces: ["frontend"]`) chosen over two independent installs, so `npm install` and `npm run build`/`npm start` at the root are the only commands a developer needs.
- Backend uses TypeScript (not just JS) for consistency with the frontend and to type the Ports & Adapters boundary the epic calls for — not explicitly required by the AC but a low-risk, unsurprising default.
- Created empty `src/domain/`, `src/adapters/equipmentcloud/`, `src/adapters/credentials/` (each with `.gitkeep`) to match the epic's stated directory shape, since Stories 1.2–1.5 depend on it existing. `src/adapters/storage/` was left out — not needed until CAP-2.
- Replaced Vite's stock marketing landing page (logos, counter, external links) in `frontend/src/App.tsx` with a minimal page showing the project name, and removed the now-unused template assets (`App.css`, `assets/`, `public/icons.svg`) — satisfies "basic landing page" without carrying dead template code.
- Verified with a clean-state run: deleted `dist/` and `frontend/dist/`, ran `npm start`, confirmed `GET /` returns 200 and serves the built app.
- Updated `AGENTS.md`'s "Running and verifying" section (previously a TODO placeholder) with the real install/build/start commands, since this story is what resolves that TODO.
- Files added/changed: `package.json`, `tsconfig.json`, `.gitignore`, `src/api/server.ts`, `src/domain/.gitkeep`, `src/adapters/equipmentcloud/.gitkeep`, `src/adapters/credentials/.gitkeep`, `frontend/` (Vite scaffold, trimmed), `AGENTS.md`, `docs/sprint-status.yaml` (status sync).
- Post-review fixes: aligned root `typescript` devDependency to `~6.0.2` (was `^7.0.2`, diverging from the frontend's pinned version); translated the landing page's body text to German (`Grundgerüst läuft.`) per AGENTS.md's GUI-text convention; resolved AGENTS.md's SBOM TODO now that `package.json` exists (`npm sbom`); replaced `frontend/README.md`'s generic Vite boilerplate with a project-specific pointer; documented the `frontend/dist` build-output coupling with a comment in `src/api/server.ts`. Re-verified clean-state `npm start` and confirmed the German text reached the built JS bundle after the fixes.
- Deferred (out of this story's AC, logged in `deferred-work.md`): SPA/wildcard fallback routing for future UI views; a root-level lint script covering backend `src/` code.
- Post-walkthrough addition (requested by the user during `bmad-walkthrough` review, since the project had no test framework at all): added Vitest project-wide. Split `src/api/server.ts` into `src/api/app.ts` (exports `buildApp()`, no side effects) and a thin `server.ts` entry point, so the app can be tested via Fastify's `inject()` without binding a real port. Added `src/api/app.test.ts` (asserts `GET /` serves the built HTML shell and that the referenced JS bundle contains the German landing-page text — the same thing manually curl/grep-verified earlier, now automated) and `frontend/src/App.test.tsx` (Testing-Library render test). `npm test` (`pretest` builds the frontend first, since the backend test serves real files from `frontend/dist`) runs both; `frontend`'s own `npm test` runs standalone. Excluded `**/*.test.ts(x)` from both production `tsconfig`s so test files never land in `dist/`.
- Post-walkthrough addition (requested during the Detail Pass risk review, flagging the host as hardcoded): `src/api/server.ts` now reads `HOST` from the environment (defaulting to `127.0.0.1`), mirroring the existing `PORT` handling. Re-verified with `HOST=127.0.0.1 PORT=3001 node dist/api/server.js` and re-ran `npm test` (all green).

## Review Triage Log

- **medium** — root `package.json` pinned `typescript@^7.0.2` while `frontend/package.json` pins `~6.0.2`, two major versions apart in one repo. Confirmed by reading both files. Patched: aligned root to `~6.0.2`; rebuilt and re-verified clean-state `npm start`.
- **low** — landing page text ("Scaffold running.") was English, violating AGENTS.md's "GUI-facing text: German" convention. Confirmed by reading `frontend/src/App.tsx` against `AGENTS.md`. Patched: translated to "Grundgerüst läuft."; confirmed the German string reached the built JS bundle.
- **low** — AGENTS.md's SBOM line was still "TODO once `package.json` exists," but this changeset creates `package.json`. Confirmed by reading the file. Patched: replaced with the concrete command (`npm sbom`), already specified as NFR7 in `docs/epics.md`.
- **low** — `frontend/README.md` was untouched Vite template boilerplate with no project context. Confirmed by reading the file. Patched: replaced with a short project-specific pointer to the root README/AGENTS.md.
- **low** — the `frontendDist` path in `src/api/server.ts` implicitly depends on Vite's default `dist` output directory, undocumented. Confirmed by reading both files (`vite.config.ts` sets no `build.outDir`). Patched: added a one-line comment noting the coupling.
- **false** — reviewer claimed `allowScripts` in root `package.json` is "not a field npm itself reads" (a pnpm-only concept) and is dead configuration. Disproved: this session's npm (11.19.0) natively provides `npm install-scripts approve/deny/ls`, which wrote this exact field, and the gated package (`esbuild`) installed and ran correctly afterward — confirmed by the build and server tests succeeding.
- **false** — reviewer claimed `docs/sprint-status.yaml` and the spec's own status were left lagging behind finished work. Disproved: this Finalize Spec step (status → `done`, sprint-status → `review` via `sync-sprint-status.md`) runs immediately after classification, per the oneshot workflow's own ordering — not a gap in the delivered work.
- **low, rejected** — reviewer noted the frozen Intent's approach text lists `src/adapters/{equipmentcloud,credentials,storage}/`, but `storage/` wasn't created. Real, but the fix (editing frozen text) is against this workflow's rules once written; the deviation is already documented in Implementation Notes, which is the correct channel for it. Not re-opened.
- **maybe-false, deferred** — no SPA/wildcard fallback for future client-side routes. Real gap, but explicitly out of Story 1.1's AC (one static landing page only); would become relevant starting with Stories 1.4/1.5's real UI views. Logged in `deferred-work.md`.
- **maybe-false, deferred** — no root-level lint script for backend `src/` code. Real gap, but out of Story 1.1's AC and already tracked as an open TODO in `AGENTS.md`. Logged in `deferred-work.md`.

