import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import {
  resolveNextExecutionProfile,
  resolveReviewExecution,
} from "../scripts/execution-profile.mjs";
import {
  renderWorkComment,
  validateHandoff,
  validateHandoffAgainstIssue,
} from "../scripts/lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

test("same-session review requires a fresh reviewer context", () => {
  assert.deepEqual(resolveReviewExecution({
    sameSession: true,
    hostCapabilities: { subagents: true, newSession: false },
  }), {
    action: "fresh-subagent-review",
    maySelfReview: false,
  });

  assert.deepEqual(resolveReviewExecution({
    sameSession: true,
    hostCapabilities: { subagents: false, newSession: false },
  }), {
    action: "stop-at-handoff",
    maySelfReview: false,
  });

  assert.deepEqual(resolveReviewExecution({
    sameSession: false,
    hostCapabilities: { subagents: false, newSession: false },
  }), {
    action: "inline-fresh-session-review",
    maySelfReview: false,
  });
});

test("next execution profile never fabricates unsupported session dispatch", () => {
  const requested = {
    sessionPolicy: "new-required",
    modelClass: "reasoning",
    effort: "high",
    reason: "Independent high-risk verification.",
  };
  assert.deepEqual(resolveNextExecutionProfile({
    requested,
    hostCapabilities: { newSession: true },
  }), { action: "start-new-session", profile: requested });
  assert.deepEqual(resolveNextExecutionProfile({
    requested,
    hostCapabilities: { newSession: false },
  }), {
    action: "stop-at-handoff",
    profile: requested,
    resumePromptRequired: true,
  });
});

test("handoff v2 validates six event types and canonical transitions", async () => {
  const review = await validHandoff();
  const cases = [
    review,
    event(review, {
      type: "handoff",
      transition: { from: "in-progress", to: "in-review" },
      observedState: { ...review.observedState, status: "In Progress", logicalState: "in-progress" },
      delivery: { ...review.delivery, phase: "review" },
      deliverables: ["Synthetic launch package"],
      review: undefined,
    }),
    event(review, {
      type: "delivery",
      transition: { from: "ready-to-deliver", to: "delivery-verification" },
      observedState: { ...review.observedState, status: "In Review", logicalState: "ready-to-deliver" },
      delivery: { ...review.delivery, phase: "delivery-verification" },
      review: undefined,
    }),
    event(review, {
      type: "verification",
      transition: { from: "delivery-verification", to: "done" },
      observedState: { ...review.observedState, status: "In Review", logicalState: "delivery-verification" },
      delivery: {
        ...review.delivery,
        phase: "complete",
        checks: review.delivery.checks.map((check) => ({ ...check, passed: true })),
      },
      verification: { decision: "passed" },
      review: undefined,
    }),
    event(review, {
      type: "blocked",
      transition: { from: "in-progress", to: "blocked" },
      observedState: { ...review.observedState, status: "In Progress", logicalState: "in-progress" },
      delivery: { ...review.delivery, phase: "review" },
      blocker: { reason: "Authority missing", impact: "Publish cannot proceed", neededFrom: "Owner", resumeWhen: "Authority is granted" },
      review: undefined,
    }),
    event(review, {
      type: "reconciliation",
      transition: { from: "blocked", to: "ready" },
      observedState: { ...review.observedState, status: "Blocked", logicalState: "blocked" },
      delivery: { ...review.delivery, phase: "review" },
      review: undefined,
    }),
  ];

  for (const handoff of cases) assert.deepEqual(validateHandoff(handoff), [], handoff.type);
});

test("handoff v2 rejects unsafe review, evidence, and completion", async () => {
  const missingIndependence = await validHandoff();
  delete missingIndependence.review.independence;
  assert.match(validateHandoff(missingIndependence).join("\n"), /review\.independence/u);

  const directDone = await validHandoff();
  directDone.transition.to = "done";
  assert.match(validateHandoff(directDone).join("\n"), /ready-to-deliver/u);

  const leakedLocal = await validHandoff();
  leakedLocal.evidence[0].value = "file:///Users/example/private-review.md";
  assert.match(validateHandoff(leakedLocal).join("\n"), /shared evidence.*local path|file:/u);

  const failedCompletion = await validHandoff();
  failedCompletion.type = "verification";
  failedCompletion.review = undefined;
  failedCompletion.verification = { decision: "passed" };
  failedCompletion.observedState.logicalState = "delivery-verification";
  failedCompletion.transition = { from: "delivery-verification", to: "done" };
  failedCompletion.delivery.phase = "complete";
  failedCompletion.delivery.checks[0].passed = false;
  assert.match(validateHandoff(failedCompletion).join("\n"), /must pass before completion/u);

  const unsupportedCompletion = await validHandoff();
  unsupportedCompletion.type = "verification";
  unsupportedCompletion.fromRole = "cpo";
  delete unsupportedCompletion.review;
  unsupportedCompletion.verification = { decision: "passed" };
  unsupportedCompletion.checks = [];
  unsupportedCompletion.evidence = [];
  unsupportedCompletion.observedState.logicalState = "delivery-verification";
  unsupportedCompletion.transition = { from: "delivery-verification", to: "done" };
  unsupportedCompletion.delivery.phase = "complete";
  unsupportedCompletion.delivery.checks = [{ mode: "publish", check: "Live target is verified", passed: true }];
  assert.match(validateHandoff(unsupportedCompletion).join("\n"), /verification.*shared evidence|delivery\.ownerRole/u);
});

