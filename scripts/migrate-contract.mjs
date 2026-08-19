#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { chmod, link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import { parseCli, validateHandoff, validateWorkPlan } from "./lib.mjs";
import {
  buildMigrationPlan,
  migrateHandoff,
  migrateWorkPlan,
  restoreMigrationArtifact,
  validateMigrationPlan,
  writeMigrationSnapshot,
} from "./migration.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
const [command, inputArgument] = positional;

try {
  if (command === "preview") await preview(inputArgument, flags);
  else if (command === "apply") await apply(inputArgument, flags);
  else if (command === "rollback-preview") await rollbackPreview(flags);
  else if (command === "rollback-apply") await rollbackApply(flags);
  else usage();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

async function preview(inputArgumentValue, commandFlags) {
  if (!inputArgumentValue || typeof commandFlags.get("output") !== "string") usage();
  const sourcePath = resolve(inputArgumentValue);
  const planPath = resolve(commandFlags.get("output"));
  const inputBytes = await readFile(sourcePath);
  const input = JSON.parse(inputBytes.toString("utf8"));
  const migrationResult = migrate(input);
  const extension = extname(sourcePath);
  const defaultOutput = join(dirname(sourcePath), `${basename(sourcePath, extension)}.migrated${extension || ".json"}`);
  const plan = buildMigrationPlan({ sourcePath, outputPath: defaultOutput, beforeArtifact: input, beforeBytes: inputBytes, migrationResult });
  await atomicWriteJson(planPath, plan);
  process.stdout.write(`${JSON.stringify({ valid: true, planPath, eligibleForApply: plan.eligibleForApply }, null, 2)}\n`);
}

async function apply(inputArgumentValue, commandFlags) {
  if (!inputArgumentValue || typeof commandFlags.get("plan") !== "string" || typeof commandFlags.get("output") !== "string") usage();
  const sourcePath = resolve(inputArgumentValue);
  const planPath = resolve(commandFlags.get("plan"));
  const outputPath = resolve(commandFlags.get("output"));
  if (sourcePath === outputPath) throw new Error("output path must differ from the source path");
  const inputBytes = await readFile(sourcePath);
  const plan = await readJson(planPath);
  assertValidPlan(plan);
  if (plan.sourcePath !== sourcePath) throw new Error("migration plan sourcePath does not match input");
  if (plan.outputPath !== outputPath) throw new Error("migration plan outputPath does not match output");
  if (hashBytes(inputBytes) !== plan.sourceHash) throw new Error("migration source changed after preview");
  if (!plan.eligibleForApply || plan.diagnostics?.decisions?.length > 0) throw new Error("migration has unresolved decisions and is not eligible for apply");
  const validationErrors = plan.artifactKind === "linear-role-work-plan"
    ? validateWorkPlan(plan.afterArtifact, { roles: null })
    : validateHandoff(plan.afterArtifact, { roles: null });
  if (validationErrors.length) throw new Error(`target artifact is invalid: ${validationErrors.join("; ")}`);

  const appliedPlan = { ...plan, mode: "apply" };
  const snapshotPath = await writeMigrationSnapshot(appliedPlan, { directory: join(dirname(sourcePath), ".linear-ops", "migrations") });
  await atomicCreateJson(outputPath, plan.afterArtifact);
  await updateOperationJournal(snapshotPath, "applied");
  await atomicWriteJson(planPath, appliedPlan);
  process.stdout.write(`${JSON.stringify({ applied: true, outputPath, planPath }, null, 2)}\n`);
}

async function rollbackPreview(commandFlags) {
  if (typeof commandFlags.get("plan") !== "string") usage();
  const plan = await readJson(resolve(commandFlags.get("plan")));
  assertValidPlan(plan);
  const current = await readJson(plan.outputPath);
  const conflict = hashArtifact(current) !== plan.afterHash;
  process.stdout.write(`${JSON.stringify({ safe: !conflict, conflict, outputPath: plan.outputPath })}\n`);
  if (conflict) process.exitCode = 1;
}

async function rollbackApply(commandFlags) {
  if (typeof commandFlags.get("plan") !== "string") usage();
  const plan = await readJson(resolve(commandFlags.get("plan")));
  assertValidPlan(plan);
  const result = await restoreMigrationArtifact(plan);
  const snapshotPath = join(dirname(plan.sourcePath), ".linear-ops", "migrations", plan.planId, "migration-plan.json");
  await updateOperationJournal(snapshotPath, "rolled-back");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function migrate(input) {
  if (input?.kind === "linear-role-work-plan") return migrateWorkPlan(input);
  if (input?.kind === "linear-role-handoff") return migrateHandoff(input);
  throw new Error("input kind is not a supported RoleFlow contract");
}

function usage() {
  throw new Error([
    "Usage:",
    "  migrate-contract.mjs preview <input.json> --output <plan.json>",
    "  migrate-contract.mjs apply <input.json> --plan <plan.json> --output <artifact.json>",
    "  migrate-contract.mjs rollback-preview --plan <plan.json>",
    "  migrate-contract.mjs rollback-apply --plan <plan.json>",
  ].join("\n"));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function hashArtifact(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertValidPlan(plan) {
  const errors = validateMigrationPlan(plan);
  if (errors.length) throw new Error(`invalid migration plan: ${errors.join("; ")}`);
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

async function atomicCreateJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  try {
    await link(temporary, path);
    await chmod(path, 0o600);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function updateOperationJournal(snapshotPath, status) {
  const path = join(dirname(snapshotPath), "operation-journal.json");
  const journal = await readJson(path);
  await atomicWriteJson(path, { ...journal, status, updatedAt: new Date().toISOString() });
}
