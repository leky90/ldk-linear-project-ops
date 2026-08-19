import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
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

test("lease write failure removes the newly-created lock directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  await assert.rejects(
    acquireWorkLock({ root, issueId: "EXAMPLE-10", role: "qa", owner: 1n }),
    /BigInt/u,
  );
  assert.deepEqual(await inspectWorkLock({ root, issueId: "EXAMPLE-10" }), { exists: false, issueId: "EXAMPLE-10" });
});

test("missing and corrupt leases are classified instead of treated as active", async () => {
  const root = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  const lease = await acquireWorkLock({ root, issueId: "EXAMPLE-11", role: "qa" });
  const leasePath = await findLease(root);
  await rm(leasePath);
  assert.deepEqual(await inspectWorkLock({ root, issueId: "EXAMPLE-11" }), {
    exists: true,
    issueId: "EXAMPLE-11",
    state: "missing-lease",
  });
  await assert.rejects(renewWorkLock({ root, issueId: "EXAMPLE-11", token: lease.token }), /missing lease/u);
  await recoverWorkLock({ root, issueId: "EXAMPLE-11" });

  await acquireWorkLock({ root, issueId: "EXAMPLE-12", role: "qa" });
  const corruptPath = await findLease(root);
  await writeFile(corruptPath, "{invalid json\n");
  assert.deepEqual(await inspectWorkLock({ root, issueId: "EXAMPLE-12" }), {
    exists: true,
    issueId: "EXAMPLE-12",
    state: "corrupt-lease",
  });
});

test("leases store liveness metadata and renew atomically with mode 0600", async () => {
  const root = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  const lease = await acquireWorkLock({ root, issueId: "EXAMPLE-13", role: "qa" });
  assert.equal(lease.hostname, hostname());
  assert.equal(lease.pid, process.pid);
  const renewed = await renewWorkLock({ root, issueId: "EXAMPLE-13", token: lease.token, leaseMinutes: 5 });
  const leasePath = await findLease(root);
  assert.equal((await stat(leasePath)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(leasePath, "utf8")).expiresAt, renewed.expiresAt);
  assert.deepEqual((await readdir(join(root, ".linear-ops", "locks"), { recursive: true })).filter((name) => name.endsWith(".tmp")), []);
});

test("recovery refuses a same-host live process and recovers an expired dead process", async () => {
  const liveRoot = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  await acquireWorkLock({ root: liveRoot, issueId: "EXAMPLE-14", role: "qa" });
  await expireLease(liveRoot, { pid: process.pid, hostname: hostname() });
  await assert.rejects(recoverWorkLock({ root: liveRoot, issueId: "EXAMPLE-14", graceMinutes: 1 }), /process is still alive/u);

  const deadRoot = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  await acquireWorkLock({ root: deadRoot, issueId: "EXAMPLE-15", role: "qa" });
  await expireLease(deadRoot, { pid: 99999999, hostname: hostname() });
  const recovered = await recoverWorkLock({ root: deadRoot, issueId: "EXAMPLE-15", graceMinutes: 1 });
  assert.equal(recovered.recovered, true);
  assert.equal((await inspectWorkLock({ root: deadRoot, issueId: "EXAMPLE-15" })).exists, false);
});

test("concurrent renew and recovery serialize without archiving renewed state", async () => {
  const root = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  const lease = await acquireWorkLock({ root, issueId: "EXAMPLE-16", role: "qa" });
  await expireLease(root, { pid: 99999999, hostname: hostname() });
  const results = await Promise.allSettled([
    renewWorkLock({ root, issueId: "EXAMPLE-16", token: lease.token, leaseMinutes: 10 }),
    recoverWorkLock({ root, issueId: "EXAMPLE-16", graceMinutes: 1 }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("a crashed dead mutation guard is recovered safely", async () => {
  const root = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  const issueId = "EXAMPLE-17";
  const digest = createHash("sha256").update(issueId).digest("hex").slice(0, 20);
  const guard = join(root, ".linear-ops", "locks", `${digest}.lock.guard`);
  await mkdir(guard, { recursive: true });
  await writeFile(join(guard, "owner.json"), JSON.stringify({
    hostname: hostname(),
    pid: 99999999,
    acquiredAt: "2000-01-01T00:00:00.000Z",
    token: "dead-guard",
  }));
  await writeFile(join(guard, "recovery.json"), JSON.stringify({ token: "orphaned-recovery", pid: 99999999 }));
  const lease = await acquireWorkLock({ root, issueId, role: "qa" });
  assert.equal(lease.issueId, issueId);
});

test("concurrent dead-guard recovery admits only one lock mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "linear-role-lock-"));
  const issueId = "EXAMPLE-18";
  const digest = createHash("sha256").update(issueId).digest("hex").slice(0, 20);
  const guard = join(root, ".linear-ops", "locks", `${digest}.lock.guard`);
  await mkdir(guard, { recursive: true });
  await writeFile(join(guard, "owner.json"), JSON.stringify({
    hostname: hostname(),
    pid: 99999999,
    acquiredAt: "2000-01-01T00:00:00.000Z",
    token: "dead-guard",
  }));
  const results = await Promise.allSettled([
    acquireWorkLock({ root, issueId, role: "qa", owner: "one" }),
    acquireWorkLock({ root, issueId, role: "qa", owner: "two" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const inspection = await inspectWorkLock({ root, issueId });
  assert.equal(inspection.exists, true);
});

async function findLease(root) {
  const locks = join(root, ".linear-ops", "locks");
  const directory = (await readdir(locks)).find((name) => name.endsWith(".lock"));
  return join(locks, directory, "lease.json");
}

async function expireLease(root, liveness) {
  const leasePath = await findLease(root);
  const lease = JSON.parse(await readFile(leasePath, "utf8"));
  lease.expiresAt = "2000-01-01T00:00:00.000Z";
  Object.assign(lease, liveness);
  await writeFile(leasePath, `${JSON.stringify(lease, null, 2)}\n`, { mode: 0o600 });
}
