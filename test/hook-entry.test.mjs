import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { classifyTracker, handle } from "../scripts/hook-entry.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const linear = { projectId: "project-example", teamId: "team-example" };

test("exact issue execution intent wins before generic update routing", () => {
  for (const prompt of [
    "fix LDK-123",
    "work on LDK-123",
    "Hãy thực hiện issue LDK-123",
    "Update the issue description for LDK-123",
  ]) assert.match(handle("UserPromptSubmit", { prompt }, { linear, github: null }), /\$linear-do-issue/u, prompt);

  assert.match(handle("UserPromptSubmit", { prompt: "Publish a Project status update in Linear" }, { linear, github: null }), /\$linear-project-status/u);
});

test("dual tracker prompts remain advisory and never dual-route", () => {
  const bindings = { linear, github: { owner: "example", projectNumber: 1 } };
  assert.equal(handle("UserPromptSubmit", { prompt: "Create issues for the roadmap" }, bindings), "");
  assert.equal(handle("UserPromptSubmit", { prompt: "Map Linear LDK-123 to GitHub example/repo#4" }, bindings), "");
});

test("tool hooks guard mutations, ignore reads, and warn on unknown operations", () => {
  const bindings = { linear, github: null };
  assert.match(handle("PreToolUse", { tool_name: "linear_save_issue" }, bindings), /Before mutating Linear/u);
  assert.equal(handle("PreToolUse", { tool_name: "linear_get_project" }, bindings), "");
  assert.match(handle("PreToolUse", { tool_name: "linear_rotate_project" }, bindings), /unknown Linear tool operation.*do not mutate/iu);
});

test("Claude and Codex hook manifests remain behaviorally identical", async () => {
  const claude = JSON.parse(await readFile(join(root, "hooks", "hooks.json"), "utf8"));
  const codex = JSON.parse(await readFile(join(root, "hooks", "hooks.codex.json"), "utf8"));
  assert.deepEqual(codex, claude);
});

test("lowercase technical tokens are not Linear issue keys", () => {
  const bindings = { linear: null, github: { owner: "example", projectNumber: 1 } };
  assert.equal(classifyTracker("convert the hash output to sha-256", bindings), "github");
  assert.equal(classifyTracker("normalize the utf-8 encoded docs", bindings), "github");
  assert.equal(classifyTracker("fix LDK-123", bindings), "linear");
});
