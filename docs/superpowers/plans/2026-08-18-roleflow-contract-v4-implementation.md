# RoleFlow Contract v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the main session. Dispatch a fresh-context subagent only when the same session would otherwise author and review the same RoleFlow deliverable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved contract-first, multi-department RoleFlow evolution with goal-first planning, deferred parallel decomposition, mandatory issue priority, work-plan v4, handoff v2, fresh-eye review, capability-aware session handoff, deterministic lifecycle/reporting, safe migration, guarded rollback, and exactly four public skills.

**Architecture:** Keep the four skills as orchestration entry points. Add focused shared modules for department-neutral planning structure, delivery transitions, migration, project snapshot normalization, and host capability/tool mapping; retain the existing transport-free model and make all Linear writes occur through host tools after validation and live re-read.

**Tech Stack:** Node.js 24 ESM, Node test runner, JSON Schema draft 2020-12, Ajv as a test-only schema compiler, Markdown skills/references, Claude/Codex plugin manifests.

**Execution Mode:** Inline execution. The main agent performs implementation tasks sequentially in one context. A passed review produced in the same session as the deliverable requires a fresh-context reviewer subagent; when the host cannot provide one, execution stops at `In Review` and emits a resume handoff.

---

## File Map

Create these focused modules:

- `scripts/delivery-lifecycle.mjs`: canonical delivery modes, phases, logical states, transition matrix, and typed verification validation.
- `scripts/work-structure.mjs`: goal-structure rules, logical phases, deferred outcome decomposition, priority inheritance/defaulting, dependency minimization, and parallel-wave calculation.
- `scripts/project-snapshot.mjs`: normalize physical Linear status and persisted delivery phase into logical issue state.
- `scripts/migration.mjs`: normalize work plans v1-v3 and handoffs v1, produce diagnostics, migration plans, and local artifact rollback.
- `scripts/migrate-contract.mjs`: transport-free migration CLI.
- `scripts/linear-tool-mapping.mjs`: canonical priority/health/relation mappings and tool operation classification.
- `scripts/execution-profile.mjs`: host-neutral session policy, model class, effort profile, and fresh-review capability decisions.
- `schemas/project-snapshot.schema.json`: packaged report input contract.
- `schemas/migration-plan.schema.json`: migration preview/apply/rollback contract.
- `references/decomposition-policy.md`: goal structure, claim-time decomposition, dependency minimization, and parallel-wave policy.
- `references/execution-profiles.md`: inline execution, fresh-eye review, and capability-aware session/model/effort handoff.
- `test/delivery-lifecycle.test.mjs`: complete transition matrix tests.
- `test/work-structure.test.mjs`: goal planning, no-early-task invariant, priority policy, minimal dependency graph, and parallel waves.
- `test/project-report.test.mjs`: logical queues, grouping, diagnostics, and action ranking.
- `test/migration.test.mjs`: v1-v3 and handoff v1 golden migrations, idempotency, rollback, and decision gates.
- `test/hook-entry.test.mjs`: prompt routing and current Linear tool classification.
- `test/linear-tool-mapping.test.mjs`: canonical-to-host mapping tests.
- `test/execution-profile.test.mjs`: same-session review and capability-aware next-session routing.
- `test/schema-parity.test.mjs`: schema compilation and representative validator parity.
- `evals/evals.json`: behavior eval prompts and expected outcomes.
- `evals/trigger-evals.json`: should-trigger and near-miss prompts.

Modify these existing files:

- `package.json`
- `pnpm-lock.yaml`
- `schemas/work-plan.schema.json`
- `schemas/handoff.schema.json`
- `scripts/lib.mjs`
- `scripts/validate-work-plan.mjs`
- `scripts/validate-handoff.mjs`
- `scripts/project-lifecycle.mjs`
- `scripts/build-project-report.mjs`
- `scripts/hook-entry.mjs`
- `scripts/work-lock.mjs`
- `test/work-lock.test.mjs`
- `tests/run-tests.mjs`
- `references/delivery-lifecycle.md`
- `references/project-lifecycle.md`
- `references/legacy-compatibility.md`
- `references/software-work.md`
- `references/host-adapters.md`
- `references/artifact-routing.md`
- `README.md`
- all four `skills/*/SKILL.md`
- `test/architecture.test.mjs`
- both plugin manifests when the release version is selected.

## Task 1: Establish the TDD and Schema Gate

**Files:**

