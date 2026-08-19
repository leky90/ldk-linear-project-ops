#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { access, chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseCli } from "./lib.mjs";

const DEFAULT_LEASE_MINUTES = 60;
const DEFAULT_GRACE_MINUTES = 10;
const GUARD_TIMEOUT_MS = 5_000;

function lockPaths(root, issueId) {
  const digest = createHash("sha256").update(issueId.trim().toUpperCase()).digest("hex").slice(0, 20);
  const base = resolve(root, ".linear-ops", "locks");
  const directory = join(base, `${digest}.lock`);
  return {
    base,
    directory,
    guard: `${directory}.guard`,
    lease: join(directory, "lease.json"),
  };
}

function expiry(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > 240) throw new Error(`${name} must be an integer from 1 to 240`);
}

export async function acquireWorkLock({ root = ".", issueId, role, leaseMinutes = DEFAULT_LEASE_MINUTES, owner = "agent" }) {
  if (typeof issueId !== "string" || !issueId.trim()) throw new Error("issueId is required");
  if (typeof role !== "string" || !role.trim()) throw new Error("role is required");
  assertPositiveInteger(leaseMinutes, "leaseMinutes");
  const paths = lockPaths(root, issueId);
  await mkdir(paths.base, { recursive: true, mode: 0o700 });
  return withMutationGuard(paths, async () => {
    try {
      await mkdir(paths.directory, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const record = await readLeaseRecord(paths.lease);
      if (record.state === "valid") {
        const expiration = Date.parse(record.lease.expiresAt);
        const detail = Number.isFinite(expiration) && expiration <= Date.now() ? "expired and requires recovery" : "active";
        throw new Error(`issue ${issueId} already has an ${detail} work lock`);
      }
      throw new Error(`issue ${issueId} has an orphaned work lock with ${record.state.replace("-", " ")} and requires recovery`);
    }

    const now = new Date().toISOString();
    const lease = {
      schemaVersion: 1,
      kind: "linear-role-work-lock",
      issueId: issueId.trim(),
      role: role.trim(),
      owner,
      token: randomUUID(),
      hostname: hostname(),
      pid: process.pid,
      acquiredAt: now,
      renewedAt: now,
      expiresAt: expiry(leaseMinutes),
    };
    try {
      await atomicWriteLease(paths.lease, lease);
      return lease;
    } catch (error) {
      await rm(paths.directory, { recursive: true, force: true });
      throw error;
    }
  });
}

export async function renewWorkLock({ root = ".", issueId, token, leaseMinutes = DEFAULT_LEASE_MINUTES }) {
  assertPositiveInteger(leaseMinutes, "leaseMinutes");
  const paths = lockPaths(root, issueId);
  return withMutationGuard(paths, async () => {
    const record = await requireLeaseRecord(paths, issueId);
    if (record.lease.token !== token) throw new Error("work lock token does not match");
    const updated = { ...record.lease, renewedAt: new Date().toISOString(), expiresAt: expiry(leaseMinutes) };
    await atomicWriteLease(paths.lease, updated);
    return updated;
  });
}

export async function releaseWorkLock({ root = ".", issueId, token }) {
  const paths = lockPaths(root, issueId);
  return withMutationGuard(paths, async () => {
    if (!await exists(paths.directory)) return { released: false, reason: "not-found" };
    const record = await requireLeaseRecord(paths, issueId);
    if (record.lease.token !== token) throw new Error("work lock token does not match");
    await rm(paths.directory, { recursive: true });
    return { released: true, issueId: record.lease.issueId };
  });
}

export async function inspectWorkLock({ root = ".", issueId }) {
  const paths = lockPaths(root, issueId);
  if (!await exists(paths.directory)) return { exists: false, issueId };
  const record = await readLeaseRecord(paths.lease);
  if (record.state !== "valid") return { exists: true, issueId, state: record.state };
  const lease = record.lease;
  return {
    exists: true,
    issueId: lease.issueId,
    role: lease.role,
    owner: lease.owner,
    hostname: lease.hostname,
    pid: lease.pid,
    acquiredAt: lease.acquiredAt,
    renewedAt: lease.renewedAt,
    expiresAt: lease.expiresAt,
    expired: Date.parse(lease.expiresAt) <= Date.now(),
  };
}

export async function recoverWorkLock({ root = ".", issueId, graceMinutes = DEFAULT_GRACE_MINUTES }) {
  assertPositiveInteger(graceMinutes, "graceMinutes");
  const paths = lockPaths(root, issueId);
  if (!await exists(paths.directory)) return { recovered: false, reason: "not-found" };
  const observed = await readLeaseRecord(paths.lease);

  return withMutationGuard(paths, async () => {
    if (!await exists(paths.directory)) return { recovered: false, reason: "not-found" };
    const current = await readLeaseRecord(paths.lease);
    if (observed.state !== current.state) throw new Error(`work lock for ${issueId} changed before recovery`);
    if (observed.state === "valid" && (
      observed.lease.token !== current.lease.token
      || observed.lease.expiresAt !== current.lease.expiresAt
      || observed.lease.renewedAt !== current.lease.renewedAt
    )) throw new Error(`work lock for ${issueId} changed before recovery`);

    if (current.state === "valid") {
      const recoveryAt = Date.parse(current.lease.expiresAt) + graceMinutes * 60_000;
      if (!Number.isFinite(recoveryAt) || Date.now() < recoveryAt) throw new Error(`work lock for ${issueId} is not recoverable yet`);
      if (current.lease.hostname === hostname() && isProcessAlive(current.lease.pid)) {
        throw new Error(`work lock for ${issueId} is expired but its same-host process is still alive`);
      }
    }

    const archive = resolve(paths.base, "..", "lock-history");
    await mkdir(archive, { recursive: true, mode: 0o700 });
    const destination = join(archive, `${issueId.replace(/[^A-Za-z0-9_-]/gu, "-")}-${Date.now()}-${randomUUID()}.lock`);
    await rename(paths.directory, destination);
    return {
      recovered: true,
      issueId: current.state === "valid" ? current.lease.issueId : issueId,
      archivedAt: destination,
      ...(current.state === "valid" ? {} : { recoveredState: current.state }),
    };
  });
}

async function readLeaseRecord(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { state: "missing-lease" };
    throw error;
  }
  try {
    const lease = JSON.parse(raw);
    if (!lease || typeof lease !== "object" || Array.isArray(lease)
      || typeof lease.token !== "string" || !lease.token
      || typeof lease.expiresAt !== "string" || !Number.isFinite(Date.parse(lease.expiresAt))) {
      return { state: "corrupt-lease" };
    }
    return { state: "valid", lease };
  } catch {
    return { state: "corrupt-lease" };
  }
}

