import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyLinearOperation,
  mapHealthToLinear,
  mapPriorityToLinear,
  mapRelationsToLinear,
} from "../scripts/linear-tool-mapping.mjs";

test("canonical priorities and health map to exact Linear values", () => {
  assert.deepEqual(Object.fromEntries(["urgent", "high", "normal", "low"].map((value) => [value, mapPriorityToLinear(value)])), {
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
  assert.throws(() => mapPriorityToLinear("none"), /priority/u);
});

test("canonical issue relations map without inventing inverse fields", () => {
  assert.deepEqual(mapRelationsToLinear({
    blockedByKeys: ["outcome.one"],
    relatedToKeys: ["decision.two"],
    duplicateOfKey: "task.canonical",
  }, (key) => `id:${key}`), {
    blockedBy: ["id:outcome.one"],
    relatedTo: ["id:decision.two"],
    duplicateOf: "id:task.canonical",
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
