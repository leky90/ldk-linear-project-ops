#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ClaimLockError, ClaimLockStore } from "./store.mjs";

const DEFAULT_LEASE_MS = 1_800_000;

export async function runClaimLockCli(argv, {
  tokenFactory = randomUUID,
  clock = () => Date.now(),
} = {}) {
  const { command, options } = parseArguments(argv);
  if (!command) throw new ClaimLockError("COMMAND_REQUIRED", usage());
  const database = required(options, "database");
  const store = new ClaimLockStore({ path: database, clock });
  try {
    if (command === "claim") {
      const claim = store.tryClaim({
        issueId: required(options, "issue-id"),
        workerId: required(options, "worker"),
        token: tokenFactory(),
        leaseMs: integer(options["lease-ms"] ?? DEFAULT_LEASE_MS, "lease-ms"),
        resources: csv(options.resources),
      });
      return claim
        ? { schemaVersion: 1, ok: true, claim }
        : { schemaVersion: 1, ok: false, conflict: true };
    }
    if (command === "heartbeat") {
      return {
        schemaVersion: 1,
        ok: true,
        claim: publicClaim(store.heartbeat({
          token: required(options, "token"),
          leaseMs: integer(options["lease-ms"] ?? DEFAULT_LEASE_MS, "lease-ms"),
        })),
      };
    }
    if (command === "verify") {
      return {
        schemaVersion: 1,
        ok: true,
        claim: publicClaim(store.getActive(required(options, "token"))),
      };
    }
    if (command === "release") {
      return {
        schemaVersion: 1,
        ok: true,
        released: publicClaim(store.release(required(options, "token"))),
      };
    }
    if (command === "active") {
      return { schemaVersion: 1, ok: true, claims: store.listActive().map(publicClaim) };
    }
    if (command === "expired") {
      return { schemaVersion: 1, ok: true, claims: store.listExpired().map(publicClaim) };
    }
    if (command === "acknowledge") {
      const issueId = required(options, "issue-id");
      return {
        schemaVersion: 1,
        ok: true,
        issueId,
        acknowledged: store.acknowledgeExpired(issueId),
      };
    }
    throw new ClaimLockError("COMMAND_UNKNOWN", `Unknown command: ${command}\n${usage()}`);
  } finally {
    store.close();
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) {
      throw new ClaimLockError("ARGUMENT_INVALID", `Unexpected argument: ${item}`);
    }
    const name = item.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ClaimLockError("ARGUMENT_INVALID", `--${name} requires a value`);
    }
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, name) {
  const value = options[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new ClaimLockError("ARGUMENT_REQUIRED", `--${name} is required`);
  }
  return name === "database" ? resolve(value) : value.trim();
}

function integer(value, name) {
  const selected = Number(value);
  if (!Number.isInteger(selected)) {
    throw new ClaimLockError("ARGUMENT_INVALID", `--${name} must be an integer`);
  }
  return selected;
}

function csv(value) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function publicClaim({ token: _token, ...claim }) {
  return claim;
}

function usage() {
  return [
    "Usage:",
    "  linear-claim-lock claim --database PATH --issue-id ID --worker ID [--resources a,b] [--lease-ms MS]",
    "  linear-claim-lock heartbeat --database PATH --token TOKEN [--lease-ms MS]",
    "  linear-claim-lock verify --database PATH --token TOKEN",
    "  linear-claim-lock release --database PATH --token TOKEN",
    "  linear-claim-lock active --database PATH",
    "  linear-claim-lock expired --database PATH",
    "  linear-claim-lock acknowledge --database PATH --issue-id ID",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runClaimLockCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.conflict) process.exitCode = 3;
    })
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({
        schemaVersion: 1,
        ok: false,
        error: {
          code: error.code ?? "CLAIM_LOCK_ERROR",
          message: error.message,
        },
      })}\n`);
      process.exitCode = 1;
    });
}