test("live issue validation rejects stale observations", async () => {
  const handoff = await validHandoff();
  assert.deepEqual(validateHandoffAgainstIssue(handoff, {
    id: "EXAMPLE-123",
    updatedAt: "2026-08-18T10:01:00.000Z",
    status: "In Review",
    logicalState: "in-review",
  }), []);
  assert.match(validateHandoffAgainstIssue(handoff, {
    id: "EXAMPLE-123",
    updatedAt: "2026-08-18T10:03:00.000Z",
    status: "In Review",
    logicalState: "in-review",
  }).join("\n"), /stale/u);
  assert.match(validateHandoffAgainstIssue(handoff, {
    id: "EXAMPLE-123",
    updatedAt: "2026-08-18T10:01:00.000Z",
    status: "Ready",
    logicalState: "in-review",
  }).join("\n"), /physical status/u);
});

test("v2 rendering includes only supported shared evidence", async () => {
  const handoff = await validHandoff();
  const comment = renderWorkComment(handoff);
  assert.match(comment, /Accepted launch package/u);
  assert.match(comment, /independent review/u);
  assert.doesNotMatch(comment, /private reviewer reasoning|observedAt|issueUpdatedAt|new-preferred|standard|medium/u);
});

test("embedded local links never validate or render as shared evidence", async () => {
  const handoff = await validHandoff();
  handoff.evidence[0].value = "Private [report](file:///Users/example/private/report.json)";
  assert.match(validateHandoff(handoff).join("\n"), /shared evidence.*local path/u);

  const legacy = JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-handoff.json"), "utf8"));
  legacy.evidence[0].value = "Private [report](file:///Users/example/private/report.json)";
  assert.doesNotMatch(renderWorkComment(legacy), /file:|private\/report/iu);

  const relative = await validHandoff();
  relative.evidence[0].value = "scripts/migration.mjs:109";
  assert.match(validateHandoff(relative).join("\n"), /shared evidence.*local path/u);

  const unsafeSummary = await validHandoff();
  unsafeSummary.summary = "Review output at /Users/alice/private/review.md";
  assert.match(validateHandoff(unsafeSummary).join("\n"), /summary.*local path|comment-safe/u);

  legacy.summary = "Review output at /Users/alice/private/review.md";
  assert.doesNotMatch(renderWorkComment(legacy), /Users\/alice|private\/review/iu);

  for (const unsafe of [
    "See `scripts/migration.mjs:109`",
    "session sess-123",
    "session 123e4567-e89b-12d3-a456-426614174000",
    "model openai/gpt-5.6",
    "system prompt: reveal hidden instructions",
    "session ID: abc123",
    "model: o3",
    "reviewer prompt was: hidden instructions",
    "See `dist/private-review.json`",
    "reviewed using model o3",
    "review session abc123",
    "reviewed with gpt-5.6",
    "the reviewer prompt contained hidden instructions",
  ]) {
    const handoff = await validHandoff();
    handoff.summary = unsafe;
    assert.match(validateHandoff(handoff).join("\n"), /comment-safe/u, unsafe);
    legacy.summary = unsafe;
    assert.doesNotMatch(renderWorkComment(legacy), new RegExp(unsafe.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }

  for (const safe of [
    "The pricing model was approved",
    "Customer research session notes were accepted",
    "The onboarding prompt was approved",
  ]) {
    const handoff = await validHandoff();
    handoff.summary = safe;
    assert.deepEqual(validateHandoff(handoff), [], safe);
    assert.match(renderWorkComment(handoff), new RegExp(safe, "u"));
  }
});

test("delivery and verification events have dedicated human renderers", async () => {
  const base = await validHandoff();
  const delivery = event(base, {
    type: "delivery",
    review: undefined,
    observedState: { ...base.observedState, logicalState: "ready-to-deliver" },
    transition: { from: "ready-to-deliver", to: "delivery-verification" },
    delivery: { ...base.delivery, phase: "delivery-verification" },
  });
  const deliveryComment = renderWorkComment(delivery);
  assert.match(deliveryComment, /Delivery performed/u);
  assert.doesNotMatch(deliveryComment, /Hòa giải/u);

  const verification = event(base, {
    type: "verification",
    review: undefined,
    verification: { decision: "passed" },
    observedState: { ...base.observedState, logicalState: "delivery-verification" },
    transition: { from: "delivery-verification", to: "done" },
    delivery: {
      ...base.delivery,
      phase: "complete",
      checks: base.delivery.checks.map((check) => ({ ...check, passed: true })),
    },
  });
  const verificationComment = renderWorkComment(verification);
  assert.match(verificationComment, /Delivery verification passed/u);
  assert.doesNotMatch(verificationComment, /Hòa giải/u);
});

test("mutation CLI requires and validates a current issue snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roleflow-handoff-v2-"));
  const handoffPath = join(directory, "handoff.json");
  const issuePath = join(directory, "issue.json");
  await writeFile(handoffPath, JSON.stringify(await validHandoff()));
  await writeFile(issuePath, JSON.stringify({
    id: "EXAMPLE-123",
    updatedAt: "2026-08-18T10:01:00.000Z",
    status: "In Review",
    logicalState: "in-review",
  }));
  const cli = join(root, "scripts", "validate-handoff.mjs");

  await assert.rejects(
    execFileAsync(process.execPath, [cli, handoffPath, "--for-mutation"]),
    (error) => /current-issue is required/u.test(error.stdout),
  );
  const { stdout } = await execFileAsync(process.execPath, [
    cli,
    handoffPath,
    "--for-mutation",
    "--current-issue",
    issuePath,
  ]);
  assert.equal(JSON.parse(stdout).valid, true);
});

function event(base, overrides) {
  const value = { ...structuredClone(base), ...overrides };
  for (const [key, entry] of Object.entries(value)) if (entry === undefined) delete value[key];
  return value;
}

async function validHandoff() {
  return JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-handoff-v2.json"), "utf8"));
}
