import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,95}$/u;
const SECRET_KEY_PATTERN = /(?:api[_-]?key|access[_-]?token|authorization|password|passwd|secret|credential)/iu;
const SECRET_VALUE_PATTERNS = [
  /\blin_api_[A-Za-z0-9_-]{8,}\b/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*\b/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u
];

const SOFTWARE_DELIVERY_ACTIONS = new Set([
  "commit",
  "push",
  "open-pull-request",
  "mark-pull-request-ready",
  "merge",
  "deploy",
]);
const CHILD_DONE_GATES = new Set([
  "acceptance-criteria",
  "scoped-changes-accounted",
  "commit",
]);
const REVIEW_GATES = new Set([
  ...CHILD_DONE_GATES,
  "push",
  "pull-request",
  "non-draft-pull-request",
  "ci",
]);
const DONE_GATES = new Set([
  "manager-acceptance",
  "acceptance-after-last-delivery",
  "merge",
]);

export const DEFAULT_SOFTWARE_DELIVERY_POLICY = Object.freeze({
  agentActions: Object.freeze(["commit", "push", "open-pull-request", "mark-pull-request-ready"]),
  childDoneRequires: Object.freeze(["acceptance-criteria", "scoped-changes-accounted", "commit"]),
  reviewRequires: Object.freeze([
    "acceptance-criteria",
    "scoped-changes-accounted",
    "commit",
    "push",
    "pull-request",
    "non-draft-pull-request",
    "ci",
  ]),
  doneRequires: Object.freeze(["manager-acceptance", "acceptance-after-last-delivery", "merge"]),
  deployment: "when-required",
});

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function parseCli(argv) {
  const positional = [];
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(name, next);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }
  return { positional, flags };
}

export function stableKey(parts) {
  const raw = parts.map(String).join(" ");
  const slug = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/đ/gu, "d")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72)
    .replace(/-+$/gu, "") || "work";
  const digest = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 10);
  return `${slug}-${digest}`;
}

export function validateKey(key, location, errors) {
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    errors.push(`${location} must match ${KEY_PATTERN}`);
  }
}

export function findSecretPaths(value, path = "$", matches = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findSecretPaths(entry, `${path}[${index}]`, matches));
    return matches;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      matches.push(path);
    }
    return matches;
  }
  for (const [key, entry] of Object.entries(value)) {
    const child = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key)) matches.push(child);
    findSecretPaths(entry, child, matches);
  }
  return matches;
}

export function validateProjectBinding(binding, { allowPlaceholders = false } = {}) {
  const errors = [];
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return ["binding must be an object"];
  if (binding.schemaVersion !== 1) errors.push("schemaVersion must be 1");

  const project = binding.project;
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    errors.push("project must be an object");
  } else {
    if (!project.slug?.trim()) errors.push("project.slug is required");
    if (!project.name?.trim()) errors.push("project.name is required");
    for (const field of ["linearProjectId", "linearTeamId"]) {
      const value = project[field];
      if (typeof value !== "string" || !value.trim()) errors.push(`project.${field} is required`);
      else if (!allowPlaceholders && /^(?:replace-with-|example-)/u.test(value.trim())) errors.push(`project.${field} is a placeholder`);
    }
    if (project.historicalProjectIds !== undefined && !Array.isArray(project.historicalProjectIds)) {
      errors.push("project.historicalProjectIds must be an array");
    }
    if (Array.isArray(project.historicalProjectIds) && project.historicalProjectIds.includes(project.linearProjectId)) {
      errors.push("project.linearProjectId cannot also be historical");
    }
  }

  const workflow = binding.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    errors.push("workflow must be an object");
  } else {
    for (const field of ["ready", "inProgress", "inReview", "blocked", "done"]) {
      if (typeof workflow.states?.[field] !== "string" || !workflow.states[field].trim()) errors.push(`workflow.states.${field} is required`);
    }
    for (const field of ["parent", "subIssue", "decision"]) {
      if (typeof workflow.labels?.[field] !== "string" || !workflow.labels[field].trim()) errors.push(`workflow.labels.${field} is required`);
    }
    errors.push(...validateSoftwareDeliveryPolicy(workflow.softwareDelivery, { optional: true }));
  }

  const coordination = binding.coordination;
  if (!coordination || typeof coordination !== "object" || Array.isArray(coordination)) {
    errors.push("coordination must be an object");
  } else {
    const modes = new Set(["atomic-local-lease", "shared-lease-service", "linear-optimistic"]);
    if (!modes.has(coordination.mode)) errors.push("coordination.mode is invalid");
    if (coordination.mode === "atomic-local-lease" && (typeof coordination.databasePath !== "string" || !coordination.databasePath.trim())) {
      errors.push("coordination.databasePath is required for atomic-local-lease");
    }
    for (const [field, min, max] of [
      ["leaseMinutes", 5, 240],
      ["heartbeatMinutes", 1, 60],
      ["runBudgetMinutes", 5, 240],
    ]) {
      const value = coordination[field];
      if (!Number.isInteger(value) || value < min || value > max) errors.push(`coordination.${field} must be an integer from ${min} to ${max}`);
    }
    if (Number.isInteger(coordination.heartbeatMinutes) && Number.isInteger(coordination.leaseMinutes)
      && coordination.heartbeatMinutes >= coordination.leaseMinutes) {
      errors.push("coordination.heartbeatMinutes must be less than leaseMinutes");
    }
  }

  const secretPaths = findSecretPaths(binding);
  if (secretPaths.length) errors.push(`secret-like data is forbidden at: ${[...new Set(secretPaths)].join(", ")}`);
  return [...new Set(errors)];
}

