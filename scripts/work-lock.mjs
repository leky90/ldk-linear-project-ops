#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCli } from "./lib.mjs";

const DEFAULT_LEASE_MINUTES = 60;
const DEFAULT_GRACE_MINUTES = 10;

function lockPaths(root, issueId) {
  const digest = createHash("sha256").update(issueId.trim().toUpperCase()).digest("hex").slice(0, 20);
  const base = resolve(root, ".linear-ops", "locks");
  const directory = join(base, `${digest}.lock`);
  return { base, directory, lease: join(directory, "lease.json") };
}

async function readLease(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
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
  await mkdir(paths.base, { recursive: true });
  try {
    await mkdir(paths.directory);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const active = await readLease(paths.lease);
    const expiration = Date.parse(active?.expiresAt ?? "");
    const detail = Number.isFinite(expiration) && expiration <= Date.now() ? "expired and requires recovery" : "active";
    throw new Error(`issue ${issueId} already has an ${detail} work lock`);
  }
  const now = new Date().toISOString();
  const lease = {
    schemaVersion: 1,
    kind: "linear-role-work-lock",
    issueId: issueId.trim(),
    role: role.trim(),
    owner,
    token: randomUUID(),
    acquiredAt: now,
    renewedAt: now,
    expiresAt: expiry(leaseMinutes),
  };
  await writeFile(paths.lease, `${JSON.stringify(lease, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return lease;
}

export async function renewWorkLock({ root = ".", issueId, token, leaseMinutes = DEFAULT_LEASE_MINUTES }) {
  assertPositiveInteger(leaseMinutes, "leaseMinutes");
  const paths = lockPaths(root, issueId);
  const lease = await readLease(paths.lease);
  if (!lease) throw new Error(`no work lock exists for ${issueId}`);
  if (lease.token !== token) throw new Error("work lock token does not match");
  const updated = { ...lease, renewedAt: new Date().toISOString(), expiresAt: expiry(leaseMinutes) };
  await writeFile(paths.lease, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
  return updated;
}

export async function releaseWorkLock({ root = ".", issueId, token }) {
  const paths = lockPaths(root, issueId);
  const lease = await readLease(paths.lease);
  if (!lease) return { released: false, reason: "not-found" };
  if (lease.token !== token) throw new Error("work lock token does not match");
  await rm(paths.directory, { recursive: true });
  return { released: true, issueId: lease.issueId };
}

export async function inspectWorkLock({ root = ".", issueId }) {
  const lease = await readLease(lockPaths(root, issueId).lease);
  if (!lease) return { exists: false, issueId };
  return {
    exists: true,
    issueId: lease.issueId,
    role: lease.role,
    owner: lease.owner,
    acquiredAt: lease.acquiredAt,
    renewedAt: lease.renewedAt,
    expiresAt: lease.expiresAt,
    expired: Date.parse(lease.expiresAt) <= Date.now(),
  };
}

export async function recoverWorkLock({ root = ".", issueId, graceMinutes = DEFAULT_GRACE_MINUTES }) {
  assertPositiveInteger(graceMinutes, "graceMinutes");
  const paths = lockPaths(root, issueId);
  const lease = await readLease(paths.lease);
  if (!lease) return { recovered: false, reason: "not-found" };
  const recoveryAt = Date.parse(lease.expiresAt) + graceMinutes * 60_000;
  if (!Number.isFinite(recoveryAt) || Date.now() < recoveryAt) throw new Error(`work lock for ${issueId} is not recoverable yet`);
  const archive = resolve(paths.base, "..", "lock-history");
  await mkdir(archive, { recursive: true });
  const destination = join(archive, `${issueId.replace(/[^A-Za-z0-9_-]/gu, "-")}-${Date.now()}.lock`);
  await rename(paths.directory, destination);
  return { recovered: true, issueId: lease.issueId, archivedAt: destination };
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
