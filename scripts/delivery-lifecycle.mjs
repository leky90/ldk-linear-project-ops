export const DELIVERY_MODES = Object.freeze([
  "decision",
  "artifact-review",
  "publish",
  "external-action",
  "software-merge",
  "production-release",
  "operations-change",
]);

export const ACTION_DELIVERY_MODES = Object.freeze([
  "publish",
  "external-action",
  "software-merge",
  "production-release",
  "operations-change",
]);

export const DELIVERY_PHASES = Object.freeze([
  "review",
  "ready-to-deliver",
  "delivery-verification",
  "complete",
]);

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

const OPEN_LOGICAL_STATES = new Set([
  "refinement",
  "ready",
  "in-progress",
  "in-review",
  "ready-to-deliver",
  "delivery-verification",
  "blocked",
]);

const STARTED_LOGICAL_STATES = new Set([
  "in-progress",
  "in-review",
  "ready-to-deliver",
  "delivery-verification",
  "done",
]);

export function isOpenLogicalState(value) {
  return OPEN_LOGICAL_STATES.has(normalizeLogicalState(value));
}

export function isStartedLogicalState(value) {
  return STARTED_LOGICAL_STATES.has(normalizeLogicalState(value));
}

export function validateDeliveryVerification({ deliveryMode, checks, requirePassed = false } = {}) {
  const errors = [];
  if (!DELIVERY_MODES.includes(deliveryMode)) errors.push("delivery mode is invalid");
  if (!Array.isArray(checks) || checks.length === 0) {
    errors.push("delivery verification checks must be a non-empty array");
    return errors;
  }

  checks.forEach((item, index) => {
    const at = `delivery verification checks[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${at} must be an object`);
      return;
    }
    if (item.mode !== deliveryMode) errors.push(`${at}.mode must match delivery mode ${deliveryMode}`);
    if (typeof item.check !== "string" || !item.check.trim()) errors.push(`${at}.check is required`);
    if (item.passed !== undefined && typeof item.passed !== "boolean") errors.push(`${at}.passed must be boolean`);
    if (requirePassed && item.passed !== true) errors.push(`${at} must pass before completion`);
  });

  return [...new Set(errors)];
}

export function validateHandoffTransition({
  type,
  reviewDecision,
  verificationDecision,
  deliveryMode,
  from,
  to,
  checks,
} = {}) {
  const errors = [];
  const fromState = normalizeLogicalState(from);
  const toState = normalizeLogicalState(to);
  const actionMode = ACTION_DELIVERY_MODES.includes(deliveryMode);

  if (!DELIVERY_MODES.includes(deliveryMode)) errors.push("delivery mode is invalid");
  if (!LOGICAL_STATES.has(fromState)) errors.push(`transition.from ${from ?? ""} is invalid`);
  if (!LOGICAL_STATES.has(toState)) errors.push(`transition.to ${to ?? ""} is invalid`);
  if (errors.length) return [...new Set(errors)];

  if (type === "handoff") {
    if (fromState !== "in-progress" || toState !== "in-review") errors.push("invalid handoff transition; expected in-progress to in-review");
  } else if (type === "review") {
    if (reviewDecision === "changes-requested") {
      if (fromState !== "in-review" || toState !== "ready") errors.push("changes-requested review must transition from in-review to ready");
    } else if (reviewDecision === "passed") {
      if (actionMode) {
        if (fromState === "in-review" && toState === "done") return ["passed action-mode review must transition to ready-to-deliver"];
        if (fromState !== "in-review" || toState !== "ready-to-deliver") errors.push("passed action-mode review must transition from in-review to ready-to-deliver");
      } else {
        if (fromState !== "in-review" || toState !== "done") errors.push("passed decision or artifact review must transition from in-review to done");
        else errors.push(...validateDeliveryVerification({ deliveryMode, checks, requirePassed: true }));
      }
    } else {
      errors.push("review decision is invalid");
    }
  } else if (type === "delivery") {
    if (!actionMode) errors.push("delivery event requires an action delivery mode");
    if (fromState !== "ready-to-deliver" || toState !== "delivery-verification") errors.push("delivery event must transition from ready-to-deliver to delivery-verification");
  } else if (type === "verification") {
    if (!actionMode) errors.push("verification event requires an action delivery mode");
    if (verificationDecision === "passed") {
      if (fromState !== "delivery-verification" || toState !== "done") errors.push("passed verification must transition from delivery-verification to done");
      else errors.push(...validateDeliveryVerification({ deliveryMode, checks, requirePassed: true }));
    } else if (verificationDecision === "failed") {
      if (fromState !== "delivery-verification" || !new Set(["in-review", "ready"]).has(toState)) errors.push("failed verification must transition from delivery-verification to in-review or ready");
    } else {
      errors.push("verification decision is invalid");
    }
  } else if (type === "blocked") {
    if (!OPEN_LOGICAL_STATES.has(fromState) || !new Set(["blocked", "refinement"]).has(toState)) errors.push("blocked event must transition a nonterminal state to blocked or refinement");
  } else if (type === "reconciliation") {
    const repaired = (fromState === "blocked" && new Set(["ready", "refinement"]).has(toState))
      || (fromState === "refinement" && toState === "ready")
      || (fromState === "in-progress" && toState === "ready")
      || (fromState === "ready-to-deliver" && toState === "in-review")
      || (fromState === "delivery-verification" && new Set(["in-review", "ready"]).has(toState))
      || (OPEN_LOGICAL_STATES.has(fromState) && toState === "canceled");
    if (!repaired) errors.push("reconciliation transition is outside the lifecycle repair matrix");
  } else {
    errors.push("handoff event type is invalid");
  }

  return [...new Set(errors)];
}

function normalizeLogicalState(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replaceAll("_", "-").replace(/\s+/gu, "-");
}
