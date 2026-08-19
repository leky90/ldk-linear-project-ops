import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTION_DELIVERY_MODES,
  DELIVERY_MODES,
  DELIVERY_PHASES,
  isOpenLogicalState,
  isStartedLogicalState,
  validateDeliveryVerification,
  validateHandoffTransition,
} from "../scripts/delivery-lifecycle.mjs";

test("delivery constants distinguish review and action modes", () => {
  assert.deepEqual(DELIVERY_MODES, [
    "decision",
    "artifact-review",
    "publish",
    "external-action",
    "software-merge",
    "production-release",
    "operations-change",
  ]);
  assert.deepEqual(ACTION_DELIVERY_MODES, [
    "publish",
    "external-action",
    "software-merge",
    "production-release",
    "operations-change",
  ]);
  assert.deepEqual(DELIVERY_PHASES, ["review", "ready-to-deliver", "delivery-verification", "complete"]);
});

test("logical state helpers include delivery phases", () => {
  for (const state of ["Refinement", "Ready", "In Progress", "In Review", "Ready to Deliver", "Delivery Verification", "Blocked"]) {
    assert.equal(isOpenLogicalState(state), true, `${state} must be open`);
  }
  for (const state of ["In Progress", "In Review", "Ready to Deliver", "Delivery Verification", "Done"]) {
    assert.equal(isStartedLogicalState(state), true, `${state} must be started`);
  }
  assert.equal(isOpenLogicalState("Done"), false);
  assert.equal(isOpenLogicalState("Canceled"), false);
  assert.equal(isStartedLogicalState("Ready"), false);
});

test("handoff transition matrix accepts canonical delivery paths", () => {
  const cases = [
    { type: "handoff", deliveryMode: "artifact-review", from: "in-progress", to: "in-review" },
    { type: "review", reviewDecision: "changes-requested", deliveryMode: "publish", from: "in-review", to: "ready" },
    { type: "review", reviewDecision: "passed", deliveryMode: "decision", from: "in-review", to: "done", checks: passedChecks("decision") },
    { type: "review", reviewDecision: "passed", deliveryMode: "artifact-review", from: "in-review", to: "done", checks: passedChecks("artifact-review") },
    { type: "review", reviewDecision: "passed", deliveryMode: "publish", from: "in-review", to: "ready-to-deliver" },
    { type: "delivery", deliveryMode: "software-merge", from: "ready-to-deliver", to: "delivery-verification" },
    { type: "verification", verificationDecision: "passed", deliveryMode: "operations-change", from: "delivery-verification", to: "done", checks: passedChecks("operations-change") },
    { type: "verification", verificationDecision: "failed", deliveryMode: "external-action", from: "delivery-verification", to: "in-review" },
    { type: "verification", verificationDecision: "failed", deliveryMode: "external-action", from: "delivery-verification", to: "ready" },
    { type: "blocked", deliveryMode: "publish", from: "in-progress", to: "blocked" },
    { type: "blocked", deliveryMode: "publish", from: "ready", to: "refinement" },
    { type: "reconciliation", deliveryMode: "publish", from: "blocked", to: "ready" },
    { type: "reconciliation", deliveryMode: "publish", from: "ready-to-deliver", to: "in-review" },
    { type: "reconciliation", deliveryMode: "publish", from: "refinement", to: "canceled" },
  ];

  for (const entry of cases) assert.deepEqual(validateHandoffTransition(entry), [], JSON.stringify(entry));
});

test("handoff transition matrix rejects invalid shortcuts", () => {
  assert.deepEqual(validateHandoffTransition({
    type: "review",
    reviewDecision: "passed",
    deliveryMode: "software-merge",
    from: "in-review",
    to: "done",
  }), ["passed action-mode review must transition to ready-to-deliver"]);

  assert.match(validateHandoffTransition({
    type: "delivery",
    deliveryMode: "artifact-review",
    from: "ready-to-deliver",
    to: "delivery-verification",
  }).join("\n"), /requires an action delivery mode/u);

  assert.match(validateHandoffTransition({
    type: "handoff",
    deliveryMode: "publish",
    from: "ready",
    to: "in-review",
  }).join("\n"), /invalid handoff transition/u);
});

test("typed terminal verification rejects mismatched and failed checks", () => {
  assert.deepEqual(validateDeliveryVerification({
    deliveryMode: "publish",
    checks: [{ mode: "publish", check: "Campaign is live", passed: true }],
    requirePassed: true,
  }), []);

  assert.match(validateDeliveryVerification({
    deliveryMode: "publish",
    checks: [{ mode: "software-merge", check: "PR merged", passed: true }],
  }).join("\n"), /must match delivery mode publish/u);

  assert.match(validateHandoffTransition({
    type: "verification",
    verificationDecision: "passed",
    deliveryMode: "publish",
    from: "delivery-verification",
    to: "done",
    checks: [{ mode: "publish", check: "Campaign is live", passed: false }],
  }).join("\n"), /must pass before completion/u);
});

function passedChecks(mode) {
  return [{ mode, check: "Terminal result is verified", passed: true }];
}

test("reconciliation repairs refinement promotion and abandoned active work", () => {
  assert.equal(validateHandoffTransition({ type: "reconciliation", deliveryMode: "decision", from: "refinement", to: "ready" }).length, 0);
  assert.equal(validateHandoffTransition({ type: "reconciliation", deliveryMode: "software-merge", from: "in-progress", to: "ready" }).length, 0);
  assert.ok(validateHandoffTransition({ type: "reconciliation", deliveryMode: "decision", from: "ready", to: "done" }).length > 0, "reconciliation still cannot mint Done");
});
