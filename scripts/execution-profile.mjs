export function resolveReviewExecution({ sameSession, hostCapabilities = {} } = {}) {
  if (!sameSession) return { action: "inline-fresh-session-review", maySelfReview: false };
  if (hostCapabilities.subagents === true) return { action: "fresh-subagent-review", maySelfReview: false };
  return { action: "stop-at-handoff", maySelfReview: false };
}

export function resolveNextExecutionProfile({ requested, hostCapabilities = {} } = {}) {
  validateProfile(requested);
  if (requested.sessionPolicy === "reuse") return { action: "reuse-session", profile: requested };
  if (hostCapabilities.newSession === true) return { action: "start-new-session", profile: requested };
  // "preferred" is a preference, not a requirement: fall back to the current
  // session instead of stalling when the host cannot start one.
  if (requested.sessionPolicy === "new-preferred") return { action: "reuse-session", profile: requested, fallback: "new-session-unavailable" };
  return { action: "stop-at-handoff", profile: requested, resumePromptRequired: true };
}

function validateProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new TypeError("requested execution profile is required");
  if (!new Set(["reuse", "new-preferred", "new-required"]).has(profile.sessionPolicy)) throw new Error("sessionPolicy is invalid");
  if (!new Set(["fast", "standard", "reasoning"]).has(profile.modelClass)) throw new Error("modelClass is invalid");
  if (!new Set(["low", "medium", "high"]).has(profile.effort)) throw new Error("effort is invalid");
  if (typeof profile.reason !== "string" || !profile.reason.trim()) throw new Error("execution profile reason is required");
}
