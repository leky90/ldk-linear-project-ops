import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,95}$/u;
const ROLE_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const SECRET_KEY_PATTERN = /(?:api[_-]?key|access[_-]?token|secret|password|private[_-]?key|credential|authorization)/iu;
const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/u,
  /\blin_api_[A-Za-z0-9_-]{16,}\b/u,
  /\bgh[opusr]_[A-Za-z0-9_]{20,}\b/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
];

export const DEFAULT_ROLES = Object.freeze({
  cpo: { label: "role:cpo", defaultReviewer: "tech-lead" },
  "product-manager": { label: "role:product-manager", defaultReviewer: "cpo" },
  "tech-lead": { label: "role:tech-lead", defaultReviewer: "cpo" },
  "software-engineer": { label: "role:software-engineer", defaultReviewer: "qa" },
  qa: { label: "role:qa", defaultReviewer: "tech-lead" },
  "content-director": { label: "role:content-director", defaultReviewer: "cpo" },
  "content-writer": { label: "role:content-writer", defaultReviewer: "content-director" },
  "marketing-lead": { label: "role:marketing-lead", defaultReviewer: "cpo" },
  marketer: { label: "role:marketer", defaultReviewer: "marketing-lead" },
  "sales-manager": { label: "role:sales-manager", defaultReviewer: "cpo" },
  "sales-representative": { label: "role:sales-representative", defaultReviewer: "sales-manager" },
});

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function parseCli(args) {
  const positional = [];
  const flags = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const [name, inline] = value.slice(2).split("=", 2);
    if (inline !== undefined) {
      flags.set(name, inline);
    } else if (args[index + 1] && !args[index + 1].startsWith("--")) {
      flags.set(name, args[index + 1]);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }
  return { positional, flags };
}

export function stableKey(...parts) {
  const raw = parts.filter(Boolean).join(":").trim().toLowerCase();
  const slug = raw
    .replaceAll("đ", "d")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 54) || "work";
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 10);
  return `${slug}-${digest}`;
}

export function findSecretPaths(value, path = "$", matches = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findSecretPaths(entry, `${path}[${index}]`, matches));
    return matches;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path);
    return matches;
  }
  for (const [key, entry] of Object.entries(value)) {
    const child = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key)) matches.push(child);
    findSecretPaths(entry, child, matches);
  }
  return matches;
}

function requiredString(value, location, errors) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${location} is required`);
}

function validateRole(role, location, roles, errors, { optional = false } = {}) {
  if (role === undefined && optional) return;
  if (typeof role !== "string" || !ROLE_PATTERN.test(role)) {
    errors.push(`${location} must be a role slug`);
  } else if (roles && !Object.hasOwn(roles, role)) {
    errors.push(`${location} references unknown role ${role}`);
  }
}

function validateStringArray(value, location, errors, { nonEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${location} must be an array`);
    return;
  }
  if (nonEmpty && value.length === 0) errors.push(`${location} must be non-empty`);
  if (new Set(value).size !== value.length) errors.push(`${location} must contain unique values`);
  value.forEach((entry, index) => requiredString(entry, `${location}[${index}]`, errors));
}

export function normalizeProjectBinding(binding) {
  if (binding?.schemaVersion === 2) return structuredClone(binding);
  if (binding?.schemaVersion !== 1) return structuredClone(binding);
  const oldStates = binding.workflow?.states ?? {};
  return {
    schemaVersion: 2,
    project: structuredClone(binding.project ?? {}),
    workflow: {
      states: {
        refinement: oldStates.refinement ?? oldStates.ready ?? "Refinement",
        ready: oldStates.ready,
        inProgress: oldStates.inProgress,
        inReview: oldStates.inReview,
        blocked: oldStates.blocked,
        done: oldStates.done,
      },
      roles: structuredClone(DEFAULT_ROLES),
    },
  };
}

