---
title: 'Fix SoftwareOverview.test.tsx Flakiness'
type: 'bugfix'
created: '2026-09-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `frontend/src/SoftwareOverview.test.tsx` intermittently fails a random test (~25-40% of runs), logged in `deferred-work.md` after the Sets multi-select filter story. Root cause, found via temporary diagnostic logging in this session: `SoftwareTable`'s and `SoftwareSetsSection`'s `useEffect(() => resetState(), [items])` guards (added in the "Software category tree" and "Sets multiselect filter" stories to clear stale UI state on an environment switch) also fire — redundantly — on the component's own first mount, since that's unavoidable base React behavior for any effect. Because that mount is gated behind the async `/api/software` fetch, this passive effect isn't guaranteed to flush before a test's next synchronous interaction; when it lands *after* a later `fireEvent.click`/`fireEvent.change` instead of before it, it clobbers the state that interaction just set (observed directly in logs: a row click set `expandedId`, then the mount effect fired a beat later and reset it back to `null`). This never causes a visible bug for a real user (the effect settles in milliseconds, long before a human can click), but it does race fast, synchronous test interactions.

**Approach:** Guard both effects with a `useRef`-based "skip the first run" flag, so the mount-time invocation becomes a true no-op (doesn't call the state setter at all) instead of a redundant-but-execution-order-sensitive reset to the same initial value. This removes the race entirely — a same-value reset can't clobber anything regardless of when it lands — while still resetting correctly on every *genuine* later `items` change (environment switch). No test changes needed; this is a source-only fix. Verified with 20 consecutive full-suite runs with zero failures (previously ~25-40% failure rate on the same file).

</frozen-after-approval>

## Implementation Notes

- Diagnosed via temporary `console.log` instrumentation (`SoftwareTable`'s render/effect, the row click handler, and `SoftwareOverview.load()`), removed before this commit — confirmed `load()` only ran once per test (ruling out a double-fetch/StrictMode-style cause) and that the reset effect's log line appeared *after* a click's log line in a failing run, timestamped from the same single mount.
- **First pass (superseded):** applied a `useRef`-based "skip the first run" guard to both effects, matching the frozen Intent above. Verified this fixed the flakiness (20/20 clean runs).
- **Second pass, from a Blind Hunter review of the first patch (this is the actually-shipped fix):** the review surfaced that `SoftwareOverview` always routes any refetch through an intermediate `status: 'loading'` render (`SoftwareOverview.tsx` — `load()` sets it unconditionally before fetching), and `SoftwareTable`/`SoftwareSetsSection` only render while `status === 'success'` — so any real `items` change already forces these children to fully unmount and remount, which resets their local state (`expandedId`, `selectedStates`) to its `useState` initial value for free. The "genuine items change while the same instance stays mounted" scenario the `[items]`-effects were written to guard against **cannot occur** under this architecture. Rather than keep the guarded-but-now-provably-dead effects (which the review also flagged as duplicated, not covered by a targeted regression test, and not fully correct under React StrictMode's dev-mode double-invoke), removed both effects entirely. This is simpler than the frozen Intent's planned approach and fixes the same race by construction (nothing left to race), not just by making the race harmless.
- No test changes were needed for either pass — the pre-existing "resets/clears on active environment change" tests (added by the category-tree and multiselect-filter stories) already pin down the correct *observable* behavior and continue to pass, now purely via the natural remount rather than via an effect.
- Verification: 25 consecutive `npx vitest run src/SoftwareOverview.test.tsx` runs after the second pass, 0 failures (was previously failing ~5-8 times per 20 runs before any fix). Full `npm test` + `npm run build` also green.
- Left the original flakiness entry in `deferred-work.md` untouched, per this file's established append-only convention (also applied consistently to other resolved-but-still-listed entries this session) — it now reads as historical record of the investigation trigger, resolved by this spec.

## Review Triage Log

A Blind Hunter review ran against the first-pass patch (the `useRef` guard described in the frozen Intent) and found:

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | The guard pattern was hand-duplicated identically in both components with no shared abstraction | medium | Real — same shape copy-pasted twice in one commit is a legitimate drift risk | superseded — moot once both copies were deleted rather than abstracted |
| 2 | No regression test pins down the fix; only ad hoc repeat-run loops verified it | medium | Real gap for the guard mechanism specifically | superseded — the pre-existing environment-switch tests already cover the required *observable* behavior post-deletion; no mechanism-specific test is needed for code that no longer exists |
| 3 | The guard isn't truly skipped under React StrictMode's dev-mode double-invocation (the phantom first effect run consumes the "skip" flag, so the real one resets anyway) | low | Verified: `frontend/src/main.tsx` wraps the app in `<StrictMode>`; the guard's cleanup-less ref doesn't survive a phantom mount/cleanup/remount cycle. Practically harmless (identical to the original, already-accepted "resets on every mount" behavior, and only in dev builds — StrictMode's double-invoke is stripped in production) | superseded — moot once the guard was deleted |
| 4 | The branch the guard exists to protect (`items` changing while the same instance stays mounted) is unreachable in production, since `SoftwareOverview`'s `status: 'loading'` gate forces an unmount/remount on every refetch | medium | Confirmed by reading `SoftwareOverview.tsx`: `load()` unconditionally sets `status: 'loading'` before fetching, and children render only under `status === 'success'`. This was the decisive finding — it means the effect (in either pass) was solving a problem that can't happen | **this drove the second-pass fix**: removed both effects instead of continuing to guard an unreachable branch |
| 5 | The guard's ref name (`isFirstItemsRender`) implies "first render where items has a value" but actually just tracks "has this effect run once" | low | Accurate naming critique | superseded — moot once the ref was deleted |
| 6 | The cross-reference comment between the two copies ("see the identical guard on...") has no compiler/lint enforcement to stay in sync | low | Accurate, minor | superseded — moot once both copies were deleted |

## Verification

**Commands:**
- `npm test` -- expect all backend and frontend tests green
- `npm run build` -- clean, no type errors
- `cd frontend && for i in $(seq 1 25); do npx vitest run src/SoftwareOverview.test.tsx || echo FAILED; done` -- 25 consecutive clean runs, no failures (informal repeat-run confidence check; not a permanent CI step)
