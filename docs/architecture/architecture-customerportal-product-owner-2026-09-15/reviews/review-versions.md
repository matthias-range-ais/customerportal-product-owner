# Review: Stack Version Claims — ARCHITECTURE-SPINE.md

Reviewed against web search as of 2026-09-15 (today). Target file: `docs/architecture/architecture-customerportal-product-owner-2026-09-15/ARCHITECTURE-SPINE.md`.

## Node.js 24 (Active LTS, supported to Apr 2028)

**Verdict: Correct.** Node.js 24 is confirmed as the current Active LTS release as of September 2026. Per the Node.js release cadence, even-numbered releases go Active LTS in October of their release year and remain so for 12 months (Node 24 is Active LTS until ~October 20, 2026, then Maintenance LTS until end-of-life). Multiple independent sources (endoflife.date, HeroDevs, nodejs.org/en/about/eol, PkgPulse) converge on an April 30, 2028 end-of-life date for Node 24. The document's claim "24 (Active LTS, supported to Apr 2028)" matches this exactly. No issue.

## Fastify 5.11.0

**Verdict: Real version, but slightly stale — minor issue.** Fastify 5.11.0 is a real, verifiable release (July 30, 2026), and Fastify 5.x is the current major line. However, as of 2026-09-15 the actual latest published version is 5.12.1 (with 5.12.0 and 5.11.1 also released after 5.11.0). This means the pinned version is roughly 6 weeks and two minor/patch releases behind current. This isn't "wrong" or fabricated, but characterizing 5.11.0 as simply "the version" without noting it's not the latest patch is a minor accuracy gap — worth a one-line update or an explicit "pin as of doc date" caveat so it doesn't read as evergreen-current.

## Vite 8.0.9

**Verdict: Real version, but notably stale — flag this.** Vite 8.0.9 is a real release (April 20, 2026), part of the legitimate Vite 8.x line (a major release that switched to Rolldown as the unified Rust-based bundler). However, as of 2026-09-15 the actual latest is Vite 8.3.0 (published just ~4 days prior), meaning three minor version bumps (8.1, 8.2, 8.3) and roughly five months have passed since 8.0.9. This is the most stale version claim in the document — 8.0.9 was effectively obsolete within the same major line by the time this architecture doc was dated. Recommend updating to a current 8.3.x version or explicitly noting the pin is intentional (e.g., for stability) rather than "current."

## React 19.3.0

**Verdict: Correct and current.** React 19.3.0 was released September 9, 2026 (per react.dev's official blog and GitHub releases) — only 6 days before this document's date, and it is the actual latest version on npm as of 2026-09-15. Notable stable features in this release include View Transitions and Fragment Refs. This is the one committed version number in the table that is genuinely current, not stale. No issue.

## TypeScript ("current, per Vite `react-ts` template")

**Verdict: Reasonable, not independently falsifiable.** This isn't a pinned version claim but a delegation to whatever TypeScript version ships with Vite's `react-ts` scaffold template at install time. That's a defensible approach for a spine document (avoids an immediately-stale pin) but does mean this row carries no independently verifiable commitment. No issue, but worth noting it's qualitatively different from the other rows (which do commit to specific numbers).

## @napi-rs/keyring — existence, currency, Windows Credential Manager support

**Verdict: Confirmed real, current, and actively maintained; Windows Credential Manager support is real.** `@napi-rs/keyring` is a real npm package — a Node.js binding (via the napi-rs framework) over the Rust `keyring-rs` crate (hwchen/keyring-rs), published under the `Brooooooklyn/keyring-node` GitHub repo. It is explicitly positioned as a modern, native replacement for the deprecated `keytar` package, and is being adopted for exactly that purpose by Microsoft's own SDKs (tracked issues to migrate `@azure/identity-cache-persistence` and `msal-node-extensions` off keytar and onto `@napi-rs/keyring`). Adoption signals are strong for a small utility library: ~219,843 weekly downloads, 414 dependent packages on npm, latest version 1.3.0 published ~2 months before the document date (mid-July 2026) — consistent with active maintenance, not an abandoned package. On Windows specifically, it uses native Windows Credential Manager bindings (with a documented PowerShell-based fallback path), which directly supports the architecture's AD-6 requirement ("credentials live in Windows Credential Manager via `@napi-rs/keyring`"). No issue — this claim is well-founded.

## Fastify 5.x + single-process (Fastify serving Vite/React static build + JSON API) — pattern sanity check

**Verdict: Realistic, well-supported pattern — not an awkward incompatibility.** Serving a built Vite/React SPA plus a JSON API from a single Fastify process is a common and well-documented pattern, supported in at least two standard ways: (1) the official `@fastify/vite` plugin, which handles both Vite dev-server integration and serving the production `dist` bundle from the same Fastify process/port once built; or (2) the simpler and very common approach of `@fastify/static` pointed at the Vite `dist` directory combined with a catch-all/`setNotFoundHandler` that serves `index.html` for SPA client-side routing, alongside ordinary Fastify JSON route handlers for the API. Both are one-process, one-port setups with no separate frontend server or reverse-proxy required, matching AD-7's stated goal (single command, single process, local-only use on the PO's Windows machine). No incompatibility found; this is a standard, low-risk architectural choice for a small internal tool.

## Overall Assessment

Of the five committed version numbers, three are solid (Node 24, React 19.3.0, and the existence/health of @napi-rs/keyring as an unpinned "current" dependency), one is mildly behind (Fastify 5.11.0, ~6 weeks/2 releases stale), and one is meaningfully stale (Vite 8.0.9, ~5 months/3 minor releases behind, superseded within the same 8.x major line). None of the claims are fabricated or structurally wrong, and the single-process Fastify+Vite+React deployment model is a realistic, well-trodden pattern with first-party tooling support. Recommend refreshing the Vite pin (and optionally the Fastify pin) before this spine is treated as authoritative, or adding a note that these are point-in-time pins expected to drift.
