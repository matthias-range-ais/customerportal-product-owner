---
name: 'customerportal-product-owner'
type: architecture-review
purpose: adversarial-review
altitude: initiative
reviews: '../ARCHITECTURE-SPINE.md'
status: draft
created: '2026-09-15'
---

# Adversarial Review — ARCHITECTURE-SPINE.md (customerportal-product-owner)

Method: for each finding below, I constructed two implementers (human or AI agent) who each read only the spine text/diagrams quoted, never talked to each other, and each produced code that is defensible as "faithful to the AD as written." Findings are ranked by severity — how likely the divergence is to actually occur, and how bad the result is when it does.

---

## Finding 1 (HIGH) — The invariants diagram contradicts AD-1's dependency rule

**What the spine says**

AD-1 rule (prose): *"code under `src/domain/` must not import an HTTP client, Fastify, a DB driver, or a credential library. It only depends on port interfaces; adapters under `src/adapters/*` implement them."*

The "Invariants & Rules" mermaid graph, immediately above AD-1, draws:

```
Domain --> EqAdapter
Domain --> CredAdapter
Domain --> StorageAdapter
```

Arrows in this repo's other diagrams (structural seed, sequence diagram) consistently mean "calls into" / "depends on," not "is implemented by." Taken at face value, the diagram says domain depends on (points at) the three concrete adapters — the exact inversion hexagonal architecture (and AD-1's own prose) requires. The correct arrow, if drawn at all, would run `EqAdapter --> Domain` (adapter implements a port the domain defines), or the diagram should show a `Ports` node domain depends on and adapters also depend on/implement.

**Two faithful-but-incompatible implementations**

- **Agent A** reads AD-1's prose carefully: domain package defines TypeScript interfaces (`WritePort`, `CredentialPort`, `StoragePort`) in `src/domain/ports/`; `src/adapters/equipmentcloud` imports and implements those interfaces; the API layer performs dependency injection, constructing adapters and passing them into domain functions. `src/domain/` has zero import statements referencing `src/adapters/*`. Domain unit tests run with no HTTP/keyring/DB present.
- **Agent B** (e.g., an AI coding agent that leans on the diagram as the fastest artifact to parse, or a second developer who skims the rule but pattern-matches the arrow) implements exactly what is drawn: domain modules `import { EquipmentCloudAdapter } from '../adapters/equipmentcloud'` and call it directly to decide what to plan (e.g., to check current assignment state while building a `PlannedOperation`). This still technically avoids importing "an HTTP client, Fastify, a DB driver, or a credential library" *by name* (it imports the adapter module, not `node:http` or `@napi-rs/keyring` directly) — a literal-minded reading of AD-1's rule doesn't obviously forbid it, and the diagram appears to bless it.

**Why this matters**

Agent B's domain is no longer swappable or unit-testable in isolation — exactly the failure AD-1's "Prevents" clause exists to stop. When CAP-2 is built later by whoever internalized the diagram's pattern, `src/domain/openissues/` ends up importing `src/adapters/storage` directly, which breaks precisely when the local DB engine choice (currently deferred) is revisited — the one moment AD-1 was supposed to pay off. Since CAP-1 and CAP-2 are built by different people/agents at different times, there is no in-the-room conversation to catch the drift; the diagram is the artifact each will re-open when returning to this work a month or a year later.

**Suggested fix**

Redraw the diagram with a `Ports` layer domain defines and adapters implement (`EqAdapter -.implements.-> Ports`, `Domain --> Ports`), or explicitly label the existing arrows "must not exist — see AD-1" if the diagram is meant to show physical process/module layout rather than dependency direction. Add one sentence to AD-1's rule text: "No file under `src/domain/` may import anything from `src/adapters/*`, including by relative path" — closing the literal-minded loophole.

---

## Finding 2 (HIGH) — No contract for what happens after an Apply halt: retry, resume, or discard?

**What the spine says**

AD-3: *"Apply executes a confirmed plan's `PlannedOperation`s strictly in order and stops immediately on the first failed call. Remaining operations in that plan are not attempted; the failure and the raw EquipmentCloud error are surfaced before anything else runs."*

