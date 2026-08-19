import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateProjectBinding } from "../scripts/lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("package exposes the same v2.0.0 plugin for Codex and Claude Code", async () => {
  const codex = JSON.parse(await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8"));
  const claude = JSON.parse(await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(await readFile(join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(packageJson.name, "ldk-linear-project-ops");
  assert.equal(packageJson.version, "2.0.0");
  assert.equal(codex.name, packageJson.name);
  assert.equal(codex.version.split("+")[0], packageJson.version);
  assert.equal(claude.name, packageJson.name);
  assert.equal(claude.version, packageJson.version);
  assert.equal(marketplace.plugins[0].version, packageJson.version);
  assert.equal(packageJson.bin, undefined);
});

test("plugin has four role-oriented public skills", async () => {
  const skills = (await readdir(join(root, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(skills, ["linear-create-work", "linear-do-issue", "linear-project-status", "linear-reconcile"]);
  for (const skill of skills) {
    await access(join(root, "skills", skill, "SKILL.md"));
    await access(join(root, "skills", skill, "agents", "openai.yaml"));
  }

  const discoverableSkills = (await listSourceFiles(root))
    .filter((path) => path.endsWith("/SKILL.md"))
    .sort();
  assert.equal(discoverableSkills.length, 4);
  assert.deepEqual(
    discoverableSkills.map((path) => path.slice(root.length + 1)),
    skills.map((skill) => join("skills", skill, "SKILL.md")),
  );
});

test("terminal issue runs require safe Git and worktree closure", async () => {
  const skill = await readFile(join(root, "skills", "linear-do-issue", "SKILL.md"), "utf8");
  const software = await readFile(join(root, "references", "software-work.md"), "utf8");
  const closure = await readFile(join(root, "references", "git-closure.md"), "utf8");

  assert.match(skill, /git-closure\.md/u);
  assert.match(skill, /terminal Git closure/u);
  assert.match(software, /Terminal Git closure/u);
  for (const command of [
    "git status --short --branch",
    "git worktree list --porcelain",
    "git fetch --prune origin",
    "git merge --ff-only origin/<integration>",
    "git cherry origin/<integration>",
    "git worktree prune",
  ]) assert.match(closure, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(closure, /Never delete a remote branch/u);
  assert.match(closure, /uncommitted, unpushed, or uniquely unmerged/u);
});

test("old SQLite claim engine and automation-era schemas are removed", async () => {
  for (const relative of [
    "scripts/claim-lock/cli.mjs",
    "scripts/claim-lock/store.mjs",
    "features/claim-lock.feature",
    "schemas/brainstorm-plan.schema.json",
    "schemas/decomposition.schema.json",
    "schemas/software-delivery-evidence.schema.json",
    "scripts/validate-plan.mjs",
    "scripts/validate-software-delivery.mjs",
  ]) await assert.rejects(access(join(root, relative)));
  for (const relative of [
    "schemas/project-binding.schema.json",
    "schemas/work-plan.schema.json",
    "schemas/handoff.schema.json",
    "schemas/project-update.schema.json",
    "schemas/legacy-cleanup-plan.schema.json",
    "schemas/git-worktree-baseline.schema.json",
    "scripts/validate-work-plan.mjs",
    "scripts/validate-handoff.mjs",
    "scripts/validate-project-update.mjs",
    "scripts/validate-legacy-cleanup.mjs",
    "scripts/render-project-update.mjs",
    "scripts/project-lifecycle.mjs",
    "scripts/analyze-project-lifecycle.mjs",
    "scripts/render-work-comment.mjs",
    "scripts/work-lock.mjs",
    "references/linear-hierarchy.md",
    "references/delivery-lifecycle.md",
    "references/issue-relations.md",
    "references/planning-properties.md",
    "references/project-lifecycle.md",
    "references/legacy-cleanup.md",
    "references/git-closure.md",
    "references/tracker-routing.md",
    "references/artifact-routing.md",
    "assets/initiative-template.md",
    "assets/milestone-template.md",
    "assets/outcome-issue-template.md",
    "assets/project-update-template.md",
  ]) await access(join(root, relative));
});

test("relation policy maps work-plan fields and guards readiness", async () => {
  const policy = await readFile(join(root, "references", "issue-relations.md"), "utf8");
  const create = await readFile(join(root, "skills", "linear-create-work", "SKILL.md"), "utf8");
  const execute = await readFile(join(root, "skills", "linear-do-issue", "SKILL.md"), "utf8");
  const reconcile = await readFile(join(root, "skills", "linear-reconcile", "SKILL.md"), "utf8");
  for (const mapping of ["blockedByKeys", "blockedBy", "relatedToKeys", "relatedTo", "duplicateOfKey", "duplicateOf", "parentKey", "parentId"]) {
    assert.match(policy, new RegExp(`\\b${mapping}\\b`, "u"));
  }
  assert.match(create, /blockedByKeys → blockedBy/u);
  assert.match(execute, /read the blocker issue's live state/u);
  assert.match(reconcile, /resolved dependency still blocking work/u);
});

test("delivery lifecycle keeps handoff, review, delivery, and Done distinct", async () => {
  const policy = await readFile(join(root, "references", "delivery-lifecycle.md"), "utf8");
  const execute = await readFile(join(root, "skills", "linear-do-issue", "SKILL.md"), "utf8");
  const software = await readFile(join(root, "references", "software-work.md"), "utf8");
  for (const mode of ["decision", "artifact-review", "publish", "external-action", "software-merge", "production-release", "operations-change"]) {
    assert.match(policy, new RegExp(`\\b${mode}\\b`, "u"));
  }
  assert.match(execute, /Ready to Deliver/u);
  assert.match(execute, /Delivery Verification/u);
  assert.match(execute, /review passed for `publish`/u);
  assert.match(software, /QA pass moves the issue to `Ready to Deliver`/u);
  assert.match(software, /intermediate packet PRs are checkpoints/u);
});

test("artifact routing keeps planning contracts separate from execution evidence", async () => {
  const policy = await readFile(join(root, "references", "artifact-routing.md"), "utf8");
  const create = await readFile(join(root, "skills", "linear-create-work", "SKILL.md"), "utf8");
  const execute = await readFile(join(root, "skills", "linear-do-issue", "SKILL.md"), "utf8");
  const reconcile = await readFile(join(root, "skills", "linear-reconcile", "SKILL.md"), "utf8");

  assert.match(policy, /stable planning contract/u);
  assert.match(policy, /One issue has one terminal delivery mode/u);
  for (const skill of [create, execute, reconcile]) assert.match(skill, /artifact-routing\.md/u);
  assert.match(create, /timestamped execution history/u);
  assert.match(execute, /repository-native technical evidence/u);
  assert.match(reconcile, /append-only execution journal/u);
});

test("RoleFlow v4 skills and policies enforce goal-first multi-department execution", async () => {
  const workPlanSchema = JSON.parse(await readFile(join(root, "schemas", "work-plan.schema.json"), "utf8"));
  const handoffSchema = JSON.parse(await readFile(join(root, "schemas", "handoff.schema.json"), "utf8"));
  assert.equal(workPlanSchema.properties.schemaVersion.const, 4);
  assert.equal(handoffSchema.properties.schemaVersion.const, 2);

  const create = await readFile(join(root, "skills", "linear-create-work", "SKILL.md"), "utf8");
  const execute = await readFile(join(root, "skills", "linear-do-issue", "SKILL.md"), "utf8");
  const status = await readFile(join(root, "skills", "linear-project-status", "SKILL.md"), "utf8");
  const reconcile = await readFile(join(root, "skills", "linear-reconcile", "SKILL.md"), "utf8");
  for (const skill of [create, execute, status, reconcile]) assert.match(skill, /work plan v4|handoff v2|RoleFlow v4/iu);

  assert.match(create, /goal-structure/u);
  assert.match(create, /must not create execution tasks/u);
  assert.match(create, /urgent.*high.*normal.*low/su);
  assert.match(execute, /claimed outcome/u);
  assert.match(execute, /parallel waves/u);
  assert.match(execute, /fresh-context reviewer subagent/u);
  assert.match(execute, /stop at `In Review`/u);
  assert.match(status, /normalizeProjectSnapshot|normalized snapshot/u);
  assert.match(status, /policy-default/u);
  assert.match(reconcile, /migrate-contract\.mjs/u);
  assert.match(reconcile, /compare-and-swap|rollback conflict/u);

  const decomposition = await readFile(join(root, "references", "decomposition-policy.md"), "utf8");
  const profiles = await readFile(join(root, "references", "execution-profiles.md"), "utf8");
  for (const department of ["product", "content", "marketing", "sales", "operations", "support", "legal", "finance", "software"]) {
    assert.match(decomposition, new RegExp(`\\b${department}\\b`, "iu"));
  }
  assert.match(decomposition, /claim-time decomposition/u);
  assert.match(profiles, /new-required/u);
  assert.match(profiles, /exact resume prompt/u);

  const software = await readFile(join(root, "references", "software-work.md"), "utf8");
  assert.doesNotMatch(software, /unless the approved scope explicitly combines merge and release/iu);
  const legacy = await readFile(join(root, "references", "legacy-compatibility.md"), "utf8");
  assert.match(legacy, /write only work plan v4 and handoff v2/u);
});

test("source repository contains no live project binding or credentials", async () => {
  for (const relative of [".linear-project-ops.json", ".linear-ops", ".state"]) await assert.rejects(access(join(root, relative)));
  const example = JSON.parse(await readFile(join(root, "examples", "project-binding.example.json"), "utf8"));
  assert.deepEqual(validateProjectBinding(example, { allowPlaceholders: true }), []);
  assert.match(validateProjectBinding(example).join("\n"), /placeholder/u);
  const files = await listSourceFiles(root);
  const content = (await Promise.all(files.map((path) => readFile(path, "utf8")))).join("\n");
  const formerProjectId = ["98a2bdf1", "f648", "4ba0", "8de6", "d37480b5daac"].join("-");
  const formerTeamId = ["8dee37c7", "a36e", "4e19", "8e42", "d88b8b72f663"].join("-");
  assert.equal(content.includes(formerProjectId), false);
  assert.equal(content.includes(formerTeamId), false);
  assert.doesNotMatch(content, /\blin_api_[A-Za-z0-9_-]{8,}\b/u);
});

test("internal work lock contains no Linear transport", async () => {
  const source = await readFile(join(root, "scripts", "work-lock.mjs"), "utf8");
  assert.doesNotMatch(source, /LINEAR_API_KEY|api\.linear|graphql|fetch\(|createIssue|updateIssue/iu);
});

async function listSourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".codegraph", ".state", ".linear-ops", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(path));
    else files.push(path);
  }
  return files;
}