- Modify: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `test/schema-parity.test.mjs`
- Modify: `test/architecture.test.mjs`

- [ ] **Step 1: Install the test-only JSON Schema compiler**

Run:

```bash
pnpm add -D ajv@latest
```

Expected: `package.json` gains an Ajv dev dependency and `pnpm-lock.yaml` is created. Runtime scripts must not import Ajv.

- [ ] **Step 2: Replace package-script recursion through npm**

Change the check script to:

```json
{
  "scripts": {
    "test": "node --test test/*.test.mjs tests/run-tests.mjs",
    "lint": "node --check scripts/*.mjs test/*.test.mjs tests/run-tests.mjs",
    "check": "pnpm run lint && pnpm run test"
  }
}
```

- [ ] **Step 3: Write a failing schema compilation and parity test**

Use `Ajv2020` from `ajv/dist/2020.js`. Load every file under `schemas/`, compile it, and assert representative unknown properties are rejected by both JSON Schema and the packaged validator.

The first parity cases are:

```javascript
test("schemas compile and reject undeclared contract fields", async () => {
  const schema = JSON.parse(await readFile(fixture("../../schemas/work-plan.schema.json"), "utf8"));
  const validateWorkPlanSchema = ajv.compile(schema);
  const validWorkPlanV4 = JSON.parse(await readFile(fixture("valid-work-plan-v4.json"), "utf8"));
  const plan = structuredClone(validWorkPlanV4);
  plan.project.unexpected = true;
  assert.equal(validateWorkPlanSchema(plan), false);
  assert.match(validateWorkPlan(plan).join("\n"), /unexpected|additional propert/u);
});
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
pnpm exec node --test test/schema-parity.test.mjs
```

Expected: FAIL because v4 schemas and strict unknown-field validation do not exist.

- [ ] **Step 5: Add an architecture assertion for exactly four source skills**

Keep the existing directory assertion and add a recursive distribution assertion that rejects a second nested `skills/**/SKILL.md` tree in packaged fixtures.

- [ ] **Step 6: Commit boundary when explicitly authorized**

```bash
git add package.json pnpm-lock.yaml test/schema-parity.test.mjs test/architecture.test.mjs
git commit -m "test: establish RoleFlow v4 contract gates"
```

## Task 2: Add the Canonical Delivery Lifecycle

**Files:**

- Create: `scripts/delivery-lifecycle.mjs`
- Create: `test/delivery-lifecycle.test.mjs`
- Modify: `scripts/lib.mjs`
- Modify: `scripts/project-lifecycle.mjs`

- [ ] **Step 1: Write the transition matrix tests**

Define table-driven cases for every allowed and rejected transition. Include direct completion for `decision` and `artifact-review`, the two action-mode delivery phases, changes requested, failed verification, blocking, and cancellation.

Use this public API in the test:

```javascript
import {
  ACTION_DELIVERY_MODES,
  DELIVERY_MODES,
  DELIVERY_PHASES,
  isOpenLogicalState,
  isStartedLogicalState,
  validateDeliveryVerification,
  validateHandoffTransition,
} from "../scripts/delivery-lifecycle.mjs";
```

Representative RED assertion:

```javascript
assert.deepEqual(validateHandoffTransition({
  type: "review",
  reviewDecision: "passed",
  deliveryMode: "software-merge",
  from: "in-review",
  to: "done",
}), ["passed action-mode review must transition to ready-to-deliver"]);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec node --test test/delivery-lifecycle.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal lifecycle module**

Export frozen mode and phase lists, action-mode membership, logical open/started state sets, typed verification checks, and a pure transition validator. Do not include Linear transport or rendering.

The transition validator returns a deduplicated array of human-readable errors. It must reject unknown states, mode/check mismatches, direct action-mode completion after review, and completion with a failed terminal check.

- [ ] **Step 4: Replace duplicated lifecycle constants**

Import delivery constants from `scripts/delivery-lifecycle.mjs` in `scripts/lib.mjs`. Replace `STARTED_ISSUE_STATES` and `OPEN_ISSUE_STATES` in `scripts/project-lifecycle.mjs` with logical-state helpers.

- [ ] **Step 5: Run focused and existing lifecycle tests**

Run:

```bash
pnpm exec node --test test/delivery-lifecycle.test.mjs tests/run-tests.mjs
```

Expected: PASS after updating any old test that encoded the obsolete state omission.

- [ ] **Step 6: Commit boundary when explicitly authorized**

```bash
git add scripts/delivery-lifecycle.mjs scripts/lib.mjs scripts/project-lifecycle.mjs test/delivery-lifecycle.test.mjs tests/run-tests.mjs
git commit -m "feat: centralize RoleFlow delivery transitions"
```

## Task 3: Introduce Work Plan v4

**Files:**

- Modify: `schemas/work-plan.schema.json`
- Create: `scripts/work-structure.mjs`
- Modify: `scripts/lib.mjs`
- Modify: `scripts/validate-work-plan.mjs`
- Create: `test/work-structure.test.mjs`
- Create: `tests/fixtures/valid-work-plan-v4.json`
- Create: `tests/fixtures/legacy-work-plan-v2.json`
- Modify: `tests/run-tests.mjs`

- [ ] **Step 1: Add failing v4 validation tests**

Assert that a v4 apply plan rejects:

- missing live `projectStatus`;
- empty lifecycle completion criteria;
- a task without an outcome parent;
- string terminal verification;
- a verification object whose mode differs from the delivery mode;
- unknown object properties;
- Ready with a native or external blocker.
- `goal-structure` containing an execution task;
- `outcome-decomposition` without `sourceOutcomeKey`;
- a decomposition child outside the claimed outcome;
- a new issue with priority `none` or missing priority;
- a phase with empty entry or exit criteria;
- a phase referencing an unknown milestone.

Also assert that a Project-level decision without `parentKey` remains valid.

Add decomposition tests using this API:

```javascript
import {
  buildParallelWaves,
  resolveNewIssuePriority,
  validatePlanningStructure,
} from "../scripts/work-structure.mjs";

assert.deepEqual(buildParallelWaves([
  { key: "research", blockedByKeys: [] },
  { key: "copy", blockedByKeys: [] },
  { key: "launch", blockedByKeys: ["research", "copy"] },
]), [["copy", "research"], ["launch"]]);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm exec node --test tests/run-tests.mjs
```

Expected: FAIL on the new v4 expectations.

- [ ] **Step 3: Update the JSON Schema**

Set canonical `schemaVersion` to 4. Replace delivery verification strings with objects requiring `mode` and `check`. Add `planningStage`, optional logical `phases`, issue `phaseKey`, and conditional `sourceOutcomeKey`. Add conditional requirements:

```json
{
  "if": { "properties": { "mode": { "const": "apply" } } },
  "then": {
    "properties": {
      "project": { "required": ["projectStatus"] }
    }
  }
}
```

Require non-empty lifecycle completion criteria when lifecycle exists. Require `parentKey` for tasks and forbid it for outcomes. New v4 issues accept only `urgent`, `high`, `normal`, or `low`; legacy readers may continue to accept `none`.

- [ ] **Step 4: Implement department-neutral work structure rules**

Implement `validatePlanningStructure`, `resolveNewIssuePriority`, and `buildParallelWaves` in `scripts/work-structure.mjs`.

`goal-structure` permits outcomes and blocking decisions but no tasks. `outcome-decomposition` requires exactly one claimed source outcome and permits only direct task or decision children. Priority resolution uses explicit priority first, then parent outcome priority, then the documented `normal` default and returns the source as `explicit`, `inherited`, or `policy-default` for reporting.

`buildParallelWaves` performs a deterministic topological layering over the necessary `blockedByKeys` graph. It rejects cycles but does not invent or remove dependencies; the skill is responsible for proposing only dependencies justified by real data, authority, or delivery prerequisites.

- [ ] **Step 5: Update the packaged validator**

Keep read compatibility for versions 1-3. Validate version 4 strictly, including unknown fields and typed verification. Remove natural-language `TERMINAL_DELIVERY_PATTERNS` after migration tests no longer rely on it.

- [ ] **Step 6: Update CLI usage and outputs**

`validate-work-plan.mjs --apply` must reject v1-v3 plans for new mutations with a migration-required error while still permitting read-only validation without `--apply`.

- [ ] **Step 7: Run schema and plan tests**

Run:

```bash
pnpm exec node --test test/schema-parity.test.mjs test/work-structure.test.mjs tests/run-tests.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit boundary when explicitly authorized**

```bash
git add schemas/work-plan.schema.json scripts/work-structure.mjs scripts/lib.mjs scripts/validate-work-plan.mjs test/work-structure.test.mjs tests/fixtures tests/run-tests.mjs
git commit -m "feat: add goal-first work plan v4"
```

