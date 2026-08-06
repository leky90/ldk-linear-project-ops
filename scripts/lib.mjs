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
  if (plan?.schemaVersion === 1) return validateLegacyWorkPlan(plan, { projectId, teamId, forApply, roles });
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["plan must be an object"];
  if (plan.schemaVersion !== 2) errors.push("schemaVersion must be 2");
  if (plan.kind !== "linear-role-work-plan") errors.push("kind must be linear-role-work-plan");
  if (!new Set(["preview", "apply"]).has(plan.mode)) errors.push("mode must be preview or apply");
  if (forApply && plan.mode !== "apply") errors.push("mode must be apply for mutations");
  requiredString(plan.summary, "summary", errors);

  const project = plan.project;
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    errors.push("project must be an object");
  } else {
    requiredString(project.id, "project.id", errors);
    validateStringArray(project.teamIds, "project.teamIds", errors, { nonEmpty: true });
    if (projectId && project.id !== projectId) errors.push(`project.id ${project.id} does not match bound project ${projectId}`);
    if (teamId && Array.isArray(project.teamIds) && !project.teamIds.includes(teamId)) errors.push(`project.teamIds must include bound team ${teamId}`);
    if (project.status !== undefined && !new Set(["planned", "started", "paused", "completed", "canceled"]).has(project.status)) errors.push("project.status is invalid");
    if (project.priority !== undefined && !new Set(["urgent", "high", "normal", "low", "none"]).has(project.priority)) errors.push("project.priority is invalid");
    validateOptionalDate(project.startDate, "project.startDate", errors);
    validateOptionalDate(project.targetDate, "project.targetDate", errors);
    if (isDateAfter(project.startDate, project.targetDate)) errors.push("project.startDate cannot be after project.targetDate");
    if (project.memberIds !== undefined) validateStringArray(project.memberIds, "project.memberIds", errors);
    if (project.initiativeKeys !== undefined) validateStringArray(project.initiativeKeys, "project.initiativeKeys", errors);
  }

  const initiatives = Array.isArray(plan.initiatives) ? plan.initiatives : [];
  const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];
  const resources = Array.isArray(plan.resources) ? plan.resources : [];
  const issues = Array.isArray(plan.issues) ? plan.issues : [];
  if (!Array.isArray(plan.initiatives)) errors.push("initiatives must be an array");
  if (!Array.isArray(plan.milestones)) errors.push("milestones must be an array");
  if (!Array.isArray(plan.resources)) errors.push("resources must be an array");
  if (!Array.isArray(plan.issues) || issues.length === 0) errors.push("issues must be a non-empty array");

  const allKeys = new Set();
  const initiativeKeys = new Set();
  const milestoneKeys = new Set();
  const resourceKeys = new Set();
  const issueKeys = new Set();
  const issueByKey = new Map();
  function register(key, location, collection) {
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) errors.push(`${location}.key is invalid`);
    if (allKeys.has(key)) errors.push(`duplicate stable key: ${key}`);
    allKeys.add(key);
    collection.add(key);
  }

  initiatives.forEach((item, index) => {
    const at = `initiatives[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) return errors.push(`${at} must be an object`);
    register(item.key, at, initiativeKeys);
    requiredString(item.name, `${at}.name`, errors);
    requiredString(item.objective, `${at}.objective`, errors);
    if (!new Set(["proposed", "planned", "active", "completed", "canceled"]).has(item.status)) errors.push(`${at}.status is invalid`);
    if (!new Set(["urgent", "high", "normal", "low", "none"]).has(item.priority)) errors.push(`${at}.priority is invalid`);
    validateOptionalDate(item.targetDate, `${at}.targetDate`, errors);
    validateStringArray(item.resourceKeys, `${at}.resourceKeys`, errors);
    if (item.labels !== undefined) validateStringArray(item.labels, `${at}.labels`, errors);
  });

  milestones.forEach((item, index) => {
    const at = `milestones[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) return errors.push(`${at} must be an object`);
    register(item.key, at, milestoneKeys);
    requiredString(item.name, `${at}.name`, errors);
    validateOptionalDate(item.targetDate, `${at}.targetDate`, errors);
    if (isDateAfter(project?.startDate, item.targetDate)) errors.push(`${at}.targetDate cannot be before project.startDate`);
    if (isDateAfter(item.targetDate, project?.targetDate)) errors.push(`${at}.targetDate cannot be after project.targetDate`);
  });

  resources.forEach((item, index) => {
    const at = `resources[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) return errors.push(`${at} must be an object`);
    register(item.key, at, resourceKeys);
    requiredString(item.title, `${at}.title`, errors);
    if (!new Set(["document", "url", "repository", "reference"]).has(item.type)) errors.push(`${at}.type is invalid`);
    if (!item.url && !item.content) errors.push(`${at} must include url or content`);
  });

  issues.forEach((item, index) => {
    const at = `issues[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) return errors.push(`${at} must be an object`);
    register(item.key, at, issueKeys);
    issueByKey.set(item.key, item);
    if (!new Set(["outcome", "task", "decision"]).has(item.type)) errors.push(`${at}.type is invalid; use outcome instead of an issue-level initiative`);
    requiredString(item.title, `${at}.title`, errors);
    requiredString(item.outcome, `${at}.outcome`, errors);
    requiredString(item.deliverable, `${at}.deliverable`, errors);
    if (!new Set(["Refinement", "Ready", "Blocked"]).has(item.status)) errors.push(`${at}.status is invalid`);
    if (!new Set(["urgent", "high", "normal", "low", "none"]).has(item.priority)) errors.push(`${at}.priority is invalid`);
    validateRole(item.ownerRole, `${at}.ownerRole`, roles, errors);
    validateRole(item.reviewerRole, `${at}.reviewerRole`, roles, errors, { optional: true });
    validateStringArray(item.definitionOfReady, `${at}.definitionOfReady`, errors, { nonEmpty: true });
    validateStringArray(item.definitionOfDone, `${at}.definitionOfDone`, errors, { nonEmpty: true });
    validateStringArray(item.resourceKeys, `${at}.resourceKeys`, errors);
    if (item.labels !== undefined) validateStringArray(item.labels, `${at}.labels`, errors);
    validateOptionalDate(item.dueDate, `${at}.dueDate`, errors);
    if (item.estimate !== undefined && (typeof item.estimate !== "number" || item.estimate < 0 || !Number.isFinite(item.estimate))) errors.push(`${at}.estimate must be a non-negative number`);
    if (item.type === "outcome" && item.parentKey) errors.push(`${at}.parentKey is forbidden for outcome`);
    if (item.type === "decision" && item.status === "Ready") errors.push(`${at}.decision must remain Refinement or Blocked until decided`);
    if (!item.relations || typeof item.relations !== "object" || Array.isArray(item.relations)) {
      errors.push(`${at}.relations must be an object`);
    } else {
      validateStringArray(item.relations.blockedByKeys, `${at}.relations.blockedByKeys`, errors);
      validateStringArray(item.relations.relatedToKeys, `${at}.relations.relatedToKeys`, errors);
    }
  });

  for (const key of project?.initiativeKeys ?? []) if (!initiativeKeys.has(key)) errors.push(`project.initiativeKeys references unknown initiative ${key}`);
  initiatives.forEach((item, index) => {
    for (const key of item?.resourceKeys ?? []) if (!resourceKeys.has(key)) errors.push(`initiatives[${index}].resourceKeys references unknown resource ${key}`);
  });
  issues.forEach((item, index) => {
    const at = `issues[${index}]`;
    if (item?.parentKey) {
      const parent = issueByKey.get(item.parentKey);
      if (!parent) errors.push(`${at}.parentKey references unknown issue ${item.parentKey}`);
      else if (parent.type !== "outcome") errors.push(`${at}.parentKey must reference an outcome issue`);
    }
    if (item?.milestoneKey && !milestoneKeys.has(item.milestoneKey)) errors.push(`${at}.milestoneKey references unknown milestone ${item.milestoneKey}`);
    for (const key of item?.resourceKeys ?? []) if (!resourceKeys.has(key)) errors.push(`${at}.resourceKeys references unknown resource ${key}`);
    const relations = item?.relations ?? {};
    for (const field of ["blockedByKeys", "relatedToKeys"]) {
      for (const key of relations[field] ?? []) if (!issueKeys.has(key)) errors.push(`${at}.relations.${field} references unknown issue ${key}`);
    }
    if (relations.duplicateOfKey && !issueKeys.has(relations.duplicateOfKey)) errors.push(`${at}.relations.duplicateOfKey references unknown issue ${relations.duplicateOfKey}`);
    if ((relations.blockedByKeys ?? []).includes(item?.key) || (relations.relatedToKeys ?? []).includes(item?.key) || relations.duplicateOfKey === item?.key) errors.push(`${at} cannot relate to itself`);
  });
  const dependencies = new Map(issues.map((item) => [item.key, item.relations?.blockedByKeys ?? []]));
  for (const cycle of detectCycles(issueKeys, dependencies)) errors.push(`dependency cycle: ${cycle.join(" -> ")}`);
  const secretPaths = findSecretPaths(plan);
  if (secretPaths.length) errors.push(`secret-like data is forbidden at: ${[...new Set(secretPaths)].join(", ")}`);
  return [...new Set(errors)];
}

