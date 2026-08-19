import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildMigrationPlan,
  migrateHandoff,
  migrateWorkPlan,
  restoreMigrationArtifact,
  validateMigrationPlan,
  writeMigrationSnapshot,
} from "../scripts/migration.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = (...parts) => join(root, "tests", "fixtures", ...parts);
const execFileAsync = promisify(execFile);

test("legacy work plans migrate to exact conservative v4 golden results", async () => {
  for (const [inputName, expectedName] of [
    ["legacy-work-plan-v1.json", "work-plan-v1-to-v4.json"],
    ["legacy-work-plan-v2.json", "work-plan-v2-to-v4.json"],
    ["legacy-work-plan-v3.json", "work-plan-v3-to-v4.json"],
  ]) {
    const input = await readJson(fixture(inputName));
    const expected = await readJson(fixture("migrations", expectedName));
    const result = migrateWorkPlan(input, { targetVersion: 4 });
    assert.deepEqual(result, expected, inputName);
    assert.deepEqual(migrateWorkPlan(result.artifact).artifact, result.artifact, `${inputName} must be idempotent`);
    assert.equal(result.diagnostics.decisions.length > 0, !result.eligibleForApply);
  }
});

test("handoff v1 migrates to the exact conservative v2 golden result", async () => {
  const input = await readJson(fixture("valid-handoff.json"));
  const expected = await readJson(fixture("migrations", "handoff-v1-to-v2.json"));
  const result = migrateHandoff(input, { targetVersion: 2 });
  assert.deepEqual(result, expected);
  assert.deepEqual(migrateHandoff(result.artifact).artifact, result.artifact);
  assert.equal(result.eligibleForApply, false);
});

test("migration does not invent decomposition scope or legacy priority", async () => {
  const input = await readJson(fixture("legacy-work-plan-v3.json"));
  delete input.issues[1].parentKey;
  delete input.issues[1].priority;
  const result = migrateWorkPlan(input);
  assert.equal(Object.hasOwn(result.artifact.issues[1], "priority"), false);
  assert.match(result.diagnostics.decisions.map((item) => item.code).join("\n"), /planning-stage|missing-priority/u);
  assert.equal(result.eligibleForApply, false);
});

test("migration requires live project status and diagnoses mixed legacy terminal boundaries", async () => {
  const input = await readJson(fixture("legacy-work-plan-v3.json"));
  delete input.project.projectStatus;
  input.issues[1].delivery.mode = "software-merge";
  input.issues[1].delivery.verification = [
    "Reviewed PR is merged into main",
    "Production deployment is live",
  ];
  const result = migrateWorkPlan(input);
  const codes = result.diagnostics.decisions.map((item) => item.code);
  assert.ok(codes.includes("missing-project-status"));
  assert.ok(codes.includes("mixed-terminal-boundary"));
  assert.equal(result.eligibleForApply, false);
});

test("migration eligibility accepts project-defined role slugs", async () => {
  const input = await readJson(fixture("migrations", "work-plan-v3-to-v4.json"));
  input.artifact.issues[0].ownerRole = "legal-counsel";
  input.artifact.issues[0].delivery.ownerRole = "legal-counsel";
  const result = migrateWorkPlan(input.artifact);
  assert.equal(result.eligibleForApply, true);
});

test("local rollback restores unchanged output and refuses concurrent edits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roleflow-migration-"));
  const sourcePath = join(directory, "legacy.json");
  const outputPath = join(directory, "canonical.json");
  const beforeArtifact = await readJson(fixture("legacy-work-plan-v3.json"));
  const migrationResult = migrateWorkPlan(beforeArtifact);
  await writeFile(sourcePath, `${JSON.stringify(beforeArtifact, null, 2)}\n`);
  await writeFile(outputPath, `${JSON.stringify(migrationResult.artifact, null, 2)}\n`);

  const plan = buildMigrationPlan({ sourcePath, outputPath, beforeArtifact, migrationResult });
  const snapshotPath = await writeMigrationSnapshot(plan, { directory: join(directory, ".linear-ops", "migrations") });
  assert.equal((await stat(snapshotPath)).mode & 0o777, 0o600);
  assert.deepEqual((await readdir(dirname(snapshotPath))).sort(), [
    "after.json",
    "before.json",
    "migration-plan.json",
    "operation-journal.json",
    "rollback-plan.json",
  ]);

  assert.deepEqual(await restoreMigrationArtifact(plan), { restored: true, outputPath });
  assert.deepEqual(await readJson(outputPath), beforeArtifact);

  await writeFile(outputPath, `${JSON.stringify(migrationResult.artifact, null, 2)}\n`);
  await writeFile(outputPath, `${JSON.stringify({ ...migrationResult.artifact, summary: "Independent edit" }, null, 2)}\n`);
  await assert.rejects(restoreMigrationArtifact(plan), /conflict.*changed/u);
});

