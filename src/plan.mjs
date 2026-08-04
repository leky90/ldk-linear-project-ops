import { AgentWorkflowError } from "./errors.mjs";

export function validatePlan(value, config, { requireApproved = true } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) {
    throw new AgentWorkflowError("PLAN_INVALID", "Plan must be a schemaVersion 1 object");
  }
  if (typeof value.approved !== "boolean") {
    throw new AgentWorkflowError("PLAN_INVALID", "Plan approved must be a boolean");
  }
  if (requireApproved && value.approved !== true) {
    throw new AgentWorkflowError("PLAN_NOT_APPROVED", "Plan must be explicitly approved before Linear sync");
  }
  if (value.teamId !== config.linear.teamId) {
    throw new AgentWorkflowError("TEAM_ID_MISMATCH", "Plan teamId differs from the pinned Linear team");
  }
  if (value.projectId !== config.linear.projectId) {
    throw new AgentWorkflowError("PROJECT_ID_MISMATCH", "Plan projectId differs from the pinned new Linear project");
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    throw new AgentWorkflowError("PLAN_INVALID", "Plan must contain at least one item");
  }
  const keys = new Set();
  const items = value.items.map((item) => {
    if (
      !item
      || !nonEmpty(item.key)
      || !nonEmpty(item.title)
      || !nonEmpty(item.description)
      || !stringArray(item.capabilities)
      || !stringArray(item.resources)
    ) {
      throw new AgentWorkflowError("PLAN_INVALID", "Every plan item needs key, title, description, capabilities, and resources");
    }
    const key = item.key.trim();
    if (keys.has(key)) throw new AgentWorkflowError("PLAN_INVALID", `Duplicate plan item key: ${key}`);
    keys.add(key);
    return {
      key,
      kind: "parent",
      title: item.title.trim(),
      description: item.description.trim(),
      capabilities: unique(item.capabilities),
      resources: unique(item.resources),
      ...(Number.isInteger(item.priority) ? { priority: item.priority } : {}),
    };
  });
  return { schemaVersion: 1, approved: value.approved, teamId: value.teamId, projectId: value.projectId, items };
}

function unique(values) {
  return [...new Set(values.map((value) => value.trim()))].sort();
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonEmpty);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