Nothing states whether the user can retry the same plan, resume from the failed item, edit the plan and re-run, or must discard it and rebuild from scratch. Nothing states whether `PlannedOperation`s already executed successfully are marked as such anywhere. This interacts badly with the Structural Seed, which says the storage adapter is "no-op/cache for CAP-1" — meaning there is, by design, nowhere durable to record "operations 1–2 of 5 already succeeded" once the halt happens.

**Two faithful-but-incompatible implementations**

- **Agent A** keeps `PlannedOperation` exactly as specified (four fields only, per AD-2 and the "no capability defines its own variant" convention). On halt, the only available action is "Discard plan" — the user must go back to the trigger screen and regenerate a fresh plan from current EquipmentCloud state. A "Retry" button, if offered, simply resubmits the entire original array from item 1.
- **Agent B** decides a bare discard-only flow is unacceptable UX for a batch of, say, 20 device assignments where item 14 failed, so adds an implicit per-operation `status: 'pending' | 'done' | 'failed'` field to the in-memory plan object so Apply can resume from the failure point on retry, re-attempting only unexecuted operations.

**Why this matters**

Both are defensible readings of an AD that says only "halts on first failure" and never addresses retry semantics. But they are not just different UX — they are operationally different against a real API: for any EquipmentCloud endpoint that is not idempotent (e.g., `post_DeviceManagement_softwaresets` creating a new set, `post_..._versions` creating a new version — confirmed present in `openapi_equipmentcloud_preview.yaml`), Agent A's "resubmit the whole plan" retry will re-run already-successful creates and either duplicate resources or 409/error on the second attempt, which is arguably worse than the original halt. Agent B's approach avoids that, but silently extends the `PlannedOperation` contract that AD-2 says no capability should extend on its own — and if Agent B's extension isn't the one that ships, whoever builds the API layer's `/apply` endpoint next (possibly for CAP-2) has to guess which retry model to match.

**Suggested fix**

Add an AD (or extend AD-3) that states explicitly: (a) whether Apply is a one-shot, discard-and-rebuild-only operation, or resumable; (b) if resumable, that partial-success state is part of the `PlannedOperation` contract (name the field) rather than an implementation detail each builder invents; (c) whether retry is even offered for operations whose EquipmentCloud endpoint is non-idempotent — which may require tagging each `PlannedOperation` (or its `method`/`targetPath` class) with an idempotency hint.

---

## Finding 3 (HIGH) — `PlannedOperation` has no model for reads, pagination, or staleness between Plan and Apply

**What the spine says**

AD-2 defines only the write-side shape: `PlannedOperation { method: POST|DELETE, targetPath, payload, description }`. Building a plan necessarily requires *reading* current EquipmentCloud state first (e.g., which software versions/sets are already assigned to which equipment, to compute a diff) — the sequence diagram shows `A->>D: build PlannedOperation[]` as a single opaque step, with no read port, pagination, or freshness concept anywhere in the spine.

Two specific gaps fall out of this:

1. **Pagination.** The real API paginates list endpoints (confirmed in the OpenAPI file — list responses carry `controls` with `next`/`prev`/`pagination_limit`). Nothing in AD-1/AD-4 says whether the domain-facing read port returns a fully-materialized collection (adapter loops through pages internally) or a page-at-a-time cursor the domain must drive.
2. **Staleness.** Nothing addresses what happens if EquipmentCloud state changes between "plan built" and "user confirms Apply" (plausible for a 3-week-cadence tool a human reviews at leisure, and doubly plausible if the same equipment is also being edited by someone else in the EquipmentCloud GUI concurrently). There is no re-validation step, no ETag/version field in the `PlannedOperation` shape, and no rule saying Apply must (or must not) re-check state before executing.

**Two faithful-but-incompatible implementations**

- **Agent A** builds a read port `listAllAssignments(hierarchyId): Promise<Assignment[]>` that hides pagination entirely inside the adapter and returns one fully-materialized array — matching AD-1's "domain only depends on ports" cleanly, since the domain never sees an HTTP page cursor.
- **Agent B**, working on a different read path (e.g., CAP-2 pulling OpenIssues, which is likely to be a much larger, more frequently-paginated collection), builds a port that mirrors the API's own pagination (`listPage(cursor): Promise<{items, next}>`), because materializing "all OpenIssues" in one call seems wasteful and no AD said reads must be fully materialized.

