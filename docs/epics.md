---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: ["docs/specs/spec-eqcloud-portal/SPEC.md", "docs/architecture/architecture-customerportal-product-owner-2026-09-15/ARCHITECTURE-SPINE.md"]
---

# customerportal-product-owner - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for customerportal-product-owner, decomposing the requirements from SPEC.md (used in place of a PRD, per the bmad-spec lean spec-kernel path) and ARCHITECTURE-SPINE.md into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The Product Owner can manage SoftwareCenter software versions/sets and assign them to customer equipment (hierarchies) through the tool instead of manual EquipmentCloud GUI clicking. (CAP-1, now)
FR2: The Product Owner can find commonalities across OpenIssues (issues and discussions) and bundle them into larger backlog items / roadmap themes. (CAP-2, later phase — clustering mechanics still an open question in SPEC.md)

### NonFunctional Requirements

NFR1: Backend is Node.js; frontend is React.
NFR2: Only BasicAuth-secured EquipmentCloud REST API endpoints are integrated; Bearer/OAuth2-secured `_oa` endpoint variants (e.g. `equipmenthub_oa`, `openissues_oa`) are excluded.
NFR3: EquipmentCloud credentials are stored via Windows Credential Manager (`@napi-rs/keyring`); never hardcoded or committed to git.
NFR4: EquipmentCloud writes (POST/DELETE) are staged as a plan, inspectable per item, and confirmed as a whole batch before any call executes — no autonomous writes.
NFR5: Code, identifiers, comments, and commit messages are English; GUI-facing text is German.
NFR6: Data storage must support modeling and querying relationships between OpenIssues (needed for CAP-2's commonality-finding capability).
NFR7: SBOM is generated via `npm sbom` (CycloneDX format).
NFR8: Apply execution halts immediately at the first failed operation in a confirmed plan; remaining operations are not attempted.
NFR9: The tool runs as a single local process (no server deployment), only on the Product Owner's own Windows machine.
NFR10: Local storage (once it exists, from CAP-2 onward) is strictly partitioned per EquipmentCloud environment (Test/Production) — two fully separate stores, never a shared store with an environment column.

### Additional Requirements

- **Starter template** (impacts Epic 1 / Story 1): scaffold the frontend via `npm create vite@latest -- --template react-ts` (Vite 8.3.0 + React 19.3.0 + TypeScript).
- Backend framework: Fastify 5.12.1 on Node.js 24 (Active LTS, supported to Apr 2028).
- Paradigm: Ports & Adapters (Hexagonal) — `src/domain/` has zero HTTP/DB/EquipmentCloud imports; `src/adapters/{equipmentcloud,credentials,storage}/` implement its ports; `src/api/` (Fastify) is the composition root and also serves the built frontend.
- EquipmentCloud integration is environment-agnostic: `test` (`https://eqcloud-test.ad.kontron-ais.com/DEV`) and `prod` (`https://eqcloud.kontron-ais.com/{container}`), each with its own credential entry, selected via configuration.
- EquipmentCloud test-server data is reset periodically; reseeding after a reset must go through the same Plan/Apply pipeline via the REST API's POST endpoints — no separate/bypassing write path.
- A confirmed plan is single-use: discarded after Apply finishes (success or halt); continuing after a halt means building a fresh plan from current EquipmentCloud state, never replaying the old one.
- A built plan lives server-side in the Fastify process's memory, keyed by an id; it survives a browser refresh but not a process restart.
- For CAP-1, EquipmentCloud is the sole source of truth; any local cache is rebuildable and never authoritative.
- Local DB engine choice (incl. CAP-2's relationship/graph-search need, and the environment-partitioning of NFR10) is deferred to when CAP-2 work starts; when chosen, must support a user-configurable file location (the user intends a mapped network drive, `Z:`) and its reliability over a Windows network share must be checked first.

### UX Design Requirements

Not applicable — no UX design contract exists for this project.

### FR Coverage Map

FR1: Epic 1 (read/overview half) + Epic 2 (release-status/description maintenance and equipment-assignment half)
FR2: Epic 3 (future — not story-ready)

## Epic List

### Epic 1: EquipmentCloud Connection & Overview

The Product Owner can connect the tool to EquipmentCloud (Test or Production), with credentials stored securely, and see an overview of SoftwareCenter versions/sets and which customer equipment they are currently assigned to — without opening the EquipmentCloud portal.
**FRs covered:** FR1 (read/overview half)

### Epic 2: Software Release Management & Assignment

The Product Owner can maintain the description text and release state (e.g. set a new set/version to "Released", an old one to "Obsolete") of existing SoftwareCenter sets/versions, and can select customer equipment and a software version/set to build, inspect, confirm, and apply an assignment plan — replacing the recurring manual GUI process end to end. Both the release-status/description update and the equipment assignment are staged as `PlannedOperation`s (POST) through the same Plan/Apply pipeline (AD-2, AD-3, AD-8, AD-9).
**FRs covered:** FR1 (release-status/description maintenance and equipment-assignment half)

### Epic 2: Software Release Management & Assignment

The Product Owner can maintain the description text and release state (e.g. set a new set/version to "Released", an old one to "Obsolete") of existing SoftwareCenter sets/versions, and can select customer equipment and a software version/set to build, inspect, confirm, and apply an assignment plan — replacing the recurring manual GUI process end to end.

### Story 2.1: Stage a Release-Status/Description Change

As a Product Owner,
I want to stage a change (new description text, and for a set a new release state such as "Released" or "Obsolete") to an existing set/version,
So that I can prepare housekeeping changes without executing them immediately.

**Acceptance Criteria:**

**Given** I am viewing a set/version in the overview
**When** I make a change to its text (the `comments` field for a set, the `description` field for a version) and, for a set, its release state
**Then** a `PlannedOperation` (POST, target endpoint, payload per the update schema) is added to the current plan
**And** the plan shows this pending change with a human-readable summary (e.g. "Set X → state: Released")

### Story 2.2: Inspect a Planned Operation

As a Product Owner,
I want to open a pending plan item and see exactly which endpoint and JSON payload will be sent,
So that I can verify it before trusting the tool with a real change.

**Acceptance Criteria:**

**Given** the plan has at least one pending item
**When** I open it
**Then** I see its target endpoint (method + path) and the exact JSON payload that will be sent
**And** I can close the detail view without altering the plan

### Story 2.3: Stage an Equipment-Assignment Operation

As a Product Owner,
I want to select equipment and a software version/set and add "assign this to this equipment" to my current plan,
So that I can batch multiple assignments together before executing them.

**Acceptance Criteria:**

**Given** I am viewing an equipment hierarchy and the software overview
**When** I make an assignment
**Then** a `PlannedOperation` is added to the current plan
**And** it appears alongside any release-status items already staged, with a human-readable summary

### Story 2.4: Confirm and Apply the Plan

As a Product Owner,
I want to review my whole plan (release-status and assignment items together) and confirm it as one batch,
So that everything executes together instead of manual clicking in the portal.

**Acceptance Criteria:**

**Given** the plan has one or more staged items
**When** I review the list and confirm
**Then** the tool executes the `PlannedOperation`s strictly in order against EquipmentCloud (AD-3)
**And** on full success I see a summary of what was applied
**And** the plan is discarded after Apply finishes, whether by success or by halting on failure (AD-8) — continuing means building a fresh plan

### Story 2.5: See Where a Plan Halted and Why

As a Product Owner,
I want to clearly see which operation failed and why if my plan does not complete,
So that I know how to proceed without guessing.

**Acceptance Criteria:**

**Given** a confirmed plan is executing
**When** an operation fails
**Then** execution stops immediately (AD-3), and the failed operation plus the raw EquipmentCloud error are shown
**And** operations already executed before the failure are listed as done (not retried)
**And** no further operations from that plan are attempted

## Epic 3: OpenIssues Clustering (future — not story-ready)

The Product Owner can find commonalities across OpenIssues (issues and discussions) and bundle them into larger backlog items / roadmap themes.
**FRs covered:** FR2
**Note:** Blocked on open questions (clustering mechanics, local DB engine with graph/relationship support, environment-partitioned storage per NFR10/AD-4). No stories are written for this epic in this run — revisit `bmad-spec`/`bmad-architecture` for CAP-2 specifics first, then run story creation for this epic separately.

## Epic 1: EquipmentCloud Connection & Overview

The Product Owner can connect the tool to EquipmentCloud (Test or Production), with credentials stored securely, and see an overview of SoftwareCenter versions/sets and which customer equipment they are currently assigned to — without opening the EquipmentCloud portal.

### Story 1.1: Project Scaffold

As a Product Owner,
I want a working project scaffold (Fastify + React, one start command),
So that I have a functioning foundation the real features can be built on.

**Acceptance Criteria:**

**Given** the repo is checked out
**When** I run the start command
**Then** a Fastify process starts on localhost and serves the built React app
**And** opening it in a browser shows a basic landing page

### Story 1.2: Store EquipmentCloud Credentials Securely & Select Environment

As a Product Owner,
I want to securely store separate EquipmentCloud credentials for Test and Production and choose the active environment,
So that I never have to put credentials in code, config, or git.

**Acceptance Criteria:**

**Given** I start the tool for the first time
**When** I open the connection/settings screen
**Then** I can enter a username/password for Test and separately for Production
**And** confirming stores them via Windows Credential Manager (`@napi-rs/keyring`), never written to disk, config, or git
**And** I can switch which environment is active
**And** the currently active environment is clearly shown

### Story 1.3: Verify the EquipmentCloud Connection

As a Product Owner,
I want to test the connection to EquipmentCloud,
So that I immediately notice a wrong credential or network problem before doing real work.

**Acceptance Criteria:**

**Given** credentials are stored for the active environment
**When** I trigger a connection check
**Then** the tool calls `GET /cloudconnect/api/softwarecenter/v1/ping` (BasicAuth) and shows success or failure clearly
**And** a failure displays the raw EquipmentCloud error message, not a generic one

### Story 1.4: SoftwareCenter Versions/Sets Overview

As a Product Owner,
I want to see a list of SoftwareCenter software, versions, and sets with their release state,
So that I have the same information the EquipmentCloud portal shows, without leaving the tool.

**Acceptance Criteria:**

**Given** the tool is connected
**When** I open the software overview screen
**Then** I see the list of shared software/sets from EquipmentCloud with name, version(s), description, and release state
**And** the list reflects live EquipmentCloud data (no local caching required for CAP-1, per AD-10)

### Story 1.5: View Customer Equipment & Current Assignments

As a Product Owner,
I want to see which customer equipment (hierarchy) currently has which software/sets assigned,
So that I can check the current state before making any change.

**Acceptance Criteria:**

**Given** the tool is connected
**When** I select or search an equipment hierarchy
**Then** I see that equipment's currently installed/assigned software sets
**And** I do not need to switch to the EquipmentCloud portal to see this
