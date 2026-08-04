import { AgentWorkflowError } from "./errors.mjs";

export function validateDecomposition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) {
    throw new AgentWorkflowError("DECOMPOSITION_INVALID", "Decomposition must be a schemaVersion 1 object");
  }
  if (!Array.isArray(value.children) || value.children.length < 2 || value.children.length > 7) {
    throw new AgentWorkflowError("DECOMPOSITION_INVALID", "A complex parent must contain between 2 and 7 sub-issues");
  }
  const keys = new Set();
  const children = value.children.map((child) => {
    if (
      !child
      || !nonEmpty(child.key)
      || !nonEmpty(child.title)
      || !nonEmpty(child.description)
      || !stringArray(child.capabilities)
      || !stringArray(child.resources)
      || !stringArray(child.blockedByKeys)
    ) {
      throw new AgentWorkflowError(
        "DECOMPOSITION_INVALID",
        "Every sub-issue needs key, title, description, capabilities, resources, and blockedByKeys",
      );
    }
    const key = child.key.trim();
    if (keys.has(key)) throw new AgentWorkflowError("DECOMPOSITION_INVALID", `Duplicate sub-issue key: ${key}`);
    keys.add(key);
    return {
      key,
      kind: "sub-issue",
      title: child.title.trim(),
      description: child.description.trim(),
      capabilities: unique(child.capabilities),
      resources: unique(child.resources),
      blockedByKeys: unique(child.blockedByKeys),
      ...(Number.isInteger(child.priority) ? { priority: child.priority } : {}),
    };
  });
  for (const child of children) {
    for (const blocker of child.blockedByKeys) {
      if (!keys.has(blocker) || blocker === child.key) {
        throw new AgentWorkflowError("DECOMPOSITION_INVALID", `Invalid blocker ${blocker} for ${child.key}`);
      }
    }
  }
  assertAcyclic(children);
  return { schemaVersion: 1, children };
}

function assertAcyclic(children) {
  const dependencies = new Map(children.map(({ key, blockedByKeys }) => [key, blockedByKeys]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (key) => {
    if (visiting.has(key)) throw new AgentWorkflowError("DECOMPOSITION_INVALID", "Sub-issue dependencies cannot form a cycle");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of dependencies.get(key) ?? []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of dependencies.keys()) visit(key);
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
