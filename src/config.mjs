import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { AgentWorkflowError } from "./errors.mjs";

const STATUS_NAMES = ["ready", "inProgress", "inReview", "blocked", "done"];
const SECRET_KEY = /(?:secret|password|token|api.?key|private.?key)/iu;

export async function loadConfig(path) {
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new AgentWorkflowError("CONFIG_UNREADABLE", "Configuration could not be read", {
      cause: error.message,
    });
  }
  const config = validateConfig(value);
  return {
    ...config,
    claimDatabase: isAbsolute(config.claimDatabase)
      ? config.claimDatabase
      : resolve(dirname(resolve(path)), config.claimDatabase),
  };
}

export function validateConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentWorkflowError("CONFIG_INVALID", "Configuration must be an object");
  }
  if (containsSecretKey(value)) {
    throw new AgentWorkflowError("CONFIG_SECRET_FORBIDDEN", "Configuration cannot contain credentials or secret fields");
  }
  if (value.schemaVersion !== 1) {
    throw new AgentWorkflowError("CONFIG_INVALID", "schemaVersion must equal 1");
  }
  const linear = value.linear;
  if (!linear || !nonEmpty(linear.teamId) || !nonEmpty(linear.projectId)) {
    throw new AgentWorkflowError("CONFIG_INVALID", "Linear teamId and projectId are required");
  }
  const statuses = linear.statuses;
  if (!statuses || STATUS_NAMES.some((name) => !nonEmpty(statuses[name]))) {
    throw new AgentWorkflowError("CONFIG_INVALID", "Every required Linear status ID must be configured");
  }
  const statusIds = STATUS_NAMES.map((name) => statuses[name]);
  if (new Set(statusIds).size !== statusIds.length) {
    throw new AgentWorkflowError("CONFIG_INVALID", "Linear status IDs must be unique");
  }
  if (!nonEmpty(value.claimDatabase)) {
    throw new AgentWorkflowError("CONFIG_INVALID", "claimDatabase is required");
  }
  if (!Number.isInteger(value.defaultLeaseMs) || value.defaultLeaseMs < 100 || value.defaultLeaseMs > 86_400_000) {
    throw new AgentWorkflowError("CONFIG_INVALID", "defaultLeaseMs must be between 100 ms and 24 hours");
  }
  return structuredClone(value);
}

function containsSecretKey(value) {
  if (Array.isArray(value)) return value.some(containsSecretKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || containsSecretKey(child));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
