const PRIORITY_TO_LINEAR = Object.freeze({ none: 0, urgent: 1, high: 2, normal: 3, low: 4 });
const PRIORITY_FROM_LINEAR = Object.freeze(
  Object.fromEntries(Object.entries(PRIORITY_TO_LINEAR).map(([name, value]) => [value, name])),
);
const HEALTH_TO_LINEAR = Object.freeze({ "on-track": "onTrack", "at-risk": "atRisk", "off-track": "offTrack" });
const MUTATION_VERBS = new Set([
  "save", "create", "delete", "resolve", "merge", "prepare", "update", "archive",
  "assign", "add", "remove", "reopen", "submit", "upload",
]);
const READ_VERBS = new Set(["get", "list", "search", "extract"]);

// Operation names exposed by real Linear connectors. Hosts register the server
// under arbitrary names (linear, linear-server, opaque connector UUIDs), so the
// operation segment is the only stable signal for those hosts.
const KNOWN_LINEAR_OPERATIONS = new Set([
  "save_issue", "get_issue", "list_issues", "get_issue_status", "list_issue_statuses",
  "create_issue_label", "list_issue_labels", "reopen_issue",
  "save_project", "get_project", "list_projects", "list_project_labels",
  "save_comment", "list_comments", "delete_comment",
  "save_milestone", "get_milestone", "list_milestones",
  "save_status_update", "get_status_updates", "delete_status_update",
  "save_document", "get_document", "list_documents", "search_documentation",
  "create_attachment", "create_attachment_from_upload", "delete_attachment",
  "get_attachment", "prepare_attachment_upload", "extract_images",
  "get_team", "list_teams", "get_user", "list_users", "get_workspace", "list_cycles",
  "get_diff", "list_diffs", "get_diff_threads", "merge_diff", "resolve_diff_thread",
  "save_diff_comment", "delete_diff_comment", "submit_diff_review",
  "save_release", "get_release", "list_releases", "list_release_pipelines",
  "save_release_note", "get_release_note", "list_release_notes",
  "get_agent_skill", "list_agent_skills",
]);

export function mapPriorityToLinear(priority) {
  if (!Object.hasOwn(PRIORITY_TO_LINEAR, priority)) throw new Error("priority must be none, urgent, high, normal, or low");
  return PRIORITY_TO_LINEAR[priority];
}

export function mapPriorityFromLinear(priority) {
  if (!Object.hasOwn(PRIORITY_FROM_LINEAR, priority)) throw new Error("priority must be a Linear value between 0 and 4");
  return PRIORITY_FROM_LINEAR[priority];
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
  if (relations.parentKey !== undefined) mapped.parentId = resolveIssueId(relations.parentKey);
  return mapped;
}

export function classifyLinearOperation(toolName) {
  if (typeof toolName !== "string" || !toolName) return "not-linear";
  const normalized = toolName.trim().toLowerCase();
  const segments = normalized.split(/__|[.:/]/u).filter(Boolean);
  const operationName = [...segments].reverse().find((segment) => segment.startsWith("linear_"));
  const serverIsLinear = segments.some((segment) => segment === "linear" || /^linear[-_]/u.test(segment)) || operationName !== undefined;
  const operation = (operationName ?? segments.at(-1)).replace(/^linear_/u, "");
  if (!serverIsLinear && !KNOWN_LINEAR_OPERATIONS.has(operation)) return "not-linear";
  const verb = operation.split("_", 1)[0];
  if (MUTATION_VERBS.has(verb)) return "mutation";
  if (READ_VERBS.has(verb)) return "read";
  return "unknown";
}
