import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { acquireWorkLock, inspectWorkLock, recoverWorkLock, releaseWorkLock, renewWorkLock } from "../scripts/work-lock.mjs";

test("work lock serializes two agents and redacts the token from inspection", async () => {
  const root = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  const lease = await acquireWorkLock({ root, issueId: "EXAMPLE-123", role: "software-engineer", owner: "test-a" });
  await assert.rejects(acquireWorkLock({ root, issueId: "EXAMPLE-123", role: "qa", owner: "test-b" }), /already has an active work lock/u);
  const inspected = await inspectWorkLock({ root, issueId: "EXAMPLE-123" });
  assert.equal(inspected.exists, true);
  assert.equal(inspected.role, "software-engineer");
  assert.equal(Object.hasOwn(inspected, "token"), false);
  const renewed = await renewWorkLock({ root, issueId: "EXAMPLE-123", token: lease.token, leaseMinutes: 10 });
  assert.notEqual(renewed.expiresAt, lease.expiresAt);
  assert.deepEqual(await releaseWorkLock({ root, issueId: "EXAMPLE-123", token: lease.token }), { released: true, issueId: "EXAMPLE-123" });
  assert.deepEqual(await inspectWorkLock({ root, issueId: "EXAMPLE-123" }), { exists: false, issueId: "EXAMPLE-123" });
});

test("expired work lock requires explicit grace-aware recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  await acquireWorkLock({ root, issueId: "EXAMPLE-9", role: "qa", leaseMinutes: 1 });
  await assert.rejects(recoverWorkLock({ root, issueId: "EXAMPLE-9", graceMinutes: 10 }), /not recoverable yet/u);
});