Neither is wrong per the spine text, but the two read-port shapes are incompatible patterns living in the same codebase; whichever pattern CAP-1 established becomes an unstated precedent CAP-2's author either has to blindly copy or consciously break, with no AD to appeal to either way.

Separately, on staleness:

- **Agent A** treats a confirmed plan as valid indefinitely; Apply blindly replays the staged `payload` values regardless of how much wall-clock time or intervening GUI activity has occurred. A device reassigned by someone else in the interim gets silently overwritten with no signal to the user beyond whatever EquipmentCloud's own response says (which may well be a silent 200, since a POST assign replaces the state unconditionally).
- **Agent B** adds a re-validation call at Apply time that re-fetches the target's current state and aborts with a "plan is stale, please regenerate" error if it diverges from what the plan was built against — a reasonable safety behavior, but one AD-3 doesn't ask for and doesn't define the error shape for ("stale plan" isn't "the raw EquipmentCloud error" AD-3 promises to surface).

**Suggested fix**

Add an AD covering the read side of the port contract: specify whether adapters fully materialize paginated collections before returning to domain (recommended, for AD-1 consistency), and add a staleness rule to AD-2/AD-3 — e.g., "a plan is a snapshot; Apply does not re-validate state before executing" (accepting the risk explicitly) — or the opposite, plus the error contract for it. Either answer is fine; the point is the spine currently gives none.

---

## Finding 4 (MEDIUM) — The deferred "test-environment reseeding" decision creates an AD-2 loophole that bites now, not at CAP-2

**What the spine says**

Deferred section: *"Test-environment reseeding tooling — the EquipmentCloud test server ... is reset periodically and test data must be reseeded via the same REST API's POST endpoints; whether this becomes a small dedicated script or reuses the Plan/Apply pipeline is not yet decided."*

This is filed under "Deferred," alongside genuinely-later CAP-2 concerns (local DB engine, clustering mechanics). But CAP-1 is "being built now," and its own AD-4 architecture requires a working `test` environment to develop and demo against. If the test server resets periodically, the developer needs reseeding *during CAP-1 development*, i.e., immediately — this is not a "revisit when CAP-2 starts" item, it is a live gap today.

**Two faithful-but-incompatible implementations**

- **Agent A**, needing to reseed test data to keep developing CAP-1, writes a small standalone script that calls the EquipmentCloud test API's POST endpoints directly via the adapter's underlying HTTP client (or even a raw `fetch`), bypassing domain/`PlannedOperation`/human confirmation entirely — reasoning that AD-2's binding clause ("every *capability* that writes to EquipmentCloud") doesn't cover a dev-only seed script, since a seed script isn't a capability.
- **Agent B** insists all EquipmentCloud POSTs, including seed data, must flow through Plan/Apply per the spirit of AD-1/AD-2, and builds the seeding tool as a thin domain module that produces `PlannedOperation[]` and reuses the confirm-then-Apply UI — which is safe, but re-litigates a batch-confirmation UI for every routine test reset, and (per Finding 2) inherits whatever retry/resume ambiguity that pipeline has.

**Why this matters**

Both readings are legitimate under the literal AD-2 binding language ("every capability that writes..."), because a seed script arguably isn't "a capability." That is exactly the loophole: it lets *any* future one-off write tool (not just seeding — imagine a quick data-fix script, or an AI agent asked to "just patch this one record") justify calling the EquipmentCloud adapter directly and skipping human confirmation, on the grounds that AD-2's binding clause only names capabilities. That undermines the core safety property the whole Plan/Apply model exists for (SPEC.md: "no autonomous writes against the production API"), and it's not a hypothetical CAP-2-era risk — the seeding need exists the moment CAP-1 development starts hitting the `test` environment.

**Suggested fix**

Either (a) decide now, not later: reseeding reuses Plan/Apply, full stop — move this out of "Deferred" — or (b) if a dedicated script is allowed, add an explicit AD carving out that exception with guardrails (e.g., "only permitted against the `test` credential entry, never `prod`; must still log every call it makes"). Also tighten AD-2's binding language from "every capability that writes to EquipmentCloud" to "every write to EquipmentCloud, regardless of whether it originates from a named capability" to close the loophole for future one-off tooling.

---

## Finding 5 (MEDIUM) — "No-op/cache" storage adapter for CAP-1 is ambiguous enough to produce different persistence guarantees

