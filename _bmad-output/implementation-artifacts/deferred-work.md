- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-1-project-scaffold.md`
  summary: Add an SPA/wildcard fallback (serve `index.html` on 404) to the Fastify static-file registration in `src/api/server.ts`.
  evidence: Story 1.1 only needs to serve one static landing page, so no fallback is needed yet. Stories 1.4/1.5 add real UI views; once the frontend has client-side routes, a deep link or browser refresh on a non-root path will 404 without this.
- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-1-project-scaffold.md`
  summary: Add a root-level `npm run lint` covering backend `src/` code (frontend already has `oxlint` wired via `frontend/package.json`).
  evidence: Story 1.1's AC only covers the start command and landing page, not lint tooling; AGENTS.md already tracks this as an open TODO. Backend TypeScript has zero lint coverage today.
