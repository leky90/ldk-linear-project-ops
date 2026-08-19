import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const ASSERTION_CLASSES = new Set(["safety", "conformance", "functional"]);

test("behavior evals cover RoleFlow v4 safety and multi-department delivery", async () => {
  const suite = JSON.parse(await readFile(join(root, "evals", "evals.json"), "utf8"));
  assert.equal(suite.skill_name, "ldk-linear-project-ops");
  assert.ok(suite.evals.length >= 18);
  for (const item of suite.evals) {
    assert.ok(item.prompt?.length > 20, `eval ${item.id} requires a realistic prompt`);
    assert.ok(item.expected_output?.length > 10, `eval ${item.id} requires an expected output`);
    assert.ok(item.assertions?.length > 0, `eval ${item.id} requires objective assertions`);
    for (const a of item.assertions) {
      assert.ok(
        ASSERTION_CLASSES.has(a.class),
        `assertion ${a.id} declares its metric class (safety, conformance, or functional)`,
      );
    }
  }
  const classes = suite.evals.flatMap((item) => item.assertions.map((a) => a.class));
  assert.ok(classes.filter((c) => c === "safety").length >= 12, "behavioral safety metric stays populated");
  assert.ok(classes.filter((c) => c === "conformance").length >= 5, "contract-conformance metric stays populated");
  assert.ok(classes.filter((c) => c === "functional").length >= 15, "functional metric stays populated");
  const completed = suite.evals.find((item) => item.assertions.some((a) => a.id === "completed-stop"));
  assert.match(completed.prompt, /Ready to Deliver/iu, "completed-project eval pins its open logical statuses as fixture data");
  assert.match(completed.prompt, /Delivery Verification/iu, "completed-project eval pins its open logical statuses as fixture data");
  const fallback = suite.evals
    .flatMap((item) => item.assertions)
    .find((a) => a.id === "unsupported-fallback");
  assert.match(fallback.description, /inline/iu, "fallback assertion forbids the inline review explicitly");
  const content = JSON.stringify(suite);
  for (const term of [
    "goal-structure",
    "parallel",
    "priority",
    "artifact-review",
    "publish",
    "external-action",
    "operations-change",
    "software-merge",
    "fresh-subagent",
    "unsupported",
    "Planned",
    "Completed",
    "dual tracker",
    "resolved blocker",
    "exact-ID",
  ]) assert.match(content, new RegExp(term, "iu"));
});

test("trigger evals contain ten realistic positives and ten competing near misses", async () => {
  const suite = JSON.parse(await readFile(join(root, "evals", "trigger-evals.json"), "utf8"));
  assert.equal(suite.length, 20);
  assert.equal(suite.filter((item) => item.should_trigger).length, 10);
  assert.equal(suite.filter((item) => !item.should_trigger).length, 10);
  assert.equal(new Set(suite.map((item) => item.query)).size, 20);
  assert.ok(suite.every((item) => item.query.length > 20));
});