export function validateProjectBinding(binding, { allowPlaceholders = false, allowLegacy = true } = {}) {
  const errors = [];
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return ["binding must be an object"];
  if (![1, 2].includes(binding.schemaVersion)) return ["schemaVersion must be 2"];
  if (binding.schemaVersion === 1 && !allowLegacy) errors.push("schemaVersion 1 is legacy; migrate to schemaVersion 2");
  const normalized = normalizeProjectBinding(binding);
  const project = normalized.project;
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    errors.push("project must be an object");
  } else {
    for (const field of ["slug", "name", "linearProjectId", "linearTeamId"]) requiredString(project[field], `project.${field}`, errors);
    if (typeof project.slug === "string" && !/^[a-z0-9][a-z0-9-]{1,62}$/u.test(project.slug)) errors.push("project.slug is invalid");
    for (const field of ["linearProjectId", "linearTeamId"]) {
      if (!allowPlaceholders && typeof project[field] === "string" && /^(?:replace-with-|example-)/u.test(project[field])) errors.push(`project.${field} is a placeholder`);
    }
    if (project.historicalProjectIds !== undefined && !Array.isArray(project.historicalProjectIds)) errors.push("project.historicalProjectIds must be an array");
    if (Array.isArray(project.historicalProjectIds) && project.historicalProjectIds.includes(project.linearProjectId)) errors.push("project.linearProjectId cannot also be historical");
  }
  const workflow = normalized.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    errors.push("workflow must be an object");
  } else {
    for (const field of ["refinement", "ready", "inProgress", "inReview", "blocked", "done"]) requiredString(workflow.states?.[field], `workflow.states.${field}`, errors);
    const roles = workflow.roles;
    if (!roles || typeof roles !== "object" || Array.isArray(roles) || Object.keys(roles).length === 0) {
      errors.push("workflow.roles must define at least one role");
    } else {
      for (const [role, config] of Object.entries(roles)) {
        validateRole(role, `workflow.roles.${role}`, null, errors);
        if (!config || typeof config !== "object" || Array.isArray(config)) {
          errors.push(`workflow.roles.${role} must be an object`);
          continue;
        }
        if (config.label !== `role:${role}`) errors.push(`workflow.roles.${role}.label must be role:${role}`);
        validateRole(config.defaultReviewer, `workflow.roles.${role}.defaultReviewer`, roles, errors, { optional: true });
      }
    }
  }
  const secretPaths = findSecretPaths(binding);
  if (secretPaths.length) errors.push(`secret-like data is forbidden at: ${[...new Set(secretPaths)].join(", ")}`);
  return [...new Set(errors)];
}

export function detectCycles(keys, dependencies) {
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];
  function visit(key, path) {
    if (visiting.has(key)) {
      const start = path.indexOf(key);
      cycles.push([...path.slice(start), key]);
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of dependencies.get(key) ?? []) if (keys.has(dependency)) visit(dependency, [...path, key]);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of keys) visit(key, []);
  return cycles;
}

export function validateWorkPlan(plan, { projectId, teamId, forApply = false, roles = DEFAULT_ROLES } = {}) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["plan must be an object"];
  if (plan.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (plan.kind !== "linear-role-work-plan") errors.push("kind must be linear-role-work-plan");
  if (!new Set(["preview", "apply"]).has(plan.mode)) errors.push("mode must be preview or apply");
  if (forApply && plan.mode !== "apply") errors.push("mode must be apply for mutations");
  requiredString(plan.projectId, "projectId", errors);
  requiredString(plan.teamId, "teamId", errors);
  requiredString(plan.summary, "summary", errors);
  if (projectId && plan.projectId !== projectId) errors.push(`projectId ${plan.projectId} does not match bound project ${projectId}`);
  if (teamId && plan.teamId !== teamId) errors.push(`teamId ${plan.teamId} does not match bound team ${teamId}`);
  const resources = Array.isArray(plan.resources) ? plan.resources : [];
  const issues = Array.isArray(plan.issues) ? plan.issues : [];
  if (!Array.isArray(plan.resources)) errors.push("resources must be an array");
  if (!Array.isArray(plan.issues) || issues.length === 0) errors.push("issues must be a non-empty array");
  const allKeys = new Set();
  const resourceKeys = new Set();
  const issueKeys = new Set();
  function register(key, location) {
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) errors.push(`${location}.key is invalid`);
    if (allKeys.has(key)) errors.push(`duplicate stable key: ${key}`);
    allKeys.add(key);
  }
  resources.forEach((resource, index) => {
    const at = `resources[${index}]`;
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) return errors.push(`${at} must be an object`);
    register(resource.key, at);
    resourceKeys.add(resource.key);
    requiredString(resource.title, `${at}.title`, errors);
    if (!new Set(["document", "url", "repository", "reference"]).has(resource.type)) errors.push(`${at}.type is invalid`);
    if (!resource.url && !resource.content) errors.push(`${at} must include url or content`);
  });
  issues.forEach((issue, index) => {
    const at = `issues[${index}]`;
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) return errors.push(`${at} must be an object`);
    register(issue.key, at);
    issueKeys.add(issue.key);
    if (!new Set(["initiative", "task", "decision"]).has(issue.type)) errors.push(`${at}.type is invalid`);
    requiredString(issue.title, `${at}.title`, errors);
    requiredString(issue.outcome, `${at}.outcome`, errors);
    requiredString(issue.deliverable, `${at}.deliverable`, errors);
    if (!new Set(["Refinement", "Ready", "Blocked"]).has(issue.status)) errors.push(`${at}.status is invalid`);
    if (!new Set(["urgent", "high", "normal", "low", "none"]).has(issue.priority)) errors.push(`${at}.priority is invalid`);
    validateRole(issue.ownerRole, `${at}.ownerRole`, roles, errors);
    validateRole(issue.reviewerRole, `${at}.reviewerRole`, roles, errors, { optional: true });
    validateStringArray(issue.definitionOfReady, `${at}.definitionOfReady`, errors, { nonEmpty: true });
    validateStringArray(issue.definitionOfDone, `${at}.definitionOfDone`, errors, { nonEmpty: true });
    validateStringArray(issue.resourceKeys, `${at}.resourceKeys`, errors);
    validateStringArray(issue.blockedByKeys, `${at}.blockedByKeys`, errors);
    if (issue.type === "initiative" && issue.parentKey) errors.push(`${at}.parentKey is forbidden for initiative`);
    if (issue.type === "task" && !issue.parentKey) errors.push(`${at}.parentKey is required for task`);
    if (issue.type === "decision" && issue.status === "Ready") errors.push(`${at}.decision must remain Refinement or Blocked until decided`);
  });
  issues.forEach((issue, index) => {
    const at = `issues[${index}]`;
    if (issue?.parentKey && !issueKeys.has(issue.parentKey)) errors.push(`${at}.parentKey references unknown issue ${issue.parentKey}`);
    for (const key of issue?.resourceKeys ?? []) if (!resourceKeys.has(key)) errors.push(`${at}.resourceKeys references unknown resource ${key}`);
    for (const key of issue?.blockedByKeys ?? []) if (!issueKeys.has(key)) errors.push(`${at}.blockedByKeys references unknown issue ${key}`);
    if ((issue?.blockedByKeys ?? []).includes(issue?.key)) errors.push(`${at} cannot block itself`);
  });
  const dependencies = new Map(issues.map((issue) => [issue.key, issue.blockedByKeys ?? []]));
  for (const cycle of detectCycles(issueKeys, dependencies)) errors.push(`dependency cycle: ${cycle.join(" -> ")}`);
  const secretPaths = findSecretPaths(plan);
  if (secretPaths.length) errors.push(`secret-like data is forbidden at: ${[...new Set(secretPaths)].join(", ")}`);
  return [...new Set(errors)];
}