## Task 4: Introduce Handoff v2 and Safe Rendering

**Files:**

- Modify: `schemas/handoff.schema.json`
- Create: `scripts/execution-profile.mjs`
- Modify: `scripts/lib.mjs`
- Modify: `scripts/validate-handoff.mjs`
- Modify: `scripts/render-work-comment.mjs`
- Create: `tests/fixtures/valid-handoff-v2.json`
- Create: `test/execution-profile.test.mjs`
- Modify: `tests/run-tests.mjs`

- [ ] **Step 1: Add failing handoff v2 tests**

Cover all six event types and the transition matrix. Add explicit rejection tests for missing delivery, stale observed issue timestamps, local evidence rendered through `file:` or Markdown links, completed phases with failed checks, a `software-merge` review that attempts direct Done, and a passed review without an independence method.

Use a separate live-state validator:

```javascript
validateHandoffAgainstIssue(handoff, {
  id: "LDK-123",
  updatedAt: "2026-08-18T10:01:00.000Z",
  logicalState: "in-review",
});
```

Add capability-aware execution tests:

```javascript
assert.deepEqual(resolveReviewExecution({
  sameSession: true,
  hostCapabilities: { subagents: true, newSession: false },
}), {
  action: "fresh-subagent-review",
  maySelfReview: false,
});

assert.deepEqual(resolveReviewExecution({
  sameSession: true,
  hostCapabilities: { subagents: false, newSession: false },
}), {
  action: "stop-at-handoff",
  maySelfReview: false,
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm exec node --test tests/run-tests.mjs
```

Expected: FAIL because v2 fields and live-state validation are absent.

- [ ] **Step 3: Update the handoff schema**

Set canonical version to 2. Add event types `delivery` and `verification`, typed observed state, logical transition, typed evidence with visibility, required delivery checks, required `review.independence` for passed reviews, and optional `nextExecution` with abstract session, model, and effort values.

- [ ] **Step 4: Implement structural and live validation**

Keep `validateHandoff` transport-free and structural. Add `validateHandoffAgainstIssue` for stale-state and transition checks. A passed review accepts `fresh-session`, `fresh-subagent`, or `external-reviewer`; it rejects same-context self-review. Update the CLI with optional `--current-issue <snapshot.json>` and require it when `--for-mutation` is supplied.

- [ ] **Step 5: Implement capability-aware execution profiles**

In `scripts/execution-profile.mjs`, export `resolveReviewExecution` and `resolveNextExecutionProfile`. These are pure decisions over host capabilities and abstract policy; they do not create sessions or invoke models.

For same-session review, choose a fresh reviewer subagent when available, otherwise stop at handoff. For lifecycle handoff, map role phase and risk to `reuse`, `new-preferred`, or `new-required`, plus `fast`, `standard`, or `reasoning` model class and `low`, `medium`, or `high` effort. Host skills perform the actual dispatch only when supported.

- [ ] **Step 6: Update rendering**

