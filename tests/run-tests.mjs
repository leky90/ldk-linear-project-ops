import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildProjectReport } from "../scripts/build-project-report.mjs";
import { captureGitBaseline, validateLiveGitDelivery } from "../scripts/git-delivery-state.mjs";
import {
  DEFAULT_ROLES,
  normalizeProjectBinding,
  readJson,
  renderProjectUpdate,
  renderWorkComment,
  stableKey,
  validateHandoff,
  validateLegacyCleanupPlan,
  validateProjectBinding,
  validateProjectUpdate,
  validateWorkPlan,
} from "../scripts/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => join(here, "fixtures", name);

test("stable key is deterministic and normalized", () => {
  const first = stableKey("Example Product", "Đo lường tăng trưởng");
  assert.equal(first, stableKey("Example Product", "Đo lường tăng trưởng"));
  assert.match(first, /^example-product-do-luong-tang-truong-[a-f0-9]{10}$/u);
});

test("v2 binding validates and v1 binding is read-compatible", async () => {
  const binding = await readJson(join(here, "..", "examples", "project-binding.example.json"));
  assert.deepEqual(validateProjectBinding(binding, { allowPlaceholders: true }), []);
  const legacy = {
    schemaVersion: 1,
    project: { slug: "legacy-project", name: "Legacy", linearProjectId: "project-1", linearTeamId: "team-1", historicalProjectIds: [] },
    workflow: { states: { ready: "ready", inProgress: "progress", inReview: "review", blocked: "blocked", done: "done" } },
    coordination: { mode: "atomic-local-lease", databasePath: ".linear-ops/claims.sqlite" },
  };
  assert.deepEqual(validateProjectBinding(legacy), []);
  const normalized = normalizeProjectBinding(legacy);
  assert.equal(normalized.schemaVersion, 2);
  assert.equal(normalized.workflow.states.refinement, "ready");
  assert.deepEqual(normalized.workflow.roles, DEFAULT_ROLES);
  assert.equal(Object.hasOwn(normalized, "coordination"), false);
});

test("v2 work plan enforces hierarchy, planning fields, references, and dependency DAG", async () => {
  const plan = await readJson(fixture("valid-work-plan.json"));
  assert.deepEqual(validateWorkPlan(plan, { projectId: "project-1", teamId: "team-1" }), []);
  assert.match(validateWorkPlan(plan, { forApply: true }).join("\n"), /mode must be apply/u);
  plan.mode = "apply";
  assert.deepEqual(validateWorkPlan(plan, { projectId: "project-1", teamId: "team-1", forApply: true }), []);
  plan.issues[1].relations.blockedByKeys = ["demo.outcome.onboarding"];
  plan.issues[0].relations.blockedByKeys = ["demo.task.onboarding-ui"];
  assert.match(validateWorkPlan(plan).join("\n"), /dependency cycle/u);
  plan.issues[0].relations.blockedByKeys = [];
  plan.issues[1].relations.blockedByKeys = [];
  plan.issues[1].ownerRole = "unknown-specialist";
  assert.match(validateWorkPlan(plan).join("\n"), /unknown role/u);
  plan.issues[1].ownerRole = "software-engineer";
  plan.issues[0].type = "initiative";
  assert.match(validateWorkPlan(plan).join("\n"), /use outcome instead of an issue-level initiative/u);
  plan.issues[0].type = "outcome";
  plan.issues[1].parentKey = "demo.task.onboarding-ui";
  assert.match(validateWorkPlan(plan).join("\n"), /parentKey must reference an outcome/u);
  plan.issues[1].parentKey = "demo.outcome.onboarding";
  plan.issues[1].milestoneKey = "demo.milestone.missing";
  assert.match(validateWorkPlan(plan).join("\n"), /references unknown milestone/u);
  plan.issues[1].milestoneKey = "demo.milestone.beta";
  plan.issues[1].dueDate = "2026-02-31";
  assert.match(validateWorkPlan(plan).join("\n"), /must be a valid ISO date/u);
});

test("v1 work plan remains read-compatible during the transition", async () => {
  const plan = await readJson(fixture("legacy-work-plan-v1.json"));
  assert.deepEqual(validateWorkPlan(plan, { projectId: "project-1", teamId: "team-1" }), []);
});

test("native project updates require publish intent and render a management update", async () => {
  const update = await readJson(fixture("valid-project-update.json"));
  assert.deepEqual(validateProjectUpdate(update, { projectId: "project-1" }), []);
  assert.match(validateProjectUpdate(update, { projectId: "project-1", forPublish: true }).join("\n"), /mode must be publish/u);
  update.mode = "publish";
  assert.deepEqual(validateProjectUpdate(update, { projectId: "project-1", forPublish: true }), []);
  const rendered = renderProjectUpdate(update);
  assert.match(rendered, /Project Update · At risk/u);
  assert.match(rendered, /Activation event naming is unresolved/u);
  update.health = "unknown";
  assert.match(validateProjectUpdate(update).join("\n"), /health is invalid/u);
});