export function validateHandoff(handoff, { roles = DEFAULT_ROLES } = {}) {
  const errors = [];
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) return ["handoff must be an object"];
  if (handoff.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (handoff.kind !== "linear-role-handoff") errors.push("kind must be linear-role-handoff");
  if (!new Set(["handoff", "review", "blocked", "reconciliation"]).has(handoff.type)) errors.push("type is invalid");
  requiredString(handoff.issueId, "issueId", errors);
  requiredString(handoff.summary, "summary", errors);
  requiredString(handoff.nextAction, "nextAction", errors);
  validateRole(handoff.fromRole, "fromRole", roles, errors);
  validateRole(handoff.toRole, "toRole", roles, errors, { optional: true });
  if (!Array.isArray(handoff.checks)) errors.push("checks must be an array");
  else handoff.checks.forEach((check, index) => {
    requiredString(check?.item, `checks[${index}].item`, errors);
    if (typeof check?.passed !== "boolean") errors.push(`checks[${index}].passed must be boolean`);
  });
  if (!Array.isArray(handoff.evidence)) errors.push("evidence must be an array");
  else handoff.evidence.forEach((item, index) => {
    requiredString(item?.label, `evidence[${index}].label`, errors);
    requiredString(item?.value, `evidence[${index}].value`, errors);
  });
  if (handoff.type === "handoff") {
    validateRole(handoff.toRole, "toRole", roles, errors);
    validateStringArray(handoff.deliverables, "deliverables", errors, { nonEmpty: true });
    if (!Array.isArray(handoff.checks) || handoff.checks.length === 0) errors.push("handoff checks must include the Definition of Done");
    if (!Array.isArray(handoff.evidence) || handoff.evidence.length === 0) errors.push("handoff evidence must be non-empty");
    if ((handoff.checks ?? []).some((check) => check?.passed !== true)) errors.push("all Definition of Done checks must pass before handoff");
  }
  if (handoff.type === "review") {
    if (!Array.isArray(handoff.checks) || handoff.checks.length === 0) errors.push("review checks must include the Definition of Done");
    if (!Array.isArray(handoff.evidence) || handoff.evidence.length === 0) errors.push("review evidence must be non-empty");
    if (!new Set(["passed", "changes-requested"]).has(handoff.review?.decision)) errors.push("review.decision is invalid");
    if (!Array.isArray(handoff.review?.findings)) errors.push("review.findings must be an array");
    if (handoff.review?.decision === "passed" && (handoff.checks ?? []).some((check) => check?.passed !== true)) errors.push("a passed review requires all checks to pass");
    if (handoff.review?.decision === "changes-requested") validateRole(handoff.toRole, "toRole", roles, errors);
  }
  if (handoff.type === "blocked") {
    for (const field of ["reason", "impact", "neededFrom", "resumeWhen"]) requiredString(handoff.blocker?.[field], `blocker.${field}`, errors);
  }
  if (handoff.software !== undefined) {
    if (handoff.type !== "handoff") errors.push("software evidence is only valid for a handoff");
    if (handoff.fromRole !== "software-engineer") errors.push("software evidence requires fromRole software-engineer");
    if (typeof handoff.software?.commitSha !== "string" || !/^[0-9a-f]{7,64}$/iu.test(handoff.software.commitSha)) errors.push("software.commitSha is invalid");
    requiredString(handoff.software?.branchName, "software.branchName", errors);
    if (typeof handoff.software?.git?.baselineId !== "string" || !/^[0-9a-f]{64}$/iu.test(handoff.software.git.baselineId)) errors.push("software.git.baselineId is invalid");
    if (typeof handoff.software?.git?.changeBaseSha !== "string" || !/^[0-9a-f]{7,64}$/iu.test(handoff.software.git.changeBaseSha)) errors.push("software.git.changeBaseSha is invalid");
    validateStringArray(handoff.software?.git?.scopePaths, "software.git.scopePaths", errors, { nonEmpty: true });
  }
  const secretPaths = findSecretPaths(handoff);
  if (secretPaths.length) errors.push(`secret-like data is forbidden at: ${[...new Set(secretPaths)].join(", ")}`);
  return [...new Set(errors)];
}

