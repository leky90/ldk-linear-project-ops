import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateProjectBinding } from "../scripts/lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("package exposes the same v1 plugin for Codex and Claude Code", async () => {
  const codex = JSON.parse(await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8"));
  const claude = JSON.parse(await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(await readFile(join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(packageJson.name, "ldk-linear-project-ops");
  assert.equal(packageJson.version, "1.0.0");
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
    "schemas/git-worktree-baseline.schema.json",
    "scripts/validate-work-plan.mjs",
    "scripts/validate-handoff.mjs",
    "scripts/render-work-comment.mjs",
    "scripts/work-lock.mjs",
  ]) await access(join(root, relative));
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