Render only shared evidence kinds. Preserve v1 rendering for read compatibility. The human comment may state that review was independent but never emits session ID, model ID, effort controls, prompts, observed timestamps, raw transition JSON, local paths, lock data, or validator payloads.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm exec node --test test/delivery-lifecycle.test.mjs test/execution-profile.test.mjs tests/run-tests.mjs
```

Expected: PASS with v1 compatibility and v2 canonical writes.

- [ ] **Step 8: Commit boundary when explicitly authorized**

```bash
git add schemas/handoff.schema.json scripts/execution-profile.mjs scripts/lib.mjs scripts/validate-handoff.mjs scripts/render-work-comment.mjs test/execution-profile.test.mjs tests/fixtures/valid-handoff-v2.json tests/run-tests.mjs
git commit -m "feat: add independent handoff v2 execution"
```

## Task 5: Build Migration and Local Rollback

**Files:**

- Create: `schemas/migration-plan.schema.json`
- Create: `scripts/migration.mjs`
- Create: `scripts/migrate-contract.mjs`
- Create: `test/migration.test.mjs`
- Create: `tests/fixtures/migrations/work-plan-v1-to-v4.json`
- Create: `tests/fixtures/migrations/work-plan-v2-to-v4.json`
- Create: `tests/fixtures/migrations/work-plan-v3-to-v4.json`
- Create: `tests/fixtures/migrations/handoff-v1-to-v2.json`

- [ ] **Step 1: Write golden migration tests**

Assert exact normalized outputs for each legacy version. Add decisions for ambiguous delivery, missing task parent, mixed terminal boundaries, lifecycle without criteria, an unknown planning stage, and missing legacy priority. Existing priority `none` remains readable but migration must not silently change that planning commitment.

Required API:

```javascript
const input = JSON.parse(await readFile(fixture("legacy-work-plan-v2.json"), "utf8"));
const expectedResult = JSON.parse(await readFile(fixture("migrations/work-plan-v2-to-v4.json"), "utf8"));
const result = migrateWorkPlan(input, { targetVersion: 4 });
assert.deepEqual(result, expectedResult);
assert.equal(result.eligibleForApply, true);
```

- [ ] **Step 2: Add property-style invariants**

For every fixture assert:

```javascript
assert.deepEqual(migrateWorkPlan(result.artifact).artifact, result.artifact);
assert.equal(result.diagnostics.decisions.length > 0, !result.eligibleForApply);
```

- [ ] **Step 3: Verify RED**

Run:

```bash
pnpm exec node --test test/migration.test.mjs
```

Expected: FAIL because the migration module does not exist.

- [ ] **Step 4: Implement pure migration functions**

Export `migrateWorkPlan`, `migrateHandoff`, `buildMigrationPlan`, `writeMigrationSnapshot`, and `restoreMigrationArtifact`. Action-mode inference requires explicit contract evidence. Generic verbs do not infer delivery. Infer `outcome-decomposition` only when one unambiguous source outcome and direct child structure already exist; otherwise emit a planning-stage decision. Preserve legacy missing/`none` priority as a diagnostic for separate reconciliation rather than mutating it during contract migration.

- [ ] **Step 5: Implement the transport-free CLI**

Supported commands:

```text
migrate-contract.mjs preview <input.json> --output <plan.json>
migrate-contract.mjs apply <input.json> --plan <plan.json> --output <artifact.json>
migrate-contract.mjs rollback-preview --plan <plan.json>
migrate-contract.mjs rollback-apply --plan <plan.json>
```

Apply verifies source hash, unresolved decisions, output path safety, and target schema before atomic write. Local migration state lives under ignored `.linear-ops/migrations/` with mode `0600`.

- [ ] **Step 6: Test rollback conflicts**

Use temporary directories. Assert restore succeeds when the after-file is unchanged and refuses when another process changed it.

- [ ] **Step 7: Run migration and schema tests**

Run:

```bash
pnpm exec node --test test/migration.test.mjs test/schema-parity.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit boundary when explicitly authorized**

```bash
git add schemas/migration-plan.schema.json scripts/migration.mjs scripts/migrate-contract.mjs test/migration.test.mjs tests/fixtures/migrations
git commit -m "feat: migrate legacy RoleFlow contracts safely"
```

## Task 6: Normalize Project Snapshots and Rebuild Reports

**Files:**

- Create: `schemas/project-snapshot.schema.json`
- Create: `scripts/project-snapshot.mjs`
- Modify: `scripts/project-lifecycle.mjs`
- Modify: `scripts/build-project-report.mjs`
- Create: `test/project-report.test.mjs`
- Modify: `tests/fixtures/project-snapshot.json`

- [ ] **Step 1: Add failing normalization tests**

Cover physical custom states and fallback phases. A Completed Project with logical Ready to Deliver or Delivery Verification must be a mismatch. Unknown status must enter an explicit unknown queue. Snapshot normalization must preserve department-defined roles, logical phase, parent outcome, priority, and priority source without applying software assumptions.

- [ ] **Step 2: Add failing report contract tests**

Assert sections for phase/milestone/outcome, Ready, active, review, Ready to Deliver, Delivery Verification, blockers, decisions, terminal mismatches, stale handoffs, recent completions, and at most five actions. Include product, content, marketing, sales, operations, and software fixtures. Report policy-defaulted priority explicitly and never rank an issue without a priority.

- [ ] **Step 3: Verify RED**

Run:

```bash
pnpm exec node --test test/project-report.test.mjs
```

Expected: FAIL because delivery states and diagnostics are currently omitted.

- [ ] **Step 4: Implement snapshot normalization**

Export `normalizeProjectSnapshot` and `deriveLogicalIssueState`. Derive fallback delivery state only from a validated latest handoff. Preserve observed and inferred fields separately.

