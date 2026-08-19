import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateWorkPlan } from "../scripts/lib.mjs";
import {
  buildParallelWaves,
  resolveNewIssuePriority,
  validatePlanningStructure,
} from "../scripts/work-structure.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("v4 work plan accepts scoped outcome decomposition", async () => {
  const plan = await validPlan();
  assert.deepEqual(validatePlanningStructure(plan), []);
  assert.deepEqual(validateWorkPlan(plan), []);
});

test("goal structure rejects execution tasks while allowing project decisions", async () => {
  const plan = await validPlan();
  plan.planningStage = "goal-structure";
  delete plan.sourceOutcomeKey;
  assert.match(validatePlanningStructure(plan).join("\n"), /goal-structure.*task/u);

  plan.issues = [plan.issues[0], {
    ...structuredClone(plan.issues[1]),
    key: "demo.decision.channel",
    type: "decision",
    title: "Choose the launch channel",
    parentKey: undefined,
    status: "Refinement",
    ownerRole: "cpo",
    reviewerRole: "cpo",
    delivery: {
      mode: "decision",
      ownerRole: "cpo",
      verification: [{ mode: "decision", check: "Authorized decision is recorded" }],
    },
    relations: { blockedByKeys: [], relatedToKeys: [] },
  }];
  assert.deepEqual(validatePlanningStructure(plan), []);
  assert.deepEqual(validateWorkPlan(plan), []);
});

test("outcome decomposition requires one source outcome and direct children", async () => {
  const plan = await validPlan();
  delete plan.sourceOutcomeKey;
  assert.match(validatePlanningStructure(plan).join("\n"), /sourceOutcomeKey/u);

  plan.sourceOutcomeKey = "demo.outcome.launch";
  plan.issues[1].parentKey = "demo.outcome.other";
  assert.match(validatePlanningStructure(plan).join("\n"), /direct child.*demo\.outcome\.launch/u);
});

test("new issue priority is explicit, inherited, or policy-defaulted", () => {
  assert.deepEqual(resolveNewIssuePriority({ explicitPriority: "urgent", parentPriority: "low" }), {
    priority: "urgent",
    source: "explicit",
  });
  assert.deepEqual(resolveNewIssuePriority({ parentPriority: "high" }), {
    priority: "high",
    source: "inherited",
  });
  assert.deepEqual(resolveNewIssuePriority({}), {
    priority: "normal",
    source: "policy-default",
  });
  assert.throws(() => resolveNewIssuePriority({ explicitPriority: "none" }), /priority/u);
});

test("parallel waves are deterministic and cycles are rejected", () => {
  assert.deepEqual(buildParallelWaves([
    { key: "research", blockedByKeys: [] },
    { key: "copy", blockedByKeys: [] },
    { key: "launch", blockedByKeys: ["research", "copy"] },
  ]), [["copy", "research"], ["launch"]]);

  assert.throws(() => buildParallelWaves([
    { key: "one", blockedByKeys: ["two"] },
    { key: "two", blockedByKeys: ["one"] },
  ]), /cycle/u);
});

test("v4 validator enforces live status, lifecycle, hierarchy, priority, phases, and typed verification", async () => {
  const cases = [
    ["apply plan requires live project status", (plan) => { plan.mode = "apply"; delete plan.project.projectStatus; }, /projectStatus.*required/u],
    ["lifecycle criteria are non-empty", (plan) => { plan.project.lifecycle.completionCriteria = []; }, /completionCriteria.*non-empty/u],
    ["task requires outcome parent", (plan) => { delete plan.issues[1].parentKey; }, /parentKey.*required/u],
    ["verification is typed", (plan) => { plan.issues[1].delivery.verification = ["Accepted"]; }, /verification.*object/u],
    ["verification mode matches", (plan) => { plan.issues[1].delivery.verification[0].mode = "publish"; }, /must match delivery mode/u],
    ["unknown fields are rejected", (plan) => { plan.issues[1].unexpected = true; }, /unexpected additional property/u],
    ["Ready rejects native blockers", (plan) => { plan.issues[1].relations.blockedByKeys = ["demo.task.campaign"]; }, /Ready cannot have blockedByKeys/u],
    ["priority none is rejected", (plan) => { plan.issues[1].priority = "none"; }, /priority is invalid/u],
    ["missing priority is rejected", (plan) => { delete plan.issues[1].priority; }, /priority is invalid/u],
    ["phase entry criteria are non-empty", (plan) => { plan.phases[0].entryCriteria = []; }, /entryCriteria.*non-empty/u],
    ["phase milestone exists", (plan) => { plan.phases[0].milestoneKeys = ["demo.milestone.missing"]; }, /references unknown milestone/u],
  ];

  for (const [name, mutate, pattern] of cases) {
    const plan = await validPlan();
    mutate(plan);
    assert.match(validateWorkPlan(plan, { forApply: plan.mode === "apply" }).join("\n"), pattern, name);
  }
});

test("legacy work plans remain readable but require migration before apply", async () => {
  for (const name of ["legacy-work-plan-v1.json", "legacy-work-plan-v2.json", "valid-work-plan.json"]) {
    const plan = JSON.parse(await readFile(join(root, "tests", "fixtures", name), "utf8"));
    assert.deepEqual(validateWorkPlan(plan), [], `${name} must remain readable`);
    plan.mode = "apply";
    assert.match(validateWorkPlan(plan, { forApply: true }).join("\n"), /migration.*v4.*required/u, name);
  }
});

test("apply mode itself requires a live project status", async () => {
  const plan = await validPlan();
  plan.mode = "apply";
  delete plan.project.projectStatus;
  assert.match(validateWorkPlan(plan).join("\n"), /projectStatus.*required/u);
});

test("v4 records priority source and keeps policy defaults consistent", async () => {
  const plan = await validPlan();
  plan.issues.forEach((issue) => { issue.prioritySource = "explicit"; });
  plan.issues[1].priority = "normal";
  plan.issues[1].prioritySource = "policy-default";
  assert.deepEqual(validateWorkPlan(plan), []);
  plan.issues[1].priority = "high";
  assert.match(validateWorkPlan(plan).join("\n"), /policy-default.*normal/u);
});

test("inherited priority must match the direct parent", async () => {
  const plan = await validPlan();
  plan.issues[1].priority = "low";
  plan.issues[1].prioritySource = "inherited";
  assert.match(validateWorkPlan(plan).join("\n"), /inherited.*parent.*priority/u);
});

async function validPlan() {
  return JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-work-plan-v4.json"), "utf8"));
}

test("a canonical v4 plan passes apply-mode validation", async () => {
  const { readFile } = await import("node:fs/promises");
  const { validateWorkPlan } = await import("../scripts/lib.mjs");
  const plan = JSON.parse(await readFile(new URL("../tests/fixtures/valid-work-plan-v4.json", import.meta.url), "utf8"));
  plan.mode = "apply";
  assert.deepEqual(validateWorkPlan(plan, { forApply: true }), [], "v4 is the canonical write contract; apply must not demand migration");
});

test("apply-mode validation is enforced for canonical v4 plans", async () => {
  const { readFile } = await import("node:fs/promises");
  const { validateWorkPlan } = await import("../scripts/lib.mjs");
  const plan = JSON.parse(await readFile(new URL("../tests/fixtures/valid-work-plan-v4.json", import.meta.url), "utf8"));
  assert.match(validateWorkPlan(plan, { forApply: true }).join("\n"), /mode must be apply/u, "a preview plan cannot authorize mutations");
});
