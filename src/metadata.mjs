import { AgentWorkflowError } from "./errors.mjs";

const BLOCK = /```ldk-agent\s*\n([\s\S]*?)\n```/u;

export function parseTaskMetadata(description) {
  const match = String(description ?? "").match(BLOCK);
  if (!match) {
    throw new AgentWorkflowError("TASK_METADATA_REQUIRED", "Issue needs an ldk-agent metadata block");
  }
  let value;
  try {
    value = JSON.parse(match[1]);
  } catch {
    throw new AgentWorkflowError("TASK_METADATA_INVALID", "ldk-agent metadata must be valid JSON");
  }
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || !nonEmpty(value.key)
    || value.claimable !== true
    || !stringArray(value.capabilities)
    || !stringArray(value.resources)
    || ![undefined, "parent", "sub-issue"].includes(value.kind)
  ) {
    throw new AgentWorkflowError("TASK_METADATA_INVALID", "ldk-agent metadata fields are incomplete");
  }
  return {
    key: value.key.trim(),
    kind: value.kind ?? "parent",
    claimable: true,
    capabilities: unique(value.capabilities),
    resources: unique(value.resources),
  };
}

export function formatTaskDescription(item) {
  const metadata = {
    key: item.key,
    kind: item.kind ?? "parent",
    claimable: true,
    capabilities: unique(item.capabilities),
    resources: unique(item.resources),
  };
  return `${item.description.trim()}\n\n\`\`\`ldk-agent\n${JSON.stringify(metadata)}\n\`\`\``;
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