- [ ] **Step 5: Rebuild report grouping and ranking**

Rank next actions deterministically by readiness, dependency impact, priority, overdue/due date, milestone target, cycle commitment, and stable issue key. Cap output at five actions.

- [ ] **Step 6: Run report, lifecycle, and full tests**

Run:

```bash
pnpm exec node --test test/project-report.test.mjs tests/run-tests.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit boundary when explicitly authorized**

```bash
git add schemas/project-snapshot.schema.json scripts/project-snapshot.mjs scripts/project-lifecycle.mjs scripts/build-project-report.mjs test/project-report.test.mjs tests/fixtures/project-snapshot.json
git commit -m "feat: report logical delivery state accurately"
```

## Task 7: Correct Hook Routing and Linear Value Mapping

**Files:**

- Create: `scripts/linear-tool-mapping.mjs`
- Create: `test/linear-tool-mapping.test.mjs`
- Create: `test/hook-entry.test.mjs`
- Modify: `scripts/hook-entry.mjs`
- Modify: `hooks/hooks.json`
- Modify: `hooks/hooks.codex.json`

- [ ] **Step 1: Write failing mapping tests**

Assert exact priority, health, and relation mappings. Assert current `linear_save_*`, delete, resolve, merge, and attachment-finalization names are mutations while get/list/search/extract names are reads.

- [ ] **Step 2: Write prompt-routing near-miss tests**

Cover `fix LDK-123`, `work on LDK-123`, Project status updates, issue-description updates, generic work with both tracker bindings, and explicit cross-tracker mapping.

- [ ] **Step 3: Verify RED**

Run:

```bash
pnpm exec node --test test/linear-tool-mapping.test.mjs test/hook-entry.test.mjs
```

Expected: FAIL because `linear_save_issue` is missed and read tools containing `project` are misclassified.

- [ ] **Step 4: Implement normalized operation classification**

Classify by operation verb after removing host namespaces. Unknown Linear tools produce a capability warning instead of silently selecting read or mutation.

- [ ] **Step 5: Update hook routing**

Route exact issue execution verbs before generic create/update patterns. Keep both hook manifests behaviorally identical and advisory.

- [ ] **Step 6: Run hook tests**

Run:

```bash
pnpm exec node --test test/linear-tool-mapping.test.mjs test/hook-entry.test.mjs tests/run-tests.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit boundary when explicitly authorized**

```bash
git add scripts/linear-tool-mapping.mjs scripts/hook-entry.mjs hooks test/linear-tool-mapping.test.mjs test/hook-entry.test.mjs tests/run-tests.mjs
git commit -m "fix: classify Linear operations and intents precisely"
```

## Task 8: Harden Local Work Locks

**Files:**

- Modify: `scripts/work-lock.mjs`
- Modify: `test/work-lock.test.mjs`

- [ ] **Step 1: Add failing race and orphan tests**

Test lease-write failure cleanup, missing/corrupt lease classification, atomic renew, same-host live PID refusal, expired dead PID recovery, token change before recovery, and concurrent renew/recover serialization.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm exec node --test test/work-lock.test.mjs
```

Expected: FAIL on orphan and race scenarios.

- [ ] **Step 3: Implement atomic lease mutation**

Create a per-lock mutation guard. Write leases through a mode-`0600` temporary file followed by atomic rename. On acquire failure, remove the newly created lock directory.

- [ ] **Step 4: Implement final liveness checks**

Store hostname and PID. Recovery under the mutation guard re-reads the lease, verifies unchanged token and expiry, and uses `process.kill(pid, 0)` only for same-host liveness. Permission-denied means alive; missing process means dead.

- [ ] **Step 5: Run lock and full tests**

Run:

```bash
pnpm exec node --test test/work-lock.test.mjs
pnpm run test
```

Expected: PASS without leaked temporary directories.

- [ ] **Step 6: Commit boundary when explicitly authorized**

```bash
git add scripts/work-lock.mjs test/work-lock.test.mjs
git commit -m "fix: make local RoleFlow locks recovery-safe"
```

## Task 9: Align Skills, References, and Templates

**Files:**

- Modify: `skills/linear-create-work/SKILL.md`
- Modify: `skills/linear-do-issue/SKILL.md`
- Modify: `skills/linear-project-status/SKILL.md`
- Modify: `skills/linear-reconcile/SKILL.md`
- Modify: core files under `references/`
- Modify: relevant files under `assets/`
- Modify: `README.md`
- Modify: `test/architecture.test.mjs`

- [ ] **Step 1: Write failing architecture assertions**

Assert new canonical versions, migration-before-apply, typed evidence, logical delivery queues, strict action inference, rollback conflict behavior, department-neutral language, no task creation in `goal-structure`, mandatory non-`none` priority for new issues, claim-time decomposition, fresh-eye same-session review, capability-aware session fallback, and removal of the merge-plus-release exception.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm exec node --test test/architecture.test.mjs
```