function validateLegacyWorkPlan(plan, { projectId, teamId, forApply = false, roles = DEFAULT_ROLES } = {}) {
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

function validateOptionalDate(value, location, errors) {
  if (value === undefined) return;
  if (parseIsoDate(value) === null) errors.push(`${location} must be a valid ISO date`);
}

function isDateAfter(left, right) {
  const leftValue = parseIsoDate(left);
  const rightValue = parseIsoDate(right);
  return leftValue !== null && rightValue !== null && leftValue > rightValue;
}

function parseIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.valueOf();
}

export function validateProjectUpdate(update, { projectId, forPublish = false } = {}) {
  const errors = [];
  if (!update || typeof update !== "object" || Array.isArray(update)) return ["project update must be an object"];
  if (update.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (update.kind !== "linear-project-update") errors.push("kind must be linear-project-update");
  if (!new Set(["preview", "publish"]).has(update.mode)) errors.push("mode must be preview or publish");
  if (forPublish && update.mode !== "publish") errors.push("mode must be publish for a Linear mutation");
  requiredString(update.projectId, "projectId", errors);
  if (projectId && update.projectId !== projectId) errors.push(`projectId ${update.projectId} does not match bound project ${projectId}`);
  if (!new Set(["on-track", "at-risk", "off-track"]).has(update.health)) errors.push("health is invalid");
  requiredString(update.summary, "summary", errors);
  validateStringArray(update.progress, "progress", errors);
  validateStringArray(update.risks, "risks", errors);
  validateStringArray(update.nextSteps, "nextSteps", errors, { nonEmpty: true });
  if (!Array.isArray(update.evidence)) errors.push("evidence must be an array");
  else update.evidence.forEach((item, index) => {
    requiredString(item?.label, `evidence[${index}].label`, errors);
    requiredString(item?.value, `evidence[${index}].value`, errors);
  });
  const secretPaths = findSecretPaths(update);
  if (secretPaths.length) errors.push(`secret-like data is forbidden at: ${[...new Set(secretPaths)].join(", ")}`);
  return [...new Set(errors)];
}

export function renderProjectUpdate(update) {
  const errors = validateProjectUpdate(update);
  if (errors.length) throw new Error(`invalid project update: ${errors.join("; ")}`);
  const bullets = (items, fallback) => items.length ? items.map((item) => `- ${item}`) : [`- ${fallback}`];
  const evidence = update.evidence.length ? update.evidence.map((item) => `- **${item.label}:** ${item.value}`) : ["- Chưa có evidence mới."];
  const health = { "on-track": "On track", "at-risk": "At risk", "off-track": "Off track" }[update.health];
  return [
    `# Project Update · ${health}`,
    "", update.summary,
    "", "## Tiến độ", "", ...bullets(update.progress, "Chưa có thay đổi tiến độ được ghi nhận."),
    "", "## Rủi ro", "", ...bullets(update.risks, "Không có rủi ro được ghi nhận."),
    "", "## Bước tiếp theo", "", ...bullets(update.nextSteps, "Chưa xác định."),
    "", "## Bằng chứng", "", ...evidence,
    "",
  ].join("\n");
}

export function validateLegacyCleanupPlan(plan, { projectId, forApply = false } = {}) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["cleanup plan must be an object"];
  if (plan.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (plan.kind !== "linear-legacy-cleanup-plan") errors.push("kind must be linear-legacy-cleanup-plan");
  if (!new Set(["preview", "apply"]).has(plan.mode)) errors.push("mode must be preview or apply");
  if (forApply && plan.mode !== "apply") errors.push("mode must be apply for destructive cleanup");
  requiredString(plan.projectId, "projectId", errors);
  if (projectId && plan.projectId !== projectId) errors.push(`projectId ${plan.projectId} does not match bound project ${projectId}`);
  if (typeof plan.planId !== "string" || !KEY_PATTERN.test(plan.planId)) errors.push("planId is invalid");
  if (typeof plan.snapshotAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(plan.snapshotAt) || Number.isNaN(Date.parse(plan.snapshotAt))) errors.push("snapshotAt must be a valid ISO timestamp with timezone");
  if (!Array.isArray(plan.entries) || plan.entries.length === 0) errors.push("entries must be a non-empty array");
  const ids = new Set();
  const destructive = new Set(["MERGE_THEN_DELETE", "CONVERT_TO_RESOURCE_THEN_DELETE", "DELETE_ISSUE", "DELETE_COMMENT"]);
  for (const [index, entry] of (plan.entries ?? []).entries()) {
    const at = `entries[${index}]`;
    if (!new Set(["issue", "comment", "resource"]).has(entry?.entityType)) errors.push(`${at}.entityType is invalid`);
    requiredString(entry?.id, `${at}.id`, errors);
    if (ids.has(entry?.id)) errors.push(`duplicate cleanup entity id: ${entry.id}`);
    ids.add(entry?.id);
    if (!new Set(["KEEP", "NORMALIZE", "MERGE_THEN_DELETE", "CONVERT_TO_RESOURCE_THEN_DELETE", "DELETE_ISSUE", "DELETE_COMMENT", "NEEDS_DECISION"]).has(entry?.action)) errors.push(`${at}.action is invalid`);
    requiredString(entry?.reason, `${at}.reason`, errors);
    validateStringArray(entry?.preserve, `${at}.preserve`, errors);
    if ((entry?.action === "MERGE_THEN_DELETE") && !entry.canonicalIssueId) errors.push(`${at}.canonicalIssueId is required for MERGE_THEN_DELETE`);
    if (entry?.action === "DELETE_ISSUE" && entry?.entityType !== "issue") errors.push(`${at}.DELETE_ISSUE requires entityType issue`);
    if (entry?.action === "DELETE_COMMENT" && entry?.entityType !== "comment") errors.push(`${at}.DELETE_COMMENT requires entityType comment`);
    if (forApply && destructive.has(entry?.action) && entry?.approved !== true) errors.push(`${at}.approved must be explicitly approved (true) for destructive cleanup`);
  }
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
