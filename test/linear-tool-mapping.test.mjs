import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyLinearOperation,
  mapHealthToLinear,
  mapPriorityFromLinear,
  mapPriorityToLinear,
  mapRelationsToLinear,
} from "../scripts/linear-tool-mapping.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("canonical priorities and health map to exact Linear values", () => {
  assert.deepEqual(Object.fromEntries(["none", "urgent", "high", "normal", "low"].map((value) => [value, mapPriorityToLinear(value)])), {
    none: 0,
    urgent: 1,
    high: 2,
    normal: 3,
    low: 4,
  });
  assert.deepEqual(Object.fromEntries(["on-track", "at-risk", "off-track"].map((value) => [value, mapHealthToLinear(value)])), {
    "on-track": "onTrack",
    "at-risk": "atRisk",
    "off-track": "offTrack",
  });
  assert.throws(() => mapPriorityToLinear("critical"), /priority/u);
});

test("Linear priorities read back into canonical strings", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((value) => mapPriorityFromLinear(value)), ["none", "urgent", "high", "normal", "low"]);
  assert.throws(() => mapPriorityFromLinear(7), /priority/u);
});

test("canonical issue relations map without inventing inverse fields", () => {
  assert.deepEqual(mapRelationsToLinear({
    blockedByKeys: ["outcome.one"],
    relatedToKeys: ["decision.two"],
    duplicateOfKey: "task.canonical",
    parentKey: "outcome.parent",
  }, (key) => `id:${key}`), {
    blockedBy: ["id:outcome.one"],
    relatedTo: ["id:decision.two"],
    duplicateOf: "id:task.canonical",
    parentId: "id:outcome.parent",
  });
});

test("Linear operation classification uses operation verbs, not entity nouns", () => {
  for (const name of [
    "linear_save_issue",
    "mcp__linear__linear_save_project",
    "linear_delete_comment",
    "linear_resolve_diff_thread",
    "linear_merge_diff",
    "linear_create_attachment_from_upload",
  ]) assert.equal(classifyLinearOperation(name), "mutation", name);

  for (const name of [
    "linear_get_project",
    "mcp__linear__linear_list_issues",
    "linear_search_documentation",
    "linear_extract_images",
  ]) assert.equal(classifyLinearOperation(name), "read", name);

  assert.equal(classifyLinearOperation("linear_rotate_project"), "unknown");
  assert.equal(classifyLinearOperation("bash"), "not-linear");
});

test("real Linear connector names classify by server name or operation catalog", () => {
  for (const name of [
    "mcp__linear-server__save_issue",
    "mcp__linear-server__delete_comment",
    "mcp__linear-server__submit_diff_review",
    "mcp__linear-server__reopen_issue",
    "mcp__a3aa0911-c06d-4508-90ca-8c5cfb7712c5__save_issue",
    "mcp__a3aa0911-c06d-4508-90ca-8c5cfb7712c5__save_status_update",
    "mcp__a3aa0911-c06d-4508-90ca-8c5cfb7712c5__prepare_attachment_upload",
  ]) assert.equal(classifyLinearOperation(name), "mutation", name);

  for (const name of [
    "mcp__linear-server__get_issue",
    "mcp__linear-server__list_issues",
    "mcp__a3aa0911-c06d-4508-90ca-8c5cfb7712c5__get_project",
    "mcp__a3aa0911-c06d-4508-90ca-8c5cfb7712c5__search_documentation",
  ]) assert.equal(classifyLinearOperation(name), "read", name);

  assert.equal(classifyLinearOperation("mcp__linear-server__rotate_project"), "unknown");
  assert.equal(classifyLinearOperation("mcp__github__create_issue"), "not-linear", "unknown servers stay not-linear unless the operation is in the Linear catalog");
  assert.equal(classifyLinearOperation("mcp__a3aa0911-c06d-4508-90ca-8c5cfb7712c5__random_tool"), "not-linear");
});

test("hook matchers fire for real connector tool names", async () => {
  const hooks = JSON.parse(await readFile(join(root, "hooks", "hooks.json"), "utf8"));
  for (const event of ["PreToolUse", "PostToolUse"]) {
    const matcher = new RegExp(hooks.hooks[event][0].matcher, "u");
    for (const name of [
      "mcp__linear-server__save_issue",
      "mcp__linear-server__save_status_update",
      "mcp__a3aa0911-c06d-4508-90ca-8c5cfb7712c5__save_issue",
      "mcp__a3aa0911-c06d-4508-90ca-8c5cfb7712c5__submit_diff_review",
    ]) assert.match(name, matcher, `${event} matcher must cover ${name}`);
  }
});
