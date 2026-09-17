# Epic 1 Context: EquipmentCloud Connection & Overview

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic establishes the tool's foundation and its read-only connection to EquipmentCloud. The Product Owner needs a working scaffold, a secure way to store and switch between Test and Production credentials, a way to verify connectivity, and an overview of SoftwareCenter versions/sets and which customer equipment (hierarchies) they are currently assigned to — all without opening the EquipmentCloud portal. This is the read/overview half of FR1; the write/assignment half (staging and applying changes) is delivered in Epic 2, which builds directly on the connection and data-reading capability established here.

## Stories

- Story 1.1: Project Scaffold
- Story 1.2: Store EquipmentCloud Credentials Securely & Select Environment
- Story 1.3: Verify the EquipmentCloud Connection
- Story 1.4: SoftwareCenter Versions/Sets Overview
- Story 1.5: View Customer Equipment & Current Assignments

## Requirements & Constraints

- Backend is Node.js (Fastify); frontend is React (Vite + TypeScript). One start command must launch a single Fastify process that serves both the built React app and the JSON API — no separate server deployment, runs only on the Product Owner's own Windows machine.
- Only BasicAuth-secured EquipmentCloud REST endpoints are in scope. Bearer/OAuth2-secured `_oa` variants (e.g. `equipmenthub_oa`, `openissues_oa`) must never be wired in.
- EquipmentCloud credentials must never be hardcoded, written to disk/config, or committed to git — they live in Windows Credential Manager (via `@napi-rs/keyring`), one entry per environment (Test, Production).
- Two named environments must be supported from day one: `test` (`https://eqcloud-test.ad.kontron-ais.com/DEV`) and `prod` (`https://eqcloud.kontron-ais.com/{container}`), each with its own credential entry and base URL, selected via configuration — never hardcoded, never mixed.
- Connection verification uses `GET /cloudconnect/api/softwarecenter/v1/ping` (BasicAuth). A failed check must surface the raw EquipmentCloud error, not a generic message.
- For this epic, EquipmentCloud is the sole source of truth: the software overview and equipment/assignment views must reflect live data, with no local caching required.
- Code, identifiers, comments, and commit messages are English; all GUI-facing text is German.
- Success criterion for this epic: the Product Owner can see the same overview information the EquipmentCloud portal shows (software/sets and current equipment assignments) without leaving the tool.

## Technical Decisions

- Paradigm: Ports & Adapters (Hexagonal). `src/domain/` contains pure business logic and defines ports; it must never import an HTTP client, Fastify, a DB driver, or a credential library. Adapters implement those ports; only the `src/api/` (Fastify) layer wires concrete adapters together (composition root).
- Directory shape relevant to this epic: `src/adapters/equipmentcloud/` (REST client, environment-agnostic read ports), `src/adapters/credentials/` (wraps `@napi-rs/keyring`, one entry per environment), `src/api/` (Fastify routes + serves the built frontend), `frontend/` (React/Vite UI).
- Credentials never reach domain, API route handlers, or frontend code as raw values — only the EquipmentCloud adapter's construction step reads them from the credentials adapter.
- The EquipmentCloud adapter takes a base URL and credential set as configuration, keeping it environment-agnostic; this same adapter and its read ports will be reused by later epics.
- Stack versions: Node.js 24 (Active LTS), Fastify 5.12.1, Vite 8.3.0, React 19.3.0, TypeScript (current, per Vite `react-ts` template), `@napi-rs/keyring` (current).
- Starter template: scaffold the frontend via `npm create vite@latest -- --template react-ts`.
- UI styling/component kit is explicitly deferred (decide when the frontend is actually built) — not a blocker for this epic.
- No local storage/DB is needed for this epic; that work is deferred to CAP-2. Any future local cache must remain non-authoritative and rebuildable.

## Cross-Story Dependencies

- Story 1.1 (scaffold) is a prerequisite for all other stories in this epic.
- Story 1.2 (credential storage/environment selection) must exist before Story 1.3 (connection verification) can call EquipmentCloud with real credentials.
- Story 1.3 (verified connection) is the practical prerequisite for Stories 1.4 and 1.5, which both depend on a working, authenticated EquipmentCloud connection to display live data.
- This epic as a whole is a prerequisite for Epic 2 (Software Release Management & Assignment): the connection, credentials, and overview screens built here (software list, equipment hierarchy view) are reused as the basis for staging release-status and equipment-assignment `PlannedOperation`s.
