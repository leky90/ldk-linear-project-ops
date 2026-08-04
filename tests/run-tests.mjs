import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildProjectReport } from "../scripts/build-project-report.mjs";
import { readJson, stableKey, validateDecomposition, validatePlan, validateProjectBinding } from "../scripts/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => join(here, "fixtures", name);

test("stable key is deterministic, normalized, and valid", () => {
  const first = stableKey(["Example Product", "Đo lường tăng trưởng"]);
  const second = stableKey(["Example Product", "Đo lường tăng trưởng"]);
  assert.equal(first, second);
  assert.match(first, /^[a-z0-9][a-z0-9._:-]{2,95}$/u);
  assert.match(first, /^example-product-do-luong-tang-truong-/u);
});

test("example consumer binding is valid and contains no credentials", async () => {
  const binding = await readJson(join(here, "..", "examples", "project-binding.example.json"));
  assert.deepEqual(validateProjectBinding(binding, { allowPlaceholders: true }), []);
  assert.match(validateProjectBinding(binding).join("\n"), /placeholder/u);
  assert.doesNotMatch(JSON.stringify(binding), /api.?key|password|credential|access.?token/iu);
});

test("valid draft plan passes but cannot be applied before approval", async () => {
  const plan = await readJson(fixture("valid-plan.json"));
  assert.deepEqual(validatePlan(plan, { projectId: "project-1" }), []);
  assert.match(validatePlan(plan, { projectId: "project-1", forApply: true }).join("\n"), /approved must be true/u);
  assert.match(validatePlan(plan, { projectId: "other-project" }).join("\n"), /does not match bound project/u);
});

test("approved plan is apply-valid and secret-like fields are rejected", async () => {
  const plan = await readJson(fixture("valid-plan.json"));
  plan.approved = true;
  assert.deepEqual(validatePlan(plan, { projectId: "project-1", forApply: true }), []);
  plan.linearApiKey = ["lin", "api", "not-allowed-123456"].join("_");
  assert.match(validatePlan(plan).join("\n"), /secret-like data is forbidden/u);
});

test("duplicate keys and dependency cycles are rejected", async () => {
  const plan = await readJson(fixture("valid-plan.json"));
  plan.issues[1].key = plan.issues[0].key;
  assert.match(validatePlan(plan).join("\n"), /duplicate stable key/u);

  const decomposition = await readJson(fixture("valid-decomposition.json"));
  decomposition.children[0].status = "Blocked";
  decomposition.children[0].blockedByKeys = ["demo.child.report"];
  assert.match(validateDecomposition(decomposition).join("\n"), /dependency cycle/u);
});

test("valid decomposition passes project and DAG checks", async () => {
  const decomposition = await readJson(fixture("valid-decomposition.json"));
  assert.deepEqual(validateDecomposition(decomposition, { projectId: "project-1" }), []);
  assert.match(validateDecomposition(decomposition, { projectId: "wrong" }).join("\n"), /does not match bound project/u);
});

test("project report computes progress, queue, stale claims, and measurement gaps", async () => {
  const report = buildProjectReport(await readJson(fixture("project-snapshot.json")));
  assert.match(report, /1\/5 non-canceled issues are Done \(20%\)/u);
  assert.match(report, /Expired claim: Establish onboarding baseline/u);
  assert.match(report, /1\. Publish baseline report — high/u);
  assert.match(report, /Measurement required: Activation baseline is unknown/u);
});

test("session hook discovers canonical binding without mutating the repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "ldk-linear-plugin-"));
  await writeFile(join(root, ".linear-project-ops.json"), JSON.stringify({
    project: { linearProjectId: "project-hook", linearTeamId: "team-hook" }
  }));
  const hook = join(here, "..", "scripts", "hook-entry.mjs");
  const output = await runProcess(process.execPath, [hook, "SessionStart"], JSON.stringify({ cwd: root }));
  assert.match(output, /project_id="project-hook"/u);
  assert.match(output, /team_id="team-hook"/u);
  assert.match(output, /\$linear-project-context/u);
  assert.equal(await readFile(join(root, ".linear-project-ops.json"), "utf8"), JSON.stringify({
    project: { linearProjectId: "project-hook", linearTeamId: "team-hook" }
  }));
});

function runProcess(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`process exited ${code}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}
