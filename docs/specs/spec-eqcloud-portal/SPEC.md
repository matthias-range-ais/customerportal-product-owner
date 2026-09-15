---
id: SPEC-eqcloud-portal
companions: ["../../../AGENTS.md", "../../architecture/architecture-customerportal-product-owner-2026-09-15/ARCHITECTURE-SPINE.md"]
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# EquipmentCloud Customer-Portal Tool

## Why

A pain to solve: the Product Owner repeats the same EquipmentCloud customer-portal process by hand roughly every three weeks — assigning software versions/sets to customer equipment via manual GUI clicking. It is slow and error-prone enough that it sometimes gets skipped under time pressure. Coupling the portal's REST API to a small purpose-built GUI removes the manual clicking, makes the recurring process faster and more reliable, and later extends to spotting commonalities across OpenIssues so they can be bundled into backlog items and roadmap themes instead of being tracked by hand.

## Capabilities

- **CAP-1**
  - **intent:** The Product Owner can manage SoftwareCenter software versions/sets and assign them to customer equipment (hierarchies) through the tool instead of manual EquipmentCloud GUI clicking.
  - **success:** The recurring (~3-week) software-assignment process can be completed through the tool, end to end, without manual GUI clicking in EquipmentCloud.
- **CAP-2** (later phase)
  - **intent:** The Product Owner can find commonalities across OpenIssues (issues and discussions) and bundle them into larger backlog items / roadmap themes.
  - **success:** The Product Owner can produce a bundled backlog/roadmap theme view from raw OpenIssues data without manually cross-referencing issues one by one.

## Constraints

- Backend is Node.js. Frontend is React.
- Only BasicAuth-secured EquipmentCloud REST API endpoints are in scope; Bearer/OAuth2-secured `_oa` endpoint variants (e.g. `equipmenthub_oa`, `openissues_oa`) are excluded.
- EquipmentCloud credentials are stored via OS-level secret storage (e.g. Windows Credential Manager); never hardcoded or committed to git.
- EquipmentCloud writes (POST/DELETE) are staged as a plan the user reviews (each item's target endpoint and payload inspectable) and confirms as a whole batch before any call executes — no autonomous writes. See the architecture spine's Plan/Apply model (AD-2, AD-3, AD-8, AD-9) for the exact mechanics.
- Code, identifiers, comments, and commit messages are English; GUI-facing text is German.
- Data storage must support modeling and querying relationships between OpenIssues (needed for CAP-2's commonality-finding capability) — rules out a plain flat-table-only store for that part of the system.
- SBOM is generated via `npm sbom` (CycloneDX format).

## Non-goals

- Not a replacement for the EquipmentCloud portal UI itself — the tool maps concrete recurring processes and gives an overview of work that would otherwise be done manually, not general portal administration.
- No multi-user accounts, roles, or customer-facing access — single-operator (the Product Owner) tool.

## Success signal

- The Product Owner no longer performs the recurring software-assignment process by manual GUI clicking, completes it measurably faster through the tool, and no longer skips it under time pressure.

## Open Questions

- Which storage technology satisfies both CAP-1 (simple flat entities: software versions/sets/assignments) and CAP-2 (relationship modeling + abstract/graph-like search over OpenIssues) — a single graph-capable store, a graph layer over a relational/embedded DB, or two separate stores? Deferred to architecture design, since CAP-2 is a later phase.
- What exactly counts as a "bundled theme" for CAP-2, and how are OpenIssues/discussions compared for commonality? Deferred until CAP-2 work starts.