async function requireLeaseRecord(paths, issueId) {
  if (!await exists(paths.directory)) throw new Error(`no work lock exists for ${issueId}`);
  const record = await readLeaseRecord(paths.lease);
  if (record.state === "missing-lease") throw new Error(`work lock for ${issueId} has a missing lease`);
  if (record.state === "corrupt-lease") throw new Error(`work lock for ${issueId} has a corrupt lease`);
  return record;
}

async function atomicWriteLease(path, lease) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(lease, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function withMutationGuard(paths, operation) {
  await mkdir(paths.base, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + GUARD_TIMEOUT_MS;
  let guardToken;
  while (true) {
    try {
      guardToken = await claimMutationGuard(paths.guard);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (await recoverDeadMutationGuard(paths.guard)) continue;
      if (Date.now() >= deadline) throw new Error("timed out waiting for work lock mutation guard");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
    }
  }
  try {
    return await operation();
  } finally {
    await removeOwnedMutationGuard(paths.guard, guardToken);
  }
}

async function claimMutationGuard(guardPath) {
  const token = randomUUID();
  const candidate = `${guardPath}.claim.${process.pid}.${token}`;
  await mkdir(candidate, { mode: 0o700 });
  try {
    await writeFile(join(candidate, "owner.json"), `${JSON.stringify({
      hostname: hostname(),
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
      token,
    }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rename(candidate, guardPath);
    return token;
  } catch (error) {
    await rm(candidate, { recursive: true, force: true });
    if (error.code === "ENOTEMPTY") error.code = "EEXIST";
    throw error;
  }
}

async function recoverDeadMutationGuard(guardPath) {
  let owner;
  try {
    owner = JSON.parse(await readFile(join(guardPath, "owner.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return false;
    throw error;
  }
  if (owner?.hostname !== hostname() || isProcessAlive(owner.pid)) return false;
  const historyDirectory = resolve(guardPath, "..", "..", "lock-history");
  await mkdir(historyDirectory, { recursive: true, mode: 0o700 });
  const ownerToken = String(owner.token ?? "unknown").replace(/[^A-Za-z0-9_-]/gu, "-");
  const quarantine = join(historyDirectory, `mutation-guard-${ownerToken}.guard`);
  try {
    await rename(guardPath, quarantine);
    return true;
  } catch (error) {
    if (error.code === "EEXIST" || error.code === "ENOTEMPTY" || error.code === "ENOENT") return false;
    throw error;
  }
}

async function removeOwnedMutationGuard(guardPath, token) {
  try {
    const owner = JSON.parse(await readFile(join(guardPath, "owner.json"), "utf8"));
    if (owner?.token === token) await rm(guardPath, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

async function main() {
  const { positional, flags } = parseCli(process.argv.slice(2));
  const [command, issueId] = positional;
  if (!command || !issueId) throw new Error("Usage: work-lock.mjs acquire|renew|release|inspect|recover <issue-id> [options]");
  const common = { root: typeof flags.get("root") === "string" ? flags.get("root") : ".", issueId };
  let result;
  if (command === "acquire") result = await acquireWorkLock({ ...common, role: flags.get("role"), owner: flags.get("owner") ?? "agent", leaseMinutes: Number(flags.get("minutes") ?? DEFAULT_LEASE_MINUTES) });
  else if (command === "renew") result = await renewWorkLock({ ...common, token: flags.get("token"), leaseMinutes: Number(flags.get("minutes") ?? DEFAULT_LEASE_MINUTES) });
  else if (command === "release") result = await releaseWorkLock({ ...common, token: flags.get("token") });
  else if (command === "inspect") result = await inspectWorkLock(common);
  else if (command === "recover") result = await recoverWorkLock({ ...common, graceMinutes: Number(flags.get("grace-minutes") ?? DEFAULT_GRACE_MINUTES) });
  else throw new Error(`unknown command ${command}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