test("migration CLI previews, applies, checks rollback, and restores locally", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roleflow-migration-cli-"));
  const inputPath = join(directory, "legacy.json");
  const planPath = join(directory, "plan.json");
  const input = await readJson(fixture("legacy-work-plan-v3.json"));
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  const cli = join(root, "scripts", "migrate-contract.mjs");

  await execFileAsync(process.execPath, [cli, "preview", inputPath, "--output", planPath]);
  const preview = await readJson(planPath);
  const outputPath = preview.outputPath;
  assert.equal(preview.mode, "preview");
  assert.equal(preview.eligibleForApply, true);

  await execFileAsync(process.execPath, [cli, "apply", inputPath, "--plan", planPath, "--output", outputPath]);
  assert.equal((await readJson(outputPath)).schemaVersion, 4);
  const appliedPlan = await readJson(planPath);
  assert.equal(appliedPlan.mode, "apply");
  assert.equal(appliedPlan.outputPath, outputPath);

  const rollbackPreview = await execFileAsync(process.execPath, [cli, "rollback-preview", "--plan", planPath]);
  assert.deepEqual(JSON.parse(rollbackPreview.stdout), { safe: true, conflict: false, outputPath });
  await execFileAsync(process.execPath, [cli, "rollback-apply", "--plan", planPath]);
  assert.deepEqual(await readJson(outputPath), input);
});

test("migration plans bind hashes, safe IDs, output paths, and original bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roleflow-migration-integrity-"));
  const sourcePath = join(directory, "legacy.json");
  const outputPath = join(directory, "canonical.json");
  const input = await readJson(fixture("legacy-work-plan-v3.json"));
  const originalBytes = ` \n${JSON.stringify(input, null, "\t")}\n`;
  const migrationResult = migrateWorkPlan(input);
  const plan = buildMigrationPlan({ sourcePath, outputPath, beforeArtifact: input, beforeBytes: originalBytes, migrationResult });
  assert.deepEqual(validateMigrationPlan(plan), []);

  const tampered = structuredClone(plan);
  tampered.afterHash = "0".repeat(64);
  assert.match(validateMigrationPlan(tampered).join("\n"), /afterHash/u);
  const unsafe = structuredClone(plan);
  unsafe.planId = "../escape";
  assert.match(validateMigrationPlan(unsafe).join("\n"), /planId/u);

  await writeFile(outputPath, `${JSON.stringify(migrationResult.artifact)}\n`);
  await restoreMigrationArtifact(plan);
  assert.equal(await readFile(outputPath, "utf8"), originalBytes);
});

test("migration apply refuses to clobber an existing output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roleflow-migration-no-clobber-"));
  const inputPath = join(directory, "legacy.json");
  const planPath = join(directory, "plan.json");
  const input = await readJson(fixture("legacy-work-plan-v3.json"));
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  const cli = join(root, "scripts", "migrate-contract.mjs");
  await execFileAsync(process.execPath, [cli, "preview", inputPath, "--output", planPath]);
  const plan = await readJson(planPath);
  await writeFile(plan.outputPath, "do not replace\n");
  await assert.rejects(
    execFileAsync(process.execPath, [cli, "apply", inputPath, "--plan", planPath, "--output", plan.outputPath]),
    (error) => /EEXIST|already exists/u.test(error.stderr),
  );
  assert.equal(await readFile(plan.outputPath, "utf8"), "do not replace\n");
});

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