export function renderWorkComment(handoff, { roles = DEFAULT_ROLES } = {}) {
  const errors = validateHandoff(handoff, { roles });
  if (errors.length) throw new Error(`invalid handoff: ${errors.join("; ")}`);
  const role = (value) => value?.replaceAll("-", " ") ?? "—";
  const bullets = (items, fallback = "- Không có.") => items?.length ? items.map((item) => `- ${item}`) : [fallback];
  const evidence = handoff.evidence?.length ? handoff.evidence.map((item) => `- **${item.label}:** ${item.value}`) : ["- Không có bằng chứng đính kèm."];
  const checks = handoff.checks?.length ? handoff.checks.map((item) => `- [${item.passed ? "x" : " "}] ${item.item}`) : ["- Không có kiểm tra được khai báo."];
  const next = ["", "## Bước tiếp theo", "", handoff.nextAction];
  if (handoff.type === "handoff") return [
    `## ✅ Bàn giao · ${role(handoff.fromRole)} → ${role(handoff.toRole)}`,
    "", "## Kết quả", "", handoff.summary,
    "", "## Sản phẩm bàn giao", "", ...bullets(handoff.deliverables),
    "", "## Kiểm tra DoD", "", ...checks,
    "", "## Bằng chứng", "", ...evidence,
    "", "## Giới hạn đã biết", "", ...bullets(handoff.knownLimitations),
    ...next, "",
  ].join("\n");
  if (handoff.type === "review") {
    const passed = handoff.review.decision === "passed";
    return [
      `## ${passed ? "✅ Review đạt" : "🔁 Yêu cầu chỉnh sửa"} · ${role(handoff.fromRole)}`,
      "", "## Kết luận", "", handoff.summary,
      "", "## Kiểm tra DoD", "", ...checks,
      "", "## Phát hiện", "", ...bullets(handoff.review.findings),
      "", "## Bằng chứng", "", ...evidence,
      ...next, "",
    ].join("\n");
  }
  if (handoff.type === "blocked") return [
    `## ⛔ Bị chặn · ${role(handoff.fromRole)}`,
    "", "## Tình trạng", "", handoff.summary,
    "", "## Nguyên nhân", "", handoff.blocker.reason,
    "", "## Ảnh hưởng", "", handoff.blocker.impact,
    "", "## Cần từ", "", handoff.blocker.neededFrom,
    "", "## Tiếp tục khi", "", handoff.blocker.resumeWhen,
    ...next, "",
  ].join("\n");
  return [
    `## 🧭 Hòa giải · ${role(handoff.fromRole)}`,
    "", "## Kết quả", "", handoff.summary,
    "", "## Bằng chứng", "", ...evidence,
    ...next, "",
  ].join("\n");
}
