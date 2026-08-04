import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AgentWorkflowError,
  ClaimStore,
  createAgentWorkflow,
  parseTaskMetadata,
  validateConfig,
  validateDecomposition,
  validatePlan,
} from "../src/index.mjs";

test("an unapproved plan cannot mutate Linear", async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      fixture.workflow.syncPlan(plan({ approved: false })),
      (error) => error instanceof AgentWorkflowError && error.code === "PLAN_NOT_APPROVED",
    );
    assert.equal(fixture.linear.created.length, 0);
  } finally {
    await fixture.close();
  }
});

test("an unapproved draft can be checked before human approval", () => {
  const checked = validatePlan(plan({ approved: false }), validConfig("claims.sqlite"), {
    requireApproved: false,
  });
  assert.equal(checked.approved, false);
});

test("a plan is pinned to the new immutable Linear project", async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      fixture.workflow.syncPlan(plan({ projectId: "legacy-project" })),
      (error) => error.code === "PROJECT_ID_MISMATCH",
    );
    assert.equal(fixture.linear.created.length, 0);
  } finally {
    await fixture.close();
  }
});

test("approved plan sync is idempotent by item key", async () => {
  const fixture = await createFixture();
  try {
    const first = await fixture.workflow.syncPlan(plan());
    const second = await fixture.workflow.syncPlan(plan());
    assert.equal(first.created, 1);
    assert.equal(second.created, 0);
    assert.equal(second.existing, 1);
    assert.equal(fixture.linear.created.length, 1);
    assert.match(fixture.linear.created[0].description, /```ldk-agent/u);
  } finally {
    await fixture.close();
  }
});

test("two sessions have exactly one winner for the same Ready issue", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ldk-agent-atomic-"));
  const databasePath = join(directory, "claims.sqlite");
  const linear = new FakeLinear([readyIssue({ id: "issue-1", key: "OPS-1" })], { stickyReady: true });
  const config = validConfig(databasePath);
  const firstStore = new ClaimStore({ path: databasePath });
  const secondStore = new ClaimStore({ path: databasePath });
  const first = createAgentWorkflow({ config, linear, claimStore: firstStore, tokenFactory: () => "token-a" });
  const second = createAgentWorkflow({ config, linear, claimStore: secondStore, tokenFactory: () => "token-b" });
  try {
    const [left, right] = await Promise.all([
      first.claimNext({ workerId: "codex-1", capabilities: ["sales.research"] }),
      second.claimNext({ workerId: "claude-1", capabilities: ["sales.research"] }),
    ]);
    assert.equal([left, right].filter(Boolean).length, 1);
    assert.equal(firstStore.listActive().length, 1);
  } finally {
    firstStore.close();
    secondStore.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("exclusive resource keys prevent different issues from overlapping", async () => {
  const fixture = await createFixture({
    issues: [
      readyIssue({ id: "issue-1", key: "OPS-1", resources: ["repo:ldktech-solutions:content"] }),
      readyIssue({ id: "issue-2", key: "OPS-2", resources: ["repo:ldktech-solutions:content"] }),
    ],
    stickyReady: true,
  });
  try {
    const first = await fixture.workflow.claimNext({ workerId: "codex-1", capabilities: ["sales.research"] });
    const second = await fixture.secondWorkflow.claimNext({ workerId: "claude-1", capabilities: ["sales.research"] });
    assert.equal(first.issue.id, "issue-1");
    assert.equal(second, null);
  } finally {
    await fixture.close();
  }
});

test("expired leases are reclaimable and stale tokens are fenced", async () => {
  let now = 1_000;
  const fixture = await createFixture({
    issues: [readyIssue({ id: "issue-1", key: "OPS-1" })],
    clock: () => now,
  });
  try {
    const first = await fixture.workflow.claimNext({
      workerId: "codex-1",
      capabilities: ["sales.research"],
      leaseMs: 1_000,
    });
    now = 2_001;
    const second = await fixture.secondWorkflow.claimNext({
      workerId: "claude-1",
      capabilities: ["sales.research"],
      leaseMs: 1_000,
    });
    assert.notEqual(first.token, second.token);
    assert.deepEqual(
      fixture.linear.stateChanges.map(({ statusId }) => statusId),
      ["status-in-progress", "status-ready", "status-in-progress"],
    );
    assert.match(fixture.linear.comments[0].body, /Lease Expired/u);
    await assert.rejects(
      fixture.workflow.heartbeat({ token: first.token, leaseMs: 1_000 }),
      (error) => error.code === "CLAIM_NOT_ACTIVE",
    );
    await assert.rejects(
      fixture.workflow.finish({ token: first.token, outcome: "review", evidence: [] }),
      (error) => error.code === "CLAIM_NOT_ACTIVE",
    );
  } finally {
    await fixture.close();
  }
});

test("claim and finish mirror progress to Linear", async () => {
  const fixture = await createFixture();
  try {
    const claim = await fixture.workflow.claimNext({ workerId: "codex-1", capabilities: ["sales.research"] });
    assert.equal(fixture.linear.stateChanges[0].statusId, "status-in-progress");
    assert.equal(fixture.linear.comments.length, 1);
    await fixture.workflow.finish({
      token: claim.token,
      outcome: "review",
      evidence: ["https://example.com/evidence"],
    });
    assert.equal(fixture.linear.stateChanges.at(-1).statusId, "status-in-review");
    assert.match(fixture.linear.comments[0].body, /https:\/\/example\.com\/evidence/u);
    assert.equal(fixture.store.listActive().length, 0);
  } finally {
    await fixture.close();
  }
});

test("a failed run comment compensates the Linear state back to Ready", async () => {
  const fixture = await createFixture();
  fixture.linear.failRunComment = true;
  try {
    await assert.rejects(
      fixture.workflow.claimNext({ workerId: "codex-1", capabilities: ["sales.research"] }),
      /comment failed/u,
    );
    assert.deepEqual(
      fixture.linear.stateChanges.map(({ statusId }) => statusId),
      ["status-in-progress", "status-ready"],
    );
    assert.equal(fixture.store.listActive().length, 0);
  } finally {
    await fixture.close();
  }
});

test("review and done require evidence while blocked requires a reason", async () => {
  const fixture = await createFixture({ stickyReady: true });
  try {
    const claim = await fixture.workflow.claimNext({ workerId: "codex-1", capabilities: ["sales.research"] });
    await assert.rejects(
      fixture.workflow.finish({ token: claim.token, outcome: "review", evidence: [] }),
      (error) => error.code === "EVIDENCE_REQUIRED",
    );
    await assert.rejects(
      fixture.workflow.finish({ token: claim.token, outcome: "blocked", evidence: [], summary: "" }),
      (error) => error.code === "BLOCKER_SUMMARY_REQUIRED",
    );
    assert.equal(fixture.store.listActive().length, 1);
  } finally {
    await fixture.close();
  }
});

test("a claimed complex parent is decomposed into 2-7 idempotent sub-issues", async () => {
  const fixture = await createFixture({
    issues: [readyIssue({ id: "parent-1", key: "PARENT-1", kind: "parent" })],
  });
  try {
    const claim = await fixture.workflow.claimNext({ workerId: "codex-planner", capabilities: ["sales.research"] });
    const result = await fixture.workflow.decompose({
      token: claim.token,
      plan: decomposition(),
    });
    assert.equal(result.created, 2);
    assert.equal(result.existing, 0);
    assert.equal(fixture.linear.created.length, 2);
    assert.ok(fixture.linear.created.every(({ parentId }) => parentId === "parent-1"));
    assert.ok(fixture.linear.created.every(({ description }) => parseTaskMetadata(description).kind === "sub-issue"));
    assert.deepEqual(fixture.linear.blockers, [{ issueId: "created-2", blockerIssueId: "created-1" }]);
    assert.equal(fixture.store.listActive().length, 0);
    assert.equal(fixture.linear.issues.find(({ id }) => id === "parent-1").statusId, "status-in-progress");
  } finally {
    await fixture.close();
  }
});

test("decomposition reuses existing child keys and rejects an invalid child count", async () => {
  const fixture = await createFixture({
    issues: [
      readyIssue({ id: "parent-1", key: "PARENT-1", kind: "parent" }),
      readyIssue({
        id: "child-existing",
        key: "parent-1-discovery",
        kind: "sub-issue",
        parentId: "parent-1",
      }),
    ],
  });
  try {
    const claim = await fixture.workflow.claimNext({ workerId: "codex-planner", capabilities: ["sales.research"] });
    await assert.rejects(
      fixture.workflow.decompose({ token: claim.token, plan: decomposition({ children: [decomposition().children[0]] }) }),
      (error) => error.code === "DECOMPOSITION_INVALID",
    );
    assert.equal(fixture.store.listActive().length, 1);
    const result = await fixture.workflow.decompose({ token: claim.token, plan: decomposition() });
    assert.equal(result.created, 1);
    assert.equal(result.existing, 1);
    assert.equal(fixture.linear.created.length, 1);
  } finally {
    await fixture.close();
  }
});

test("parent reconciliation moves completed work to review and stalled work to blocked", async () => {
  const fixture = await createFixture({
    issues: [
      readyIssue({ id: "parent-done", key: "PARENT-DONE", statusId: "status-in-progress" }),
      readyIssue({ id: "done-a", key: "done-a", kind: "sub-issue", parentId: "parent-done", statusId: "status-done" }),
      readyIssue({ id: "done-b", key: "done-b", kind: "sub-issue", parentId: "parent-done", statusId: "status-done" }),
      readyIssue({ id: "parent-blocked", key: "PARENT-BLOCKED", statusId: "status-in-progress" }),
      readyIssue({ id: "blocked-a", key: "blocked-a", kind: "sub-issue", parentId: "parent-blocked", statusId: "status-blocked" }),
      readyIssue({ id: "done-c", key: "done-c", kind: "sub-issue", parentId: "parent-blocked", statusId: "status-done" }),
      readyIssue({ id: "parent-resume", key: "PARENT-RESUME", statusId: "status-blocked" }),
      readyIssue({ id: "ready-a", key: "ready-a", kind: "sub-issue", parentId: "parent-resume", statusId: "status-ready" }),
      readyIssue({ id: "blocked-b", key: "blocked-b", kind: "sub-issue", parentId: "parent-resume", statusId: "status-blocked" }),
    ],
  });
  try {
    const result = await fixture.workflow.reconcileParents();
    assert.deepEqual(result, { schemaVersion: 1, reviewed: 1, blocked: 1, resumed: 1 });
    assert.deepEqual(fixture.linear.stateChanges, [
      { issueId: "parent-done", statusId: "status-in-review" },
      { issueId: "parent-blocked", statusId: "status-blocked" },
      { issueId: "parent-resume", statusId: "status-in-progress" },
    ]);
  } finally {
    await fixture.close();
  }
});

test("metadata and configuration reject unsafe or ambiguous input", () => {
  assert.throws(() => parseTaskMetadata("no metadata"), (error) => error.code === "TASK_METADATA_REQUIRED");
  assert.throws(
    () => validateConfig({ ...validConfig("claims.sqlite"), linearApiKey: "secret" }),
    (error) => error.code === "CONFIG_SECRET_FORBIDDEN",
  );
  const cyclic = decomposition();
  cyclic.children[0].blockedByKeys = [cyclic.children[1].key];
  assert.throws(
    () => validateDecomposition(cyclic),
    (error) => error.code === "DECOMPOSITION_INVALID" && /cycle/u.test(error.message),
  );
});

async function createFixture({
  issues = [readyIssue({ id: "issue-1", key: "OPS-1" })],
  stickyReady = false,
  clock = () => Date.now(),
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "ldk-agent-workflow-"));
  const databasePath = join(directory, "claims.sqlite");
  const linear = new FakeLinear(issues, { stickyReady });
  const config = validConfig(databasePath);
  const store = new ClaimStore({ path: databasePath, clock });
  const secondStore = new ClaimStore({ path: databasePath, clock });
  let sequence = 0;
  const workflow = createAgentWorkflow({
    config,
    linear,
    claimStore: store,
    clock,
    tokenFactory: () => `token-${++sequence}`,
  });
  const secondWorkflow = createAgentWorkflow({
    config,
    linear,
    claimStore: secondStore,
    clock,
    tokenFactory: () => `second-token-${++sequence}`,
  });
  return {
    workflow,
    secondWorkflow,
    linear,
    store,
    async close() {
      store.close();
      secondStore.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

class FakeLinear {
  constructor(issues = [], { stickyReady = false } = {}) {
    this.issues = issues.map((issue) => ({ ...issue }));
    this.stickyReady = stickyReady;
    this.created = [];
    this.stateChanges = [];
    this.comments = [];
    this.blockers = [];
  }

  async listProjectIssues() {
    return this.issues.map((issue) => ({ ...issue }));
  }

  async listReadyIssues() {
    return this.issues
      .filter((issue) => this.stickyReady || issue.statusId === "status-ready")
      .map((issue) => ({ ...issue }));
  }

  async createIssue(input) {
    const created = { id: `created-${this.created.length + 1}`, identifier: `OPS-${this.created.length + 1}`, ...input };
    this.created.push(created);
    this.issues.push({ ...created, statusId: input.statusId, blocked: false });
    return created;
  }

  async ensureBlockedBy({ issueId, blockerIssueId }) {
    const issue = this.issues.find(({ id }) => id === issueId);
    issue.blockedByIds ??= [];
    if (!issue.blockedByIds.includes(blockerIssueId)) {
      issue.blockedByIds.push(blockerIssueId);
      issue.blocked = true;
      this.blockers.push({ issueId, blockerIssueId });
    }
  }

  async updateIssueState({ issueId, statusId }) {
    this.stateChanges.push({ issueId, statusId });
    const issue = this.issues.find(({ id }) => id === issueId);
    if (issue && !this.stickyReady) issue.statusId = statusId;
  }

  async createRunComment({ issueId, body }) {
    if (this.failRunComment) throw new Error("comment failed");
    const comment = { id: `comment-${this.comments.length + 1}`, issueId, body };
    this.comments.push(comment);
    return comment;
  }

  async updateRunComment({ commentId, body }) {
    const comment = this.comments.find(({ id }) => id === commentId);
    comment.body = body;
  }
}

function validConfig(databasePath) {
  return {
    schemaVersion: 1,
    linear: {
      teamId: "new-team",
      projectId: "new-project",
      statuses: {
        ready: "status-ready",
        inProgress: "status-in-progress",
        inReview: "status-in-review",
        blocked: "status-blocked",
        done: "status-done",
      },
    },
    claimDatabase: databasePath,
    defaultLeaseMs: 30_000,
  };
}

function plan(overrides = {}) {
  return {
    schemaVersion: 1,
    approved: true,
    teamId: "new-team",
    projectId: "new-project",
    items: [{
      key: "lead-sop",
      title: "Thiết lập SOP tiếp nhận lead",
      description: "Draft and review the initial lead workflow.",
      capabilities: ["sales.research"],
      resources: ["docs:lead-sop"],
    }],
    ...overrides,
  };
}

function readyIssue({
  id,
  key,
  resources = ["docs:lead-sop"],
  kind = "parent",
  parentId = null,
  statusId = "status-ready",
}) {
  return {
    id,
    identifier: key,
    title: `Task ${key}`,
    description: `Work safely.\n\n\`\`\`ldk-agent\n${JSON.stringify({
      key: key.toLowerCase(),
      kind,
      claimable: true,
      capabilities: ["sales.research"],
      resources,
    })}\n\`\`\``,
    projectId: "new-project",
    teamId: "new-team",
    parentId,
    blockedByIds: [],
    statusId,
    priority: 2,
    blocked: false,
    url: `https://linear.app/new/issue/${key}`,
  };
}

function decomposition(overrides = {}) {
  return {
    schemaVersion: 1,
    children: [
      {
        key: "parent-1-discovery",
        title: "Discover inputs",
        description: "Collect and verify the inputs.",
        capabilities: ["sales.research"],
        resources: ["docs:lead-sop:discovery"],
        blockedByKeys: [],
      },
      {
        key: "parent-1-draft",
        title: "Draft output",
        description: "Produce the reviewed draft.",
        capabilities: ["sales.research"],
        resources: ["docs:lead-sop:draft"],
        blockedByKeys: ["parent-1-discovery"],
      },
    ],
    ...overrides,
  };
}
