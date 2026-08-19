import { validateHandoff } from "./lib.mjs";

const LOGICAL_STATES = new Set([
  "refinement",
  "ready",
  "in-progress",
  "in-review",
  "ready-to-deliver",
  "delivery-verification",
  "blocked",
  "done",
  "canceled",
]);

export function normalizeProjectSnapshot(snapshot) {
  if (!snapshot?.project) throw new Error("snapshot.project is required");
  const normalized = structuredClone(snapshot);
  normalized.initiatives = Array.isArray(normalized.initiatives) ? normalized.initiatives : [];
  normalized.phases = Array.isArray(normalized.phases) ? normalized.phases : [];
  normalized.milestones = Array.isArray(normalized.milestones) ? normalized.milestones : [];
  const states = normalized.workflow?.states;
  normalized.issues = (Array.isArray(normalized.issues) ? normalized.issues : []).map((issue) => {
    const derived = deriveLogicalIssueState(issue, { states });
    return {
      ...issue,
      observedStatus: issue.status,
      logicalState: derived.state,
      logicalStateSource: derived.source,
      handoffStale: derived.handoffStale,
      terminalVerified: issue.terminalVerified === true || (derived.source === "handoff" && derived.state === "done"),
      prioritySource: issue.prioritySource ?? (issue.priority === "none" ? "legacy-none" : "unknown"),
    };
  });
  return normalized;
}

export function deriveLogicalIssueState(issue = {}, { states } = {}) {
  const explicit = normalizeState(issue.logicalState, states);
  if (explicit) return { state: explicit, source: "explicit", handoffStale: false };

  const handoff = issue.latestHandoff;
  let handoffStale = false;
  if (handoff !== undefined) {
    const issueId = issue.id ?? issue.key;
    // A run's own final comment/status writes advance updatedAt past the
    // pre-mutation observation, so the post-mutation re-read (appliedState)
    // is the timestamp that can actually stay fresh.
    const timestampMatches = typeof issue.updatedAt === "string"
      && (handoff?.observedState?.issueUpdatedAt === issue.updatedAt
        || handoff?.appliedState?.issueUpdatedAt === issue.updatedAt);
    const idMatches = handoff?.issueId === issueId;
    const structurallyValid = validateHandoff(handoff, { roles: null }).length === 0;
    const handoffState = normalizeState(handoff?.transition?.to);
    if (timestampMatches && idMatches && structurallyValid && handoffState) {
      return { state: handoffState, source: "handoff", handoffStale: false };
    }
    handoffStale = true;
  }

  const physical = normalizeState(issue.status, states);
  if (physical) return { state: physical, source: "physical", handoffStale };
  return { state: "unknown", source: "unknown", handoffStale };
}

function normalizeState(value, states) {
  if (typeof value !== "string") return null;
  const mapped = states && typeof states === "object" && !Array.isArray(states)
    ? Object.entries(states).find(([name]) => name.trim().toLowerCase() === value.trim().toLowerCase())?.[1]
    : undefined;
  let token = String(mapped ?? value).trim().toLowerCase().replaceAll("_", "-").replace(/\s+/gu, "-");
  if (token === "completed" || token === "complete") token = "done";
  if (token === "cancelled" || token === "duplicate") token = "canceled";
  if (token === "todo" || token === "unstarted") token = "ready";
  if (token === "backlog" || token === "triage") token = "refinement";
  return LOGICAL_STATES.has(token) ? token : null;
}