export function resolveSoftwareDeliveryPolicy(binding) {
  const configured = binding?.workflow?.softwareDelivery ?? {};
  return {
    agentActions: [...(configured.agentActions ?? DEFAULT_SOFTWARE_DELIVERY_POLICY.agentActions)],
    childDoneRequires: [...(configured.childDoneRequires ?? DEFAULT_SOFTWARE_DELIVERY_POLICY.childDoneRequires)],
    reviewRequires: [...(configured.reviewRequires ?? DEFAULT_SOFTWARE_DELIVERY_POLICY.reviewRequires)],
    doneRequires: [...(configured.doneRequires ?? DEFAULT_SOFTWARE_DELIVERY_POLICY.doneRequires)],
    deployment: configured.deployment ?? DEFAULT_SOFTWARE_DELIVERY_POLICY.deployment,
  };
}

export function validateSoftwareDeliveryPolicy(policy, { optional = false, location = "workflow.softwareDelivery" } = {}) {
  if (policy === undefined && optional) return [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return [`${location} must be an object`];

  const errors = [];
  const allowedFields = new Set(["agentActions", "childDoneRequires", "reviewRequires", "doneRequires", "deployment"]);
  for (const field of Object.keys(policy)) {
    if (!allowedFields.has(field)) errors.push(`${location}.${field} is not supported`);
  }
  validateEnumArray(policy.agentActions, `${location}.agentActions`, SOFTWARE_DELIVERY_ACTIONS, errors);
  validateEnumArray(policy.childDoneRequires, `${location}.childDoneRequires`, CHILD_DONE_GATES, errors);
  validateEnumArray(policy.reviewRequires, `${location}.reviewRequires`, REVIEW_GATES, errors);
  validateEnumArray(policy.doneRequires, `${location}.doneRequires`, DONE_GATES, errors);
  if (!new Set(["never", "when-required", "always"]).has(policy.deployment)) {
    errors.push(`${location}.deployment is invalid`);
  }

  for (const [field, required] of [
    ["childDoneRequires", ["acceptance-criteria", "scoped-changes-accounted"]],
    ["reviewRequires", ["acceptance-criteria", "scoped-changes-accounted"]],
    ["doneRequires", ["manager-acceptance", "acceptance-after-last-delivery"]],
  ]) {
    if (!Array.isArray(policy[field])) continue;
    for (const gate of required) {
      if (!policy[field].includes(gate)) errors.push(`${location}.${field} must include ${gate}`);
    }
  }
  return [...new Set(errors)];
}

export function validateSoftwareDelivery(evidence, { target = "in-review", binding } = {}) {
  const errors = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return ["evidence must be an object"];
  if (evidence.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (evidence.kind !== "linear-software-delivery-evidence") errors.push("kind must be linear-software-delivery-evidence");
  if (typeof evidence.issueId !== "string" || !evidence.issueId.trim()) errors.push("issueId is required");
  if (!Array.isArray(evidence.capabilities) || !evidence.capabilities.includes("software.change")) {
    errors.push("capabilities must include software.change");
  }
  if (!new Set(["child-done", "in-review", "done"]).has(target)) errors.push(`target ${target} is invalid`);

  const policy = resolveSoftwareDeliveryPolicy(binding);
  errors.push(...validateSoftwareDeliveryPolicy(policy, { location: "softwareDelivery" }));
  const gates = target === "child-done"
    ? policy.childDoneRequires
    : target === "in-review"
      ? policy.reviewRequires
      : [...new Set([...policy.reviewRequires, ...policy.doneRequires])];

  const pullRequest = evidence.pullRequest ?? {};
  for (const gate of gates) {
    if (gate === "acceptance-criteria" && evidence.acceptanceCriteriaVerified !== true) {
      errors.push("acceptance criteria are not verified");
    } else if (gate === "scoped-changes-accounted" && evidence.scopedChangesAccounted !== true) {
      errors.push("scoped changes are not fully accounted");
    } else if (gate === "commit" && (typeof evidence.commitSha !== "string" || !/^[0-9a-f]{7,64}$/iu.test(evidence.commitSha))) {
      errors.push("a valid commitSha is required");
    } else if (gate === "push" && (evidence.branchPushed !== true || typeof evidence.branchName !== "string" || !evidence.branchName.trim())) {
      errors.push("a named pushed branch is required");
    } else if (gate === "pull-request" && (typeof pullRequest.url !== "string" || !/^https:\/\//u.test(pullRequest.url))) {
      errors.push("a pull request URL is required");
    } else if (gate === "non-draft-pull-request" && pullRequest.draft !== false) {
      errors.push("the pull request must be ready for review");
    } else if (gate === "ci" && pullRequest.ciStatus !== "passed") {
      errors.push("pull request CI must pass");
    } else if (gate === "manager-acceptance" && evidence.managerAcceptance?.accepted !== true) {
      errors.push("manager acceptance is required");
    } else if (gate === "acceptance-after-last-delivery") {
      const acceptedAt = parseTimestamp(evidence.managerAcceptance?.acceptedAt);
      const lastDeliveryChangeAt = parseTimestamp(evidence.lastDeliveryChangeAt);
      if (acceptedAt === null || lastDeliveryChangeAt === null) {
        errors.push("managerAcceptance.acceptedAt and lastDeliveryChangeAt must be valid timestamps");
      } else if (acceptedAt < lastDeliveryChangeAt) {
        errors.push("manager acceptance predates the latest delivery change");
      }
    } else if (gate === "merge" && pullRequest.merged !== true) {
      errors.push("the pull request must be merged");
    }
  }

  if (target === "done") {
    const deployment = evidence.deployment ?? {};
    if (policy.deployment === "always" && deployment.verified !== true) {
      errors.push("verified deployment evidence is required");
    }
    if (policy.deployment === "when-required" && deployment.required === true && deployment.verified !== true) {
      errors.push("required deployment is not verified");
    }
  }

  const secrets = findSecretPaths(evidence);
  if (secrets.length) errors.push(`secret-like data is forbidden at: ${[...new Set(secrets)].join(", ")}`);
  return [...new Set(errors)];
}

function validateEnumArray(value, location, allowed, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${location} must be a non-empty array`);
    return;
  }
  if (new Set(value).size !== value.length) errors.push(`${location} must contain unique values`);
  for (const entry of value) {
    if (!allowed.has(entry)) errors.push(`${location} contains invalid value ${entry}`);
  }
}

function parseTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
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
    for (const dependency of dependencies.get(key) ?? []) {
      if (keys.has(dependency)) visit(dependency, [...path, key]);
    }
    visiting.delete(key);
    visited.add(key);
  }

  for (const key of keys) visit(key, []);
  return cycles;
}

export function validatePlan(plan, { projectId, forApply = false } = {}) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["plan must be an object"];
  if (plan.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (plan.kind !== "linear-project-plan") errors.push("kind must be linear-project-plan");
  if (typeof plan.projectId !== "string" || !plan.projectId) errors.push("projectId is required");
  if (projectId && plan.projectId !== projectId) errors.push(`projectId ${plan.projectId} does not match bound project ${projectId}`);
  if (typeof plan.teamId !== "string" || !plan.teamId) errors.push("teamId is required");
  if (typeof plan.approved !== "boolean") errors.push("approved must be boolean");
  if (forApply && plan.approved !== true) errors.push("approved must be true for apply");
  if (typeof plan.summary !== "string" || !plan.summary.trim()) errors.push("summary is required");

  const secretPaths = findSecretPaths(plan);
  if (secretPaths.length) errors.push(`secret-like data is forbidden at: ${[...new Set(secretPaths)].join(", ")}`);

  const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];
  const resources = Array.isArray(plan.resources) ? plan.resources : [];
  const issues = Array.isArray(plan.issues) ? plan.issues : [];
  if (!Array.isArray(plan.milestones)) errors.push("milestones must be an array");
  if (!Array.isArray(plan.resources)) errors.push("resources must be an array");
  if (!Array.isArray(plan.issues) || issues.length === 0) errors.push("issues must be a non-empty array");

  const allKeys = new Set();
  const milestoneKeys = new Set();
  const issueKeys = new Set();
  const issueByKey = new Map();

  function register(key, location) {
    validateKey(key, `${location}.key`, errors);
    if (allKeys.has(key)) errors.push(`duplicate stable key: ${key}`);
    allKeys.add(key);
  }

  milestones.forEach((item, index) => {
    const at = `milestones[${index}]`;
    if (!item || typeof item !== "object") {
      errors.push(`${at} must be an object`);
      return;
    }
    register(item.key, at);
    milestoneKeys.add(item.key);
    if (!item.name?.trim()) errors.push(`${at}.name is required`);
    if (!item.description?.trim()) errors.push(`${at}.description is required`);
  });

  resources.forEach((item, index) => {
    const at = `resources[${index}]`;
    if (!item || typeof item !== "object") {
      errors.push(`${at} must be an object`);
      return;
    }
    register(item.key, at);
    if (!item.title?.trim()) errors.push(`${at}.title is required`);
    if (!["document", "url", "repository", "reference"].includes(item.type)) errors.push(`${at}.type is invalid`);
  });

  issues.forEach((item, index) => {
    const at = `issues[${index}]`;
    if (!item || typeof item !== "object") {
      errors.push(`${at} must be an object`);
      return;
    }
    register(item.key, at);
    issueKeys.add(item.key);
    issueByKey.set(item.key, item);
    if (!["parent", "sub-issue", "decision"].includes(item.kind)) errors.push(`${at}.kind is invalid`);
    if (!item.title?.trim()) errors.push(`${at}.title is required`);
    if (!item.description?.trim()) errors.push(`${at}.description is required`);
    if (!["Refinement", "Ready", "Blocked"].includes(item.status)) errors.push(`${at}.status is invalid`);
    if (!["urgent", "high", "normal", "low", "none"].includes(item.priority)) errors.push(`${at}.priority is invalid`);
    if (!Array.isArray(item.labels)) errors.push(`${at}.labels must be an array`);
    if (!Array.isArray(item.acceptanceCriteria) || item.acceptanceCriteria.length === 0) errors.push(`${at}.acceptanceCriteria must be non-empty`);
    for (const field of ["capabilities", "resources", "blockedByKeys"]) {
      if (!Array.isArray(item[field])) errors.push(`${at}.${field} must be an array`);
    }
    if (item.kind === "sub-issue" && !item.parentKey) errors.push(`${at}.parentKey is required for sub-issue`);
    if (item.kind === "parent" && item.parentKey) errors.push(`${at}.parentKey is forbidden for parent`);
    if (item.kind === "decision") {
      if (item.claimable !== false) errors.push(`${at}.claimable must be false for decision`);
      if (item.status !== "Refinement") errors.push(`${at}.status must be Refinement for decision`);
      if (!item.labels?.includes("manager:decision")) errors.push(`${at} must include manager:decision`);
    }
    if (item.kind === "parent" && !item.labels?.includes("agent:parent")) errors.push(`${at} must include agent:parent`);
    if (item.kind === "sub-issue" && !item.labels?.includes("agent:sub-issue")) errors.push(`${at} must include agent:sub-issue`);
    if (item.status === "Ready" && item.blockedByKeys?.length) errors.push(`${at} cannot be Ready while blockedByKeys is non-empty`);
  });

  const dependencies = new Map();
  issues.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const at = `issues[${index}]`;
    if (item.milestoneKey && !milestoneKeys.has(item.milestoneKey)) errors.push(`${at}.milestoneKey references unknown key ${item.milestoneKey}`);
    if (item.parentKey) {
      const parent = issueByKey.get(item.parentKey);
      if (!parent) errors.push(`${at}.parentKey references unknown issue ${item.parentKey}`);
      else if (parent.kind !== "parent") errors.push(`${at}.parentKey must reference a parent issue`);
    }
    const blockers = Array.isArray(item.blockedByKeys) ? item.blockedByKeys : [];
    dependencies.set(item.key, blockers);
    blockers.forEach((key) => {
      if (!issueKeys.has(key)) errors.push(`${at}.blockedByKeys references unknown issue ${key}`);
      if (key === item.key) errors.push(`${at} cannot block itself`);
    });
  });

  for (const cycle of detectCycles(issueKeys, dependencies)) errors.push(`dependency cycle: ${cycle.join(" -> ")}`);
  return [...new Set(errors)];
}

export function validateDecomposition(data, { projectId, forApply = false } = {}) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["decomposition must be an object"];
  if (data.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (data.kind !== "linear-parent-decomposition") errors.push("kind must be linear-parent-decomposition");
  if (!data.projectId) errors.push("projectId is required");
  if (projectId && data.projectId !== projectId) errors.push(`projectId ${data.projectId} does not match bound project ${projectId}`);
  if (forApply && data.approved !== true) errors.push("approved must be true for apply");
  if (!data.parent?.key || !data.parent?.issueId) errors.push("parent.key and parent.issueId are required");

  const children = Array.isArray(data.children) ? data.children : [];
  if (children.length < 2 || children.length > 7) errors.push("children must contain 2–7 direct sub-issues");
  const keys = new Set();
  const dependencies = new Map();
  children.forEach((child, index) => {
    const at = `children[${index}]`;
    if (!child || typeof child !== "object") {
      errors.push(`${at} must be an object`);
      return;
    }
    validateKey(child.key, `${at}.key`, errors);
    if (keys.has(child.key)) errors.push(`duplicate child key: ${child.key}`);
    keys.add(child.key);
    if (!child.title?.trim()) errors.push(`${at}.title is required`);
    if (!child.description?.trim()) errors.push(`${at}.description is required`);
    if (!["Refinement", "Ready", "Blocked"].includes(child.status)) errors.push(`${at}.status is invalid`);
    if (!Array.isArray(child.acceptanceCriteria) || child.acceptanceCriteria.length === 0) errors.push(`${at}.acceptanceCriteria must be non-empty`);
    for (const field of ["capabilities", "resources", "blockedByKeys"]) {
      if (!Array.isArray(child[field])) errors.push(`${at}.${field} must be an array`);
    }
    if (child.status === "Ready" && child.blockedByKeys?.length) errors.push(`${at} cannot be Ready while blocked`);
    dependencies.set(child.key, Array.isArray(child.blockedByKeys) ? child.blockedByKeys : []);
  });
  children.forEach((child, index) => {
    if (!child || typeof child !== "object") return;
    for (const blocker of child.blockedByKeys ?? []) {
      if (!keys.has(blocker)) errors.push(`children[${index}] references unknown blocker ${blocker}`);
      if (blocker === child.key) errors.push(`children[${index}] cannot block itself`);
    }
  });
  for (const cycle of detectCycles(keys, dependencies)) errors.push(`dependency cycle: ${cycle.join(" -> ")}`);
  const secrets = findSecretPaths(data);
  if (secrets.length) errors.push(`secret-like data is forbidden at: ${[...new Set(secrets)].join(", ")}`);
  return [...new Set(errors)];
}
