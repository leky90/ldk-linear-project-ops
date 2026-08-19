const PRIORITY_TO_LINEAR = Object.freeze({ urgent: 1, high: 2, normal: 3, low: 4 });
const HEALTH_TO_LINEAR = Object.freeze({ "on-track": "onTrack", "at-risk": "atRisk", "off-track": "offTrack" });
const MUTATION_VERBS = new Set(["save", "create", "delete", "resolve", "merge", "prepare", "update", "archive", "assign", "add", "remove"]);
const READ_VERBS = new Set(["get", "list", "search", "extract"]);

export function mapPriorityToLinear(priority) {
  if (!Object.hasOwn(PRIORITY_TO_LINEAR, priority)) throw new Error("priority must be urgent, high, normal, or low");
  return PRIORITY_TO_LINEAR[priority];
}

export function mapHealthToLinear(health) {
  if (!Object.hasOwn(HEALTH_TO_LINEAR, health)) throw new Error("health must be on-track, at-risk, or off-track");
  return HEALTH_TO_LINEAR[health];
}

export function mapRelationsToLinear(relations = {}, resolveIssueId = (value) => value) {
  const mapped = {
    blockedBy: (relations.blockedByKeys ?? []).map(resolveIssueId),
    relatedTo: (relations.relatedToKeys ?? []).map(resolveIssueId),
  };
  if (relations.duplicateOfKey !== undefined) mapped.duplicateOf = resolveIssueId(relations.duplicateOfKey);
  return mapped;
}

export function classifyLinearOperation(toolName) {
  if (typeof toolName !== "string" || !toolName) return "not-linear";
  const normalized = toolName.trim().toLowerCase();
  const segments = normalized.split(/__|[.:/]/u).filter(Boolean);
  const operationName = [...segments].reverse().find((segment) => segment.startsWith("linear_"));
  if (!operationName && !segments.includes("linear")) return "not-linear";
  const operation = (operationName ?? segments.at(-1)).replace(/^linear_/u, "");
  const verb = operation.split("_", 1)[0];
  if (MUTATION_VERBS.has(verb)) return "mutation";
  if (READ_VERBS.has(verb)) return "read";
  return "unknown";
}