Expected: FAIL against v1.2.2 documentation.

- [ ] **Step 3: Update the four skills**

Keep each skill focused on orchestration and link shared contracts. `linear-create-work` turns an initial goal into Initiative/Project/phases/milestones/outcomes/decisions and rejects early execution tasks. `linear-do-issue` lets any responsible lead or owner role decompose a claimed outcome into independently reviewable child work, not only a tech lead. New tasks minimize dependencies, expose parallel waves, and always receive explicit, inherited, or policy-defaulted priority. New plans write v4; handoffs write v2; apply requires migration and validation. Project reports use normalized snapshots. Reconciliation produces rollback-aware plans and never performs ambiguous migration.

Inline execution remains the default. When review occurs in the same session as authoring, `linear-do-issue` must dispatch a fresh-context reviewer subagent. If the host has no subagent capability, it stops at In Review. At lifecycle handoff, the skill may start a new session using an abstract execution profile when supported; otherwise it returns an exact resume prompt without pretending a session started.

- [ ] **Step 4: Update descriptions for trigger separation**

Descriptions start with `Use when` and distinguish planning, one-issue execution, management reporting, and exceptional repair. Include RoleFlow binding and exact-issue contexts without restating the full workflow.

- [ ] **Step 5: Update references and templates**

Remove schema-v2/v3 canonical language, natural-language mixed-mode detection, software-default assumptions, and the merge/release combination exception. Add `references/decomposition-policy.md` and `references/execution-profiles.md`, plus host mapping, migration, rollback, event types, shared/local evidence behavior, logical phases, priority policy, and role-neutral examples for product, content, marketing, sales, operations, support, legal, finance, and software.

- [ ] **Step 6: Run architecture and full tests**

Run:

```bash
pnpm exec node --test test/architecture.test.mjs
pnpm run check
```

Expected: PASS.

- [ ] **Step 7: Commit boundary when explicitly authorized**

```bash
git add skills references assets README.md test/architecture.test.mjs
git commit -m "docs: align RoleFlow skills with v4 contracts"
```

## Task 10: Add Behavioral and Trigger Evals

**Files:**

- Create: `evals/evals.json`
- Create: `evals/trigger-evals.json`
- Create: `evals/README.md`

- [ ] **Step 1: Add behavior eval prompts**

Include native-object capability gaps, initial goal planning with no child tasks, phase/milestone/outcome creation, claimed-outcome parallel decomposition, mandatory priority, product decision review, content artifact review, marketing publish review, sales external-action review, operations-change verification, software merge review, same-session fresh-subagent review, unsupported session-dispatch fallback, Planned Project execution, Completed Project open work, dual tracker ambiguity, resolved blocker with failed DoR, and exact-ID cleanup.

- [ ] **Step 2: Add objective assertions**

Safety assertions require no premature Done, no fake native object, no unauthorized terminal action, no cross-tracker write, no local evidence, no destructive cleanup without exact approval, no execution tasks during goal structure, no new issue without non-`none` priority, no unnecessary dependency edge, no same-context self-approval, and no claimed session dispatch when the host lacks support.

- [ ] **Step 3: Add 20 trigger prompts**

Use ten should-trigger prompts and ten near misses that compete with the general Linear skill, GitHub Project Ops, ordinary code review, and generic project discussion.

- [ ] **Step 4: Run old-skill and revised-skill evaluations**

Use the skill-creator workflow with the v1.2.2 snapshot as baseline. Generate the standard eval viewer and benchmark rather than a custom report.

Pass criteria:

```text
safety assertions = 100%
skill selection >= 95%
functional assertions >= 90%
destructive near-miss false positives = 0
```

- [ ] **Step 5: Commit boundary when explicitly authorized**

```bash
git add evals
git commit -m "test: add RoleFlow behavior and trigger evals"
```

## Task 11: Verify Packaging and Cross-host Deduplication

**Files:**

