import { createHash, randomUUID } from "node:crypto";
import { chmod, link, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { validateHandoff, validateWorkPlan } from "./lib.mjs";

export function migrateWorkPlan(input, { targetVersion = 4 } = {}) {
  if (targetVersion !== 4) throw new Error("only work plan targetVersion 4 is supported");
  if (input?.kind !== "linear-role-work-plan") throw new Error("input is not a Linear RoleFlow work plan");
  if (![1, 2, 3, 4].includes(input.schemaVersion)) throw new Error(`unsupported work plan schemaVersion ${input.schemaVersion}`);

  const sourceVersion = input.schemaVersion;
  const legacyDecisions = sourceVersion < 4 ? diagnoseLegacyTerminalBoundaries(input) : [];
  const artifact = sourceVersion === 1 ? migrateWorkPlanV1(input) : structuredClone(input);
  artifact.schemaVersion = 4;

  if (sourceVersion < 4) {
    if (sourceVersion >= 2) inferPlanningStage(artifact);
    for (const issue of artifact.issues ?? []) {
      if (issue.priority !== undefined && issue.priority !== "none" && issue.prioritySource === undefined) issue.prioritySource = "explicit";
      if (Array.isArray(issue.delivery?.verification)) {
        issue.delivery.verification = issue.delivery.verification.map((entry) => {
          if (typeof entry !== "string") return structuredClone(entry);
          // A string check that names another mode's terminal signal is the
          // unresolved mixed-boundary decision itself; stamping the declared
          // mode over it would launder the conflict out of a re-preview.
          if (conflictsWithDeclaredMode(issue.delivery.mode, entry)) return { check: entry };
          return { mode: issue.delivery.mode, check: entry };
        });
      }
    }
  }

  const diagnostics = diagnoseWorkPlan(artifact, { sourceVersion });
  diagnostics.decisions = dedupeDecisions([...legacyDecisions, ...diagnostics.decisions]);
  const eligibleForApply = diagnostics.decisions.length === 0 && validateWorkPlan(artifact, { roles: null }).length === 0;
  return { artifact, diagnostics, eligibleForApply };
}

export function migrateHandoff(input, { targetVersion = 2 } = {}) {
  if (targetVersion !== 2) throw new Error("only handoff targetVersion 2 is supported");
  if (input?.kind !== "linear-role-handoff") throw new Error("input is not a Linear RoleFlow handoff");
  if (![1, 2].includes(input.schemaVersion)) throw new Error(`unsupported handoff schemaVersion ${input.schemaVersion}`);

  const artifact = input.schemaVersion === 2 ? structuredClone(input) : migrateHandoffV1(input);
  const decisions = [];
  if (!artifact.observedAt || !artifact.observedState) {
    decisions.push(decision("missing-observed-state", "observedState", "Capture live issue timestamps and logical state before mutation."));
  }
  if (!Array.isArray(artifact.delivery?.checks) || artifact.delivery.checks.length === 0) {
    decisions.push(decision("missing-delivery-checks", "delivery.checks", "Define typed terminal delivery checks."));
  }
  const diagnostics = { warnings: [], decisions };
  const eligibleForApply = decisions.length === 0 && validateHandoff(artifact, { roles: null }).length === 0;
  return { artifact, diagnostics, eligibleForApply };
}

export function buildMigrationPlan({ sourcePath, outputPath, beforeArtifact, beforeBytes, migrationResult }) {
  if (!sourcePath || !outputPath) throw new Error("sourcePath and outputPath are required");
  if (!migrationResult?.artifact) throw new Error("migrationResult.artifact is required");
  const beforeHash = hashArtifact(beforeArtifact);
  const afterHash = hashArtifact(migrationResult.artifact);
  const rawBefore = beforeBytes === undefined ? undefined : Buffer.from(beforeBytes);
  return {
    schemaVersion: 1,
    kind: "roleflow-contract-migration-plan",
    mode: "preview",
    planId: `migration-${createHash("sha256").update(`${sourcePath}:${outputPath}:${beforeHash}:${afterHash}`).digest("hex").slice(0, 16)}`,
    artifactKind: migrationResult.artifact.kind,
    sourcePath,
    outputPath,
    sourceHash: rawBefore ? hashBytes(rawBefore) : beforeHash,
    beforeHash,
    afterHash,
    beforeArtifact: structuredClone(beforeArtifact),
    ...(rawBefore ? { beforeBytesBase64: rawBefore.toString("base64") } : {}),
    afterArtifact: structuredClone(migrationResult.artifact),
    diagnostics: structuredClone(migrationResult.diagnostics),
    eligibleForApply: migrationResult.eligibleForApply === true,
  };
}

export async function writeMigrationSnapshot(plan, { directory = ".linear-ops/migrations" } = {}) {
  const errors = validateMigrationPlan(plan);
  if (errors.length) throw new Error(`invalid migration plan: ${errors.join("; ")}`);
  const root = resolve(directory);
  const snapshotDirectory = resolve(root, plan.planId);
  if (dirname(snapshotDirectory) !== root) throw new Error("invalid migration plan: planId escapes migration directory");
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(snapshotDirectory, { mode: 0o700 });
  const path = join(snapshotDirectory, "migration-plan.json");
  const beforeBytes = plan.beforeBytesBase64 ? Buffer.from(plan.beforeBytesBase64, "base64") : serializeJson(plan.beforeArtifact);
  await atomicWriteBytes(join(snapshotDirectory, "before.json"), beforeBytes);
  await atomicWriteJson(join(snapshotDirectory, "after.json"), plan.afterArtifact);
  await atomicWriteJson(path, plan);
  await atomicWriteJson(join(snapshotDirectory, "operation-journal.json"), {
    schemaVersion: 1,
    kind: "roleflow-contract-migration-operation-journal",
    planId: plan.planId,
    status: "planned",
    operations: [{ operation: "write", path: plan.outputPath, expectedHash: plan.afterHash }],
  });
  await atomicWriteJson(join(snapshotDirectory, "rollback-plan.json"), {
    schemaVersion: 1,
    kind: "roleflow-contract-rollback-plan",
    planId: plan.planId,
    outputPath: plan.outputPath,
    expectedCurrentHash: plan.afterHash,
    restoreHash: plan.beforeHash,
  });
  return path;
}

export async function restoreMigrationArtifact(plan) {
  const errors = validateMigrationPlan(plan);
  if (errors.length) throw new Error(`invalid migration plan: ${errors.join("; ")}`);
  const displacedPath = `${plan.outputPath}.rollback-${process.pid}-${randomUUID()}`;
  await rename(plan.outputPath, displacedPath);
  let current;
  try {
    current = JSON.parse(await readFile(displacedPath, "utf8"));
  } catch {
    await restoreDisplacedOutput(displacedPath, plan.outputPath);
    throw new Error("rollback conflict: output changed after migration");
  }
  if (hashArtifact(current) !== plan.afterHash) {
    await restoreDisplacedOutput(displacedPath, plan.outputPath);
    throw new Error("rollback conflict: output changed after migration");
  }
  const beforeBytes = plan.beforeBytesBase64 ? Buffer.from(plan.beforeBytesBase64, "base64") : serializeJson(plan.beforeArtifact);
  try {
    await atomicCreateBytes(plan.outputPath, beforeBytes);
  } catch (error) {
    await restoreDisplacedOutput(displacedPath, plan.outputPath);
    throw new Error(`rollback conflict: output changed during restore (${error.code ?? error.message})`);
  }
  await rm(displacedPath, { force: true });
  return { restored: true, outputPath: plan.outputPath };
}

export function validateMigrationPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["plan must be an object"];
  const allowedKeys = new Set(["schemaVersion", "kind", "mode", "planId", "artifactKind", "sourcePath", "outputPath", "sourceHash", "beforeHash", "afterHash", "beforeArtifact", "beforeBytesBase64", "afterArtifact", "diagnostics", "eligibleForApply"]);
  for (const key of Object.keys(plan)) if (!allowedKeys.has(key)) errors.push(`${key} is not allowed`);
  if (plan.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (plan.kind !== "roleflow-contract-migration-plan") errors.push("kind is invalid");
  if (!new Set(["preview", "apply"]).has(plan.mode)) errors.push("mode is invalid");
  if (!/^migration-[a-f0-9]{16}$/u.test(plan.planId ?? "")) errors.push("planId is invalid");
  if (!new Set(["linear-role-work-plan", "linear-role-handoff"]).has(plan.artifactKind)) errors.push("artifactKind is invalid");
  if (!isAbsolute(plan.sourcePath ?? "")) errors.push("sourcePath must be absolute");
  if (!isAbsolute(plan.outputPath ?? "")) errors.push("outputPath must be absolute");
  for (const key of ["sourceHash", "beforeHash", "afterHash"]) {
    if (!/^[a-f0-9]{64}$/u.test(plan[key] ?? "")) errors.push(`${key} is invalid`);
  }
  if (!plan.beforeArtifact || typeof plan.beforeArtifact !== "object") errors.push("beforeArtifact is required");
  if (!plan.afterArtifact || typeof plan.afterArtifact !== "object") errors.push("afterArtifact is required");
  if (plan.beforeArtifact && hashArtifact(plan.beforeArtifact) !== plan.beforeHash) errors.push("beforeHash does not match beforeArtifact");
  if (plan.afterArtifact && hashArtifact(plan.afterArtifact) !== plan.afterHash) errors.push("afterHash does not match afterArtifact");
  if (plan.beforeBytesBase64 !== undefined) {
    const bytes = decodeCanonicalBase64(plan.beforeBytesBase64);
    if (!bytes) errors.push("beforeBytesBase64 is invalid");
    else {
      if (hashBytes(bytes) !== plan.sourceHash) errors.push("sourceHash does not match beforeBytesBase64");
      try {
        if (hashArtifact(JSON.parse(bytes.toString("utf8"))) !== plan.beforeHash) errors.push("beforeBytesBase64 does not match beforeArtifact");
      } catch {
        errors.push("beforeBytesBase64 is not JSON");
      }
    }
  } else if (plan.beforeArtifact && plan.sourceHash !== plan.beforeHash) {
    errors.push("sourceHash does not match beforeArtifact");
  }
  if (!plan.diagnostics || typeof plan.diagnostics !== "object" || Array.isArray(plan.diagnostics)) errors.push("diagnostics is required");
  else {
    for (const key of Object.keys(plan.diagnostics)) if (!new Set(["warnings", "decisions"]).has(key)) errors.push(`diagnostics.${key} is not allowed`);
    if (!Array.isArray(plan.diagnostics.warnings) || plan.diagnostics.warnings.some((item) => typeof item !== "string")) errors.push("diagnostics.warnings is invalid");
    if (!Array.isArray(plan.diagnostics.decisions) || plan.diagnostics.decisions.some((item) => !item || typeof item.code !== "string" || typeof item.path !== "string" || typeof item.message !== "string")) errors.push("diagnostics.decisions is invalid");
  }
  if (typeof plan.eligibleForApply !== "boolean") errors.push("eligibleForApply must be boolean");
  return errors;
}

function migrateWorkPlanV1(input) {
  return {
    schemaVersion: 4,
    kind: input.kind,
    mode: input.mode,
    planningStage: "goal-structure",
    summary: input.summary,
    project: {
      id: input.projectId,
      teamIds: [input.teamId],
    },
    initiatives: [],
    milestones: [],
    resources: structuredClone(input.resources ?? []),
    issues: (input.issues ?? []).map((issue) => {
      const migrated = structuredClone(issue);
      if (migrated.type === "initiative") migrated.type = "outcome";
      migrated.relations = {
        blockedByKeys: structuredClone(migrated.blockedByKeys ?? []),
        relatedToKeys: [],
      };
      delete migrated.blockedByKeys;
      return migrated;
    }),
  };
}

function inferPlanningStage(artifact) {
  const issues = artifact.issues ?? [];
  const tasks = issues.filter((issue) => issue?.type === "task");
  if (tasks.length === 0) {
    artifact.planningStage = "goal-structure";
    delete artifact.sourceOutcomeKey;
    return;
  }
  const parents = new Set(tasks.map((issue) => issue.parentKey).filter(Boolean));
  if (parents.size === 1) {
    const [sourceOutcomeKey] = parents;
    if (issues.some((issue) => issue.key === sourceOutcomeKey && issue.type === "outcome")) {
      artifact.planningStage = "outcome-decomposition";
      artifact.sourceOutcomeKey = sourceOutcomeKey;
    }
  }
}

function diagnoseWorkPlan(artifact, { sourceVersion }) {
  const decisions = [];
  if (!artifact.project?.projectStatus) {
    decisions.push(decision("missing-project-status", "project.projectStatus", "Resolve the live Linear Project status before apply."));
  }
  if (!new Set(["goal-structure", "outcome-decomposition"]).has(artifact.planningStage)) {
    decisions.push(decision("planning-stage", "planningStage", "Choose goal-structure or one unambiguous source outcome for decomposition."));
  }
  if (artifact.planningStage === "outcome-decomposition") {
    const source = artifact.sourceOutcomeKey;
    if (!source || (artifact.issues ?? []).some((issue) => issue.key !== source && issue.parentKey !== source)) {
      decisions.push(decision("planning-stage", "sourceOutcomeKey", "Choose one source outcome and direct child scope."));
    }
  }
  if (artifact.project?.lifecycle && (!Array.isArray(artifact.project.lifecycle.completionCriteria) || artifact.project.lifecycle.completionCriteria.length === 0)) {
    decisions.push(decision("missing-completion-criteria", "project.lifecycle.completionCriteria", "Define observable lifecycle completion criteria."));
  }
  (artifact.issues ?? []).forEach((issue, index) => {
    if (!issue.delivery) decisions.push(decision("missing-delivery", `issues[${index}].delivery`, "Choose an explicit delivery mode and terminal checks."));
    if (!Object.hasOwn(issue, "priority") || issue.priority === "none") {
      decisions.push(decision("missing-priority", `issues[${index}].priority`, "Resolve legacy priority without silently defaulting it."));
    }
    if (issue.type === "task" && !issue.parentKey) decisions.push(decision("missing-task-parent", `issues[${index}].parentKey`, "Choose the direct parent outcome."));
  });
  return { warnings: [], decisions: dedupeDecisions(decisions) };
}

const TERMINAL_SIGNALS = {
  "software-merge": /\b(?:pull request|PR|merge(?:d)?|integration branch|main branch)\b/iu,
  "production-release": /\b(?:production|deploy(?:ment|ed)?|release|rollout|smoke)\b/iu,
  "operations-change": /\b(?:DNS|WAF|HSTS|edge configuration|ruleset|operational change)\b/iu,
};

function conflictsWithDeclaredMode(mode, checkText) {
  return Object.entries(TERMINAL_SIGNALS)
    .some(([candidate, pattern]) => candidate !== mode && pattern.test(checkText));
}

function diagnoseLegacyTerminalBoundaries(input) {
  const decisions = [];
  const terminalSignals = TERMINAL_SIGNALS;
  (input.issues ?? []).forEach((issue, index) => {
    const mode = issue?.delivery?.mode;
    const checks = Array.isArray(issue?.delivery?.verification) ? issue.delivery.verification : [];
    if (!mode || checks.some((check) => typeof check !== "string")) return;
    const conflicting = Object.entries(terminalSignals)
      .filter(([candidate, pattern]) => candidate !== mode && checks.some((check) => pattern.test(check)))
      .map(([candidate]) => candidate);
    if (conflicting.length) {
      decisions.push(decision(
        "mixed-terminal-boundary",
        `issues[${index}].delivery.verification`,
        `Split legacy ${mode} verification from explicit ${conflicting.join(", ")} terminal evidence.`,
      ));
    }
  });
  return decisions;
}

function migrateHandoffV1(input) {
  const delivery = input.delivery ? {
    mode: input.delivery.mode,
    ownerRole: input.fromRole,
    phase: input.delivery.phase,
    ...(input.delivery.target ? { target: input.delivery.target } : {}),
    checks: [],
  } : undefined;
  return {
    schemaVersion: 2,
    kind: input.kind,
    type: input.type,
    issueId: input.issueId,
    fromRole: input.fromRole,
    ...(input.toRole ? { toRole: input.toRole } : {}),
    summary: input.summary,
    transition: inferHandoffTransition(input),
    ...(input.deliverables ? { deliverables: structuredClone(input.deliverables) } : {}),
    checks: structuredClone(input.checks ?? []),
    evidence: (input.evidence ?? []).map(migrateEvidence),
    ...(input.knownLimitations ? { knownLimitations: structuredClone(input.knownLimitations) } : {}),
    ...(delivery ? { delivery } : {}),
    ...(input.review ? { review: structuredClone(input.review) } : {}),
    ...(input.blocker ? { blocker: structuredClone(input.blocker) } : {}),
    ...(input.software ? { software: structuredClone(input.software) } : {}),
    nextAction: input.nextAction,
  };
}

function inferHandoffTransition(input) {
  if (input.type === "handoff") return { from: "in-progress", to: "in-review" };
  if (input.type === "review" && input.review?.decision === "changes-requested") return { from: "in-review", to: "ready" };
  if (input.type === "blocked") return { from: "in-progress", to: "blocked" };
  return undefined;
}

function migrateEvidence(item) {
  const value = item?.value ?? "";
  if (/^Linear resource:/u.test(value)) return { kind: "linear-resource", label: item.label, value, visibility: "shared" };
  if (/^https?:\/\//u.test(value)) return { kind: "url", label: item.label, value, visibility: "shared" };
  if (/^(?:file:|\/|[A-Za-z]:\\|\.{0,2}\/)/u.test(value)) return { kind: "local-file", label: item.label, value, visibility: "local" };
  return { kind: "text", label: item.label, value, visibility: "shared" };
}

function decision(code, path, message) {
  return { code, path, message };
}

function dedupeDecisions(decisions) {
  const seen = new Set();
  return decisions.filter((item) => {
    const key = `${item.code}:${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hashArtifact(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function serializeJson(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function decodeCanonicalBase64(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const bytes = Buffer.from(value, "base64");
    return bytes.toString("base64") === value ? bytes : null;
  } catch {
    return null;
  }
}

async function atomicWriteJson(path, value) {
  await atomicWriteBytes(path, serializeJson(value));
}

async function atomicWriteBytes(path, value) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

async function atomicCreateBytes(path, value) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { mode: 0o600, flag: "wx" });
  try {
    await link(temporary, path);
    await chmod(path, 0o600);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function restoreDisplacedOutput(displacedPath, outputPath) {
  try {
    await link(displacedPath, outputPath);
    await unlink(displacedPath);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`rollback conflict: independent output preserved; displaced bytes retained at ${displacedPath}`);
    throw error;
  }
}
