import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { validateHandoff, validateWorkPlan } from "../scripts/lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("all packaged JSON schemas compile", async () => {
  const schemaDirectory = join(root, "schemas");
  const schemaFiles = (await readdir(schemaDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();

  for (const name of schemaFiles) {
    const schema = JSON.parse(await readFile(join(schemaDirectory, name), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    assert.doesNotThrow(() => ajv.compile(schema), `${name} must compile`);
  }
});

test("schema and packaged validator reject undeclared work-plan fields", async () => {
  const schema = JSON.parse(await readFile(join(root, "schemas", "work-plan.schema.json"), "utf8"));
  const plan = JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-work-plan-v4.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validateSchema = ajv.compile(schema);

  assert.equal(validateSchema(plan), true, JSON.stringify(validateSchema.errors));
  assert.deepEqual(validateWorkPlan(plan), []);

  plan.project.unexpected = true;
  assert.equal(validateSchema(plan), false);
  assert.match(JSON.stringify(validateSchema.errors), /additionalProperties|unexpected/u);
  assert.match(validateWorkPlan(plan).join("\n"), /unexpected|additional propert/u);
});

test("handoff v2 schema accepts the canonical fixture", async () => {
  const schema = JSON.parse(await readFile(join(root, "schemas", "handoff.schema.json"), "utf8"));
  const handoff = JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-handoff-v2.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validateSchema = ajv.compile(schema);
  assert.equal(validateSchema(handoff), true, JSON.stringify(validateSchema.errors));
});

test("schema and runtime agree on delivery mode equality", async () => {
  const schema = JSON.parse(await readFile(join(root, "schemas", "work-plan.schema.json"), "utf8"));
  const plan = JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-work-plan-v4.json"), "utf8"));
  plan.issues[0].delivery.verification[0].mode = "publish";
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validateSchema = ajv.compile(schema);
  assert.equal(validateSchema(plan), false);
  assert.match(validateWorkPlan(plan).join("\n"), /must match delivery mode/u);
});

test("schema and runtime reject unknown nested software fields", async () => {
  const schema = JSON.parse(await readFile(join(root, "schemas", "handoff.schema.json"), "utf8"));
  const handoff = JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-handoff-v2.json"), "utf8"));
  handoff.type = "handoff";
  handoff.fromRole = "software-engineer";
  handoff.toRole = "qa";
  handoff.deliverables = ["Reviewed code"];
  delete handoff.review;
  handoff.observedState.logicalState = "in-progress";
  handoff.transition = { from: "in-progress", to: "in-review" };
  handoff.delivery = {
    mode: "software-merge",
    ownerRole: "software-engineer",
    phase: "review",
    target: "main",
    checks: [{ mode: "software-merge", check: "PR is merged" }],
  };
  handoff.software = {
    commitSha: "abcdef1",
    branchName: "agent/example",
    git: {
      baselineId: "a".repeat(64),
      changeBaseSha: "abcdef0",
      scopePaths: ["src/example"],
    },
  };
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validateSchema = ajv.compile(schema);
  assert.equal(validateSchema(handoff), true, JSON.stringify(validateSchema.errors));
  assert.deepEqual(validateHandoff(handoff), []);
  handoff.software.unexpected = true;
  assert.equal(validateSchema(handoff), false);
  assert.match(validateHandoff(handoff).join("\n"), /software\.unexpected.*additional property/u);
});

test("schema and runtime require evidence for terminal verification", async () => {
  const schema = JSON.parse(await readFile(join(root, "schemas", "handoff.schema.json"), "utf8"));
  const handoff = JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-handoff-v2.json"), "utf8"));
  handoff.type = "verification";
  delete handoff.review;
  handoff.verification = { decision: "passed" };
  handoff.checks = [];
  handoff.evidence = [];
  handoff.observedState.logicalState = "delivery-verification";
  handoff.transition = { from: "delivery-verification", to: "done" };
  handoff.delivery.phase = "complete";
  handoff.delivery.checks = handoff.delivery.checks.map((check) => ({ ...check, passed: true }));
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validateSchema = ajv.compile(schema);
  assert.equal(validateSchema(handoff), false);
  assert.match(validateHandoff(handoff).join("\n"), /verification.*shared evidence|checks/u);
  handoff.checks = [{ item: "Terminal result is confirmed", passed: true }];
  handoff.evidence = [{ kind: "local-note", label: "Private proof", value: "private", visibility: "local" }];
  assert.equal(validateSchema(handoff), false);
  assert.match(validateHandoff(handoff).join("\n"), /verification requires shared evidence/u);
});