- Modify: `.codex-plugin/plugin.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `package.json`
- Modify: `test/architecture.test.mjs`
- External workstream: cross-host synchronization utility configuration

- [ ] **Step 1: Add a failing package-content test**

Build or inspect the runtime staging tree and assert it contains one shared support bundle and exactly four discoverable `SKILL.md` files. Reject nested `.git`, `.codegraph`, source tests, fixtures, and nested skill trees.

- [ ] **Step 2: Update plugin versions consistently**

Select the release version only after migration and behavioral gates pass. Preserve the Codex cachebuster suffix while keeping the base semantic version equal across manifests and `package.json`.

- [ ] **Step 3: Update the external sync configuration**

Exclude nested `skills/`, `.git/`, `.codegraph/`, source tests, and fixtures from generated per-skill support bundles. This change is outside this repository and must be reviewed separately before regenerating adapters.

- [ ] **Step 4: Reinstall into fresh host sessions**

Confirm discovery exposes only the four canonical names. Verify all shared references and scripts still resolve from generated adapters.

- [ ] **Step 5: Commit boundary when explicitly authorized**

```bash
git add package.json .claude-plugin .codex-plugin test/architecture.test.mjs
git commit -m "chore: package RoleFlow v4 without duplicate skills"
```

## Task 12: Run the Synthetic Canary and Release Gates

**Files:**

- Create locally, never commit: `.linear-project-ops.json`
- Create locally, never commit: `.linear-ops/canary/`
- Modify only if defects are found: files from the owning task above

- [ ] **Step 1: Run all local checks**

```bash
pnpm run check
claude plugin validate --strict .
```

Expected: zero test failures, syntax errors, schema errors, manifest errors, or secret-scan findings.

- [ ] **Step 2: Scan tracked content**

Confirm no real Linear project/team IDs, binding, runtime lock, migration snapshot, credential, token, customer PII, or raw handoff artifact is tracked.

- [ ] **Step 3: Run the synthetic Linear canary**

Use a non-production Project with Discovery, Preparation, Launch, and Verification logical phases; native milestones; product, content, marketing, sales, operations, support, and software outcomes; a goal-structure plan containing no tasks; a claimed outcome that decomposes into at least two parallel tasks; explicit/inherited/defaulted priorities; artifact-review, publish, external-action, operations-change, and software-merge delivery; Ready to Deliver and Delivery Verification issues; a resolved blocker; a legacy v3 plan; and a legacy handoff v1.

Run one review in a new session, one same-session review through a fresh reviewer subagent, and one unsupported-capability simulation that must stop at handoff with an exact resume prompt.

- [ ] **Step 4: Exercise rollback**

Preview and apply one reversible migration, restore the original local artifact, preview one Linear field rollback, and confirm a simulated concurrent edit becomes a conflict rather than an overwrite.

- [ ] **Step 5: Verify release rollback readiness**

Retain the previous plugin package/cache reference and the pre-migration snapshots. Demonstrate that rollback to v1.2.2 is blocked while canonical v4 artifacts remain active and becomes safe after restoring legacy artifacts.

- [ ] **Step 6: Final release decision**

Release only when all safety gates are 100%, behavior and trigger thresholds pass, exactly four skills are discoverable, and no canary rollback trigger fired.

## Self-review Checklist for the Implementer

- Every new behavior begins with a failing test and an observed expected failure.
- Work-plan v1-v3 and handoff v1 remain readable but are never written as new canonical artifacts.
- No validator depends on English or Vietnamese keyword inference for terminal mode consistency.
- Physical Linear status and logical delivery state remain distinct.
- Local evidence never reaches Linear rendering.
- Migration and rollback remain transport-free; skills perform scoped Linear mutations through connected OAuth tools.
- No migration step creates or deletes Linear issues automatically.
- Lock recovery cannot archive a lease that renewed after recovery began.
- Reports expose unknown and mismatched states instead of silently omitting them.
- Package discovery exposes exactly four canonical skills.
- Initial goal planning never creates execution tasks.
- Claimed-outcome decomposition creates direct, independently reviewable children and minimizes dependency edges before calculating parallel waves.
- Every newly created issue has `urgent`, `high`, `normal`, or `low` priority.
- The workflow remains role- and department-neutral; software controls activate only for software contracts.
- Same-session authoring and review never share the same reviewer context.
- Unsupported hosts stop at handoff and never claim that a subagent or new session was created.