**What the spine says**

Structural Seed: `storage/ # local persistence adapter — no-op/cache for CAP-1, real store from CAP-2 (deferred)`. Deferred section frames the *local DB engine* as deferred, but says nothing about whether the in-process plan/cache behavior for CAP-1 is itself decided.

**Two faithful-but-incompatible implementations**

- **Agent A** reads "no-op" as the operative word: the storage adapter does nothing; a built plan lives only in React component state on the frontend. Refreshing the browser tab between "plan built" and "user confirms" loses the plan entirely, forcing a rebuild.
- **Agent B** reads "cache" as the operative word: the storage adapter keeps an in-memory (non-persistent-to-disk, so still consistent with "local DB engine deferred") map of `planId -> PlannedOperation[]` inside the Fastify process, so a browser refresh doesn't lose an in-progress plan (only a server restart does).

**Why this matters**

Both satisfy the literal "no-op/cache" phrase (it's written as if the two are interchangeable, but they are not). This determines a real, user-visible behavior — does refreshing the page during review lose your work? — that the single developer working alone might not notice is undocumented, but that a second builder (or a later revision of the same feature) could reasonably assume works the other way, especially once Finding 2's retry/resume question is answered (resumable Apply essentially *requires* Agent B's behavior, since a plan object needs to persist somewhere across the confirm→execute boundary at minimum).

**Suggested fix**

State explicitly, even for CAP-1: plans are ephemeral per-request (client holds full state, server is stateless across plan-build/confirm) vs. server holds an in-memory plan store keyed by an id. This single sentence also resolves part of Finding 2.

---

## Finding 6 (LOW-MEDIUM) — AD-2's `method` enum disagrees with SPEC.md's mutating-verb list

**What the spine says**

AD-2: `PlannedOperation { method: POST|DELETE, ... }` — no `PUT`.
SPEC.md constraint: *"Every mutating EquipmentCloud API call (POST/PUT/DELETE) must be shown to the user in full ... and explicitly confirmed."*

Checking `openapi_equipmentcloud_preview.yaml`, the SoftwareCenter/DeviceManagement write endpoints actually used by CAP-1 (`post_DeviceManagement_software*`, `post_..._softwaresets`, `post_..._versions_version_id_assign`, etc.) are indeed all GET/POST/DELETE with no PUT — so AD-2's narrower enum happens to match today's real usage. But the spine's own companion contract (SPEC.md) explicitly lists PUT as an in-scope mutating verb, and the spine doesn't reconcile that.

**Two faithful-but-incompatible implementations**

- **Agent A** treats AD-2's enum as authoritative and defines the TypeScript union as literally `'POST' | 'DELETE'`. If a future SoftwareCenter endpoint (or a CAP-2 write) needs PUT, this type doesn't compile without modification, and Agent A's first instinct — reasonably, per AD-2's "no capability defines its own variant" convention — is to widen the shared union type.
- **Agent B**, building against a PUT-only endpoint discovered later, doesn't want to touch the shared contract type (fear of scope creep) and instead encodes PUT semantics as a POST with a method-override marker in `payload` or `description` that the adapter special-cases — a private, undocumented variant of the exact kind AD-2's "Prevents" clause is trying to rule out.

**Why this matters**

Low likelihood given today's actual endpoint set, but real: it's a live disagreement between two documents that both claim to be authoritative (spine vs. SPEC "canonical contract"), and it's the kind of thing that resolves itself silently and differently depending on which document whoever hits the PUT case first happens to be looking at.

**Suggested fix**

Either narrow SPEC.md's constraint to match AD-2 (state that only POST/DELETE are used in practice, drop PUT from the sentence) or widen AD-2's enum to `POST|PUT|DELETE` for future-proofing and note that CAP-1 doesn't currently exercise PUT.

---

## Finding 7 (LOW) — AD-5's enforcement point is unspecified, and AD-3's "raw EquipmentCloud error" doesn't cover pre-flight/local rejections

**What the spine says**

AD-5: *"the adapter only calls EquipmentCloud paths whose OpenAPI `security:` block is `BasicAuth`."* This is written as an adapter-level constraint. AD-3 promises that on halt, "the raw EquipmentCloud error" is surfaced.

**Two faithful-but-incompatible implementations**

- **Agent A** validates `targetPath` against the BasicAuth allowlist at plan-*build* time in domain code, so a user is never shown, and can never confirm, a plan item that would be rejected. Fails fast before human review.
- **Agent B** implements AD-5 exactly where it's written — inside the adapter, checked only when Apply actually attempts the call. A user can review and confirm a plan that includes an `_oa` path (nothing stopped it from being built), and only discovers the problem when Apply halts on item 1 — except there is no "raw EquipmentCloud error" in this case, because the adapter refused locally without making an HTTP call at all. AD-3's contract for what gets surfaced doesn't define this failure class (a local pre-flight rejection, or for that matter a network timeout/DNS failure) versus an actual HTTP error response from EquipmentCloud.

**Why this matters**

Mostly a UX rough edge rather than a data-corruption risk, but it means two implementations differ on when the user finds out about an invalid plan (before vs. after they've spent time reviewing/confirming it), and the halt-error UI one team builds (assuming a real HTTP error body to render) may not have a code path for the other team's local-rejection or network-failure case.

**Suggested fix**

State explicitly that AD-5's scope check happens at plan-build time (not just Apply time), and broaden AD-3's language from "the raw EquipmentCloud error" to cover the three distinct failure classes (local validation/scope rejection, network/transport failure, EquipmentCloud HTTP error response) with a note on what's shown for each.

---

## Finding 8 (LOW) — Logging is deferred, but the one place credentials legitimately exist is the adapter — nothing stops a debug log from leaking them

**What the spine says**

Deferred: *"Logging/observability conventions — not yet needed for a single-user local tool; add if a real need appears."*
AD-6: *"Only the EquipmentCloud adapter's construction step reads them; domain code, API routes, and the frontend never see a raw credential."*

AD-6 only constrains who *sees* a credential (domain/API/frontend must not); it says nothing about what the adapter itself may do with it once constructed — including logging the outgoing request for debugging, which for BasicAuth means logging the `Authorization` header verbatim.

**Two faithful-but-incompatible implementations**

- **Agent A** never adds request/response logging to the adapter — AD-6 is satisfied trivially, nothing to leak.
- **Agent B**, debugging a failed Apply call (motivated by AD-3's own requirement to surface useful error detail), adds `console.log`/file logging of the outgoing request inside the EquipmentCloud adapter — the *only* place in the codebase where this is even possible per AD-6 — and captures the BasicAuth header along with it, writing credentials to a log file or console history that AD-6's intent clearly did not want persisted anywhere.

**Why this matters**

Low probability of being the first thing to go wrong on a single-user local tool, but high consequence if it does (credential leak to a log file that might get pasted into a bug report, shared screen, or committed accidentally). It's a real gap between what AD-6 says (who may *see* a raw credential) and what it doesn't say (what may be done with one once legitimately held).

**Suggested fix**** Extend AD-6 with one line: "the EquipmentCloud adapter must never log a full outgoing request/response including the `Authorization` header, even for debugging" — cheap to state now, before any debug logging gets added under time pressure.

---

## Summary table

| # | Finding | Severity | Type of gap |
| --- | --- | --- | --- |
| 1 | Diagram shows Domain → Adapters, inverting AD-1 | HIGH | Diagram/AD-text disagreement |
| 2 | No retry/resume contract after Apply halts; storage is no-op | HIGH | Post-halt ambiguity + Deferred-that-bites-now |
| 3 | No read/pagination/staleness model in PlannedOperation contract | HIGH | PlannedOperation contract gap |
| 4 | Test-reseeding deferral creates an AD-2 "not a capability" loophole | MEDIUM | Deferred-that-bites-before-CAP-2 |
| 5 | "No-op/cache" storage wording permits two different persistence guarantees | MEDIUM | Ambiguous AD/seed wording |
| 6 | AD-2 method enum (POST\|DELETE) vs SPEC.md (POST/PUT/DELETE) | LOW-MEDIUM | Cross-document inconsistency |
| 7 | AD-5 enforcement point unstated; AD-3 error surface doesn't cover local/pre-flight failures | LOW | PlannedOperation/halt contract gap |
| 8 | AD-6 doesn't prevent adapter-level debug logs from leaking credentials | LOW | Under-specified AD scope |
