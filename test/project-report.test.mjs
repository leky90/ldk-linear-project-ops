import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildProjectReport } from "../scripts/build-project-report.mjs";
import {
  deriveLogicalIssueState,
  normalizeProjectSnapshot,
} from "../scripts/project-snapshot.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("logical issue state uses a fresh validated handoff and exposes unknown states", async () => {
  const handoff = await fixture("valid-handoff-v2.json");
  assert.deepEqual(deriveLogicalIssueState({
    key: "EXAMPLE-123",
    status: "In Review",
    updatedAt: "2026-08-18T10:01:00.000Z",
    latestHandoff: handoff,
  }), { state: "ready-to-deliver", source: "handoff", handoffStale: false });

  assert.deepEqual(deriveLogicalIssueState({ status: "Custom Quality Gate" }), {
    state: "unknown",
    source: "unknown",
    handoffStale: false,
  });
});

test("project-defined role slugs remain valid during snapshot normalization", async () => {
  const handoff = await fixture("valid-handoff-v2.json");
  handoff.fromRole = "legal-counsel";
  handoff.toRole = "legal-counsel";
  assert.deepEqual(deriveLogicalIssueState({
    key: "EXAMPLE-123",
    status: "In Review",
    updatedAt: handoff.observedState.issueUpdatedAt,
    latestHandoff: handoff,
  }), { state: "ready-to-deliver", source: "handoff", handoffStale: false });
});

test("snapshot normalization preserves department-neutral planning fields", async () => {
  const snapshot = await fixture("project-snapshot.json");
  snapshot.issues[0].logicalState = "delivery-verification";
  snapshot.issues[0].phaseKey = "phase.launch";
  snapshot.issues[0].parentKey = "outcome.parent";
  snapshot.issues[0].prioritySource = "inherited";
  const normalized = normalizeProjectSnapshot(snapshot);
  assert.equal(normalized.issues[0].logicalState, "delivery-verification");
  assert.equal(normalized.issues[0].ownerRole, "tech-lead");
  assert.equal(normalized.issues[0].phaseKey, "phase.launch");
  assert.equal(normalized.issues[0].parentKey, "outcome.parent");
  assert.equal(normalized.issues[0].prioritySource, "inherited");
});

test("project report exposes logical delivery queues, phases, diagnostics, and at most five actions", async () => {
  const snapshot = await fixture("project-snapshot.json");
  const review = await fixture("valid-handoff-v2.json");
  snapshot.phases = [{ key: "phase.launch", order: 1, objective: "Deliver the launch" }];
  snapshot.issues[0].status = "In Review";
  snapshot.issues[0].updatedAt = review.observedState.issueUpdatedAt;
  snapshot.issues[0].latestHandoff = { ...review, issueId: snapshot.issues[0].key };
  snapshot.issues[0].phaseKey = "phase.launch";
  snapshot.issues[1].prioritySource = "policy-default";
  snapshot.issues[2].updatedAt = review.observedState.issueUpdatedAt;
  snapshot.issues[2].latestHandoff = {
    ...structuredClone(review),
    issueId: snapshot.issues[2].key,
    type: "delivery",
    review: undefined,
    observedState: { ...review.observedState, logicalState: "ready-to-deliver" },
    transition: { from: "ready-to-deliver", to: "delivery-verification" },
    delivery: { ...review.delivery, phase: "delivery-verification" },
  };
  delete snapshot.issues[2].latestHandoff.review;
  snapshot.issues[3].updatedAt = "2026-08-18T10:03:00.000Z";
  snapshot.issues[3].latestHandoff = { ...structuredClone(review), issueId: snapshot.issues[3].key };
  snapshot.issues[4].completedAt = "2026-08-17T12:00:00.000Z";
  snapshot.issues[5].status = "Custom Quality Gate";

  const report = buildProjectReport(snapshot);
  for (const heading of [
    "Logical phases and outcomes",
    "Ready to Deliver",
    "Delivery Verification",
    "Unknown state diagnostics",
    "Stale handoffs",
    "Recent completions",
  ]) assert.match(report, new RegExp(heading, "u"));
  assert.match(report, /policy-default/u);
  assert.match(report, /Custom Quality Gate/u);

  const actions = report.split("## Hành động tiếp theo")[1]
    .split("\n")
    .filter((line) => line.startsWith("- "));
  assert.ok(actions.length <= 5, `expected at most five actions, received ${actions.length}`);
});

test("physical Done without terminal evidence is a mismatch, not verified completion", async () => {
  const snapshot = await fixture("project-snapshot.json");
  snapshot.issues = [{
    key: "demo.task.unverified",
    type: "task",
    title: "Unverified terminal work",
    status: "Done",
    priority: "high",
    ownerRole: "operations-lead",
    estimate: 3,
  }];
  const report = buildProjectReport(snapshot);
  assert.match(report, /0\/1 issue Done \(0%\)/u);
  assert.match(report, /terminal mismatch.*Unverified terminal work/isu);
});

test("report lists active work and ranks committed cycles before uncommitted work", async () => {
  const snapshot = await fixture("project-snapshot.json");
  snapshot.issues = [
    {
      key: "task.active",
      type: "task",
      title: "Active operations work",
      status: "In Progress",
      priority: "high",
      ownerRole: "operations-lead",
    },
    {
      key: "a.uncommitted",
      type: "task",
      title: "Uncommitted ready work",
      status: "Ready",
      priority: "normal",
      ownerRole: "content-writer",
    },
    {
      key: "z.committed",
      type: "task",
      title: "Cycle committed ready work",
      status: "Ready",
      priority: "normal",
      ownerRole: "content-writer",
      cycleName: "Cycle 42",
    },
    {
      key: "urgent.uncommitted",
      type: "task",
      title: "Urgent uncommitted work",
      status: "Ready",
      priority: "urgent",
      ownerRole: "content-writer",
    },
  ];
  const report = buildProjectReport(snapshot);
  assert.match(report, /## Active work[\s\S]*Active operations work/u);
  const actions = report.split("## Hành động tiếp theo")[1];
  assert.ok(actions.indexOf("Urgent uncommitted work") < actions.indexOf("Cycle committed ready work"));
  assert.ok(actions.indexOf("Cycle committed ready work") < actions.indexOf("Uncommitted ready work"));
});

test("open decision totals use logical state", async () => {
  const snapshot = await fixture("project-snapshot.json");
  snapshot.issues = [{
    key: "decision.accepted",
    type: "decision",
    title: "Accepted decision",
    status: "In Review",
    logicalState: "done",
    terminalVerified: true,
    priority: "high",
    ownerRole: "cpo",
  }];
  const report = buildProjectReport(snapshot);
  assert.match(report, /0 quyết định còn mở/u);
  assert.doesNotMatch(report, /Decision: Accepted decision/u);
});

async function fixture(name) {
  return JSON.parse(await readFile(join(root, "tests", "fixtures", name), "utf8"));
}