test("legacy cleanup requires exact approved destructive entries", async () => {
  const plan = await readJson(fixture("valid-legacy-cleanup.json"));
  assert.deepEqual(validateLegacyCleanupPlan(plan, { projectId: "project-1" }), []);
  assert.match(validateLegacyCleanupPlan(plan, { projectId: "project-1", forApply: true }).join("\n"), /mode must be apply/u);
  plan.mode = "apply";
  assert.match(validateLegacyCleanupPlan(plan, { projectId: "project-1", forApply: true }).join("\n"), /must be explicitly approved/u);
  plan.entries.forEach((entry) => { entry.approved = true; });
  assert.deepEqual(validateLegacyCleanupPlan(plan, { projectId: "project-1", forApply: true }), []);
  plan.entries[0].canonicalIssueId = "";
  assert.match(validateLegacyCleanupPlan(plan).join("\n"), /canonicalIssueId is required/u);
  plan.entries[0].canonicalIssueId = "EXAMPLE-2";
  plan.snapshotAt = "2026-08-06";
  assert.match(validateLegacyCleanupPlan(plan).join("\n"), /ISO timestamp with timezone/u);
});

test("handoff validates DoD and renders one human-oriented comment", async () => {
  const handoff = await readJson(fixture("valid-handoff.json"));
  assert.deepEqual(validateHandoff(handoff), []);
  const comment = renderWorkComment(handoff);
  assert.match(comment, /## ✅ Bàn giao · tech lead → software engineer/u);
  assert.match(comment, /## Kiểm tra DoD/u);
  assert.match(comment, /\[x\] Scope is explicit/u);
  assert.doesNotMatch(comment, /token|heartbeat|run id|\{\s*"schemaVersion"/iu);
  handoff.checks[0].passed = false;
  assert.match(validateHandoff(handoff).join("\n"), /all Definition of Done checks must pass/u);
});

test("review outcome requires valid findings and checks", () => {
  const review = {
    schemaVersion: 1,
    kind: "linear-role-handoff",
    type: "review",
    issueId: "EXAMPLE-7",
    fromRole: "qa",
    summary: "The release candidate satisfies acceptance criteria.",
    checks: [{ item: "Acceptance examples pass", passed: true }],
    evidence: [{ label: "Test run", value: "12 passed" }],
    nextAction: "Close the issue.",
    review: { decision: "passed", findings: [] },
  };
  assert.deepEqual(validateHandoff(review), []);
  assert.match(renderWorkComment(review), /Review đạt/u);
  review.checks[0].passed = false;
  assert.match(validateHandoff(review).join("\n"), /passed review requires all checks/u);
});

test("consumer bindings may add domain-specific roles", async () => {
  const handoff = await readJson(fixture("valid-handoff.json"));
  handoff.fromRole = "legal-counsel";
  handoff.toRole = "cpo";
  const roles = { ...DEFAULT_ROLES, "legal-counsel": { label: "role:legal-counsel", defaultReviewer: "cpo" } };
  assert.deepEqual(validateHandoff(handoff, { roles }), []);
  assert.match(renderWorkComment(handoff, { roles }), /legal counsel → cpo/u);
});

test("Git baseline rejects a primary worktree and pre-existing dirt", async () => {
  const { primary } = await createGitFixture();
  await assert.rejects(captureGitBaseline({ repository: primary, issueId: "EXAMPLE-123" }), /dedicated linked Git worktree is required/u);
  await writeFile(join(primary, "untracked.txt"), "old work\n");
  await assert.rejects(captureGitBaseline({ repository: primary, issueId: "EXAMPLE-123", worktreeIsolation: "allow-clean-primary" }), /dirty worktree/u);
});

test("software handoff passes only for a clean scoped commit", async () => {
  const { linked } = await createGitFixture();
  const baseline = await captureGitBaseline({ repository: linked, issueId: "EXAMPLE-123" });
  await mkdir(join(linked, "src", "example"), { recursive: true });
  await writeFile(join(linked, "src", "example", "feature.mjs"), "export const ready = true;\n");
  await runProcess("git", ["-C", linked, "add", "src/example/feature.mjs"], "");
  await runProcess("git", ["-C", linked, "commit", "-m", "feat: add example"], "");
  const commitSha = (await runProcess("git", ["-C", linked, "rev-parse", "HEAD"], "")).trim();
  const handoff = await readJson(fixture("valid-handoff.json"));
  handoff.fromRole = "software-engineer";
  handoff.toRole = "qa";
  handoff.software = { commitSha, branchName: baseline.branchName, branchPushed: false, ciStatus: "not-configured", git: { baselineId: baseline.baselineId, changeBaseSha: baseline.baselineCommit, scopePaths: ["src/example"] } };
  assert.deepEqual(validateHandoff(handoff), []);
  const result = await validateLiveGitDelivery({ evidence: handoff, baseline, repository: linked });
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.scopeClean, true);
  await writeFile(join(linked, "leftover.tmp"), "untracked\n");
  const dirty = await validateLiveGitDelivery({ evidence: handoff, baseline, repository: linked });
  assert.match(dirty.errors.join("\n"), /uncommitted or untracked files/u);
});

test("software handoff rejects committed paths outside declared scope", async () => {
  const { linked } = await createGitFixture();
  const baseline = await captureGitBaseline({ repository: linked, issueId: "EXAMPLE-123" });
  await writeFile(join(linked, "outside.txt"), "wrong scope\n");
  await runProcess("git", ["-C", linked, "add", "outside.txt"], "");
  await runProcess("git", ["-C", linked, "commit", "-m", "test: outside scope"], "");
  const commitSha = (await runProcess("git", ["-C", linked, "rev-parse", "HEAD"], "")).trim();
  const handoff = await readJson(fixture("valid-handoff.json"));
  handoff.fromRole = "software-engineer";
  handoff.toRole = "qa";
  handoff.software = { commitSha, branchName: baseline.branchName, git: { baselineId: baseline.baselineId, changeBaseSha: baseline.baselineCommit, scopePaths: ["src/example"] } };
  const result = await validateLiveGitDelivery({ evidence: handoff, baseline, repository: linked });
  assert.match(result.errors.join("\n"), /committed paths outside declared scope: outside.txt/u);
});

test("project report presents role queues without claim telemetry", async () => {
  const report = buildProjectReport(await readJson(fixture("project-snapshot.json")));
  assert.match(report, /1\/6 issue Done \(17%\)/u);
  assert.match(report, /1\/15 estimated effort Done \(7%\)/u);
  assert.match(report, /status started; health at-risk; priority high; lead Product Lead/u);
  assert.match(report, /Improve product activation.*active; high; owner CPO/u);
  assert.match(report, /Onboarding release.*1\/5 Done; effort 1\/14; có rủi ro/u);
  assert.match(report, /software-engineer:\*\* 1 Ready/u);
  assert.match(report, /content-director:\*\* 0 Ready, 0 In Progress, 1 chờ review/u);
  assert.match(report, /Implement onboarding UI.*milestone Onboarding release; Cycle 32; due 2026-08-15; estimate 5; assignee Engineer A/u);
  assert.doesNotMatch(report, /\bclaim\b|\blease\b|\bheartbeat\b|\brun ID\b/iu);
});

test("hook routes a direct issue request to the single execution skill", async () => {
  const root = await mkdtemp(join(tmpdir(), "ldk-linear-plugin-"));
  const binding = JSON.stringify({ project: { linearProjectId: "project-hook", linearTeamId: "team-hook" } });
  await writeFile(join(root, ".linear-project-ops.json"), binding);
  const hook = join(here, "..", "scripts", "hook-entry.mjs");
  const output = await runProcess(process.execPath, [hook, "UserPromptSubmit"], JSON.stringify({ cwd: root, prompt: "Hãy thực hiện issue EXAMPLE-123" }));
  assert.match(output, /\$linear-do-issue/u);
  assert.doesNotMatch(output, /linear-execute-goal-chain|linear-claim-focus/u);
  assert.equal(await readFile(join(root, ".linear-project-ops.json"), "utf8"), binding);
});

test("hook routes native planning, project updates, and legacy cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "ldk-linear-plugin-"));
  await writeFile(join(root, ".linear-project-ops.json"), JSON.stringify({ project: { linearProjectId: "project-hook", linearTeamId: "team-hook" } }));
  const hook = join(here, "..", "scripts", "hook-entry.mjs");
  const run = (prompt) => runProcess(process.execPath, [hook, "UserPromptSubmit"], JSON.stringify({ cwd: root, prompt }));
  assert.match(await run("Hãy tạo milestone cho public beta"), /\$linear-create-work.*native Initiative/u);
  assert.match(await run("Hãy publish Project Update và cập nhật health"), /\$linear-project-status.*native Linear Project Update/u);
  assert.match(await run("Hãy audit và purge legacy comments"), /\$linear-reconcile.*exact validated preview/u);
});

function runProcess(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`process exited ${code}: ${stderr}`)));
    child.stdin.end(input);
  });
}

async function createGitFixture() {
  const root = await mkdtemp(join(tmpdir(), "ldk-linear-git-"));
  const primary = join(root, "primary");
  const linked = join(root, "linked");
  await mkdir(primary);
  await runProcess("git", ["init", "-b", "main", primary], "");
  await runProcess("git", ["-C", primary, "config", "user.name", "Plugin Test"], "");
  await runProcess("git", ["-C", primary, "config", "user.email", "plugin-test@example.invalid"], "");
  await writeFile(join(primary, "README.md"), "fixture\n");
  await writeFile(join(primary, ".gitignore"), ".linear-ops/\n");
  await runProcess("git", ["-C", primary, "add", "README.md", ".gitignore"], "");
  await runProcess("git", ["-C", primary, "commit", "-m", "test: initial"], "");
  await runProcess("git", ["-C", primary, "worktree", "add", "-b", "agent/example-123", linked], "");
  return { primary, linked };
}
