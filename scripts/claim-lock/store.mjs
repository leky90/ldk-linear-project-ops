import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class ClaimLockError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ClaimLockError";
    this.code = code;
  }
}

/** Atomic issue and exact-resource leases for agents sharing one filesystem. */
export class ClaimLockStore {
  constructor({ path, clock = () => Date.now() } = {}) {
    assertText(path, "database path");
    mkdirSync(dirname(path), { recursive: true });
    this.clock = clock;
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS claims (
        issue_id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        resources_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_claims (
        resource_key TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY(issue_id) REFERENCES claims(issue_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS recovery_queue (
        issue_id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        token TEXT NOT NULL,
        expired_at INTEGER NOT NULL,
        resources_json TEXT NOT NULL
      );
    `);
  }

  tryClaim({ issueId, workerId, token, leaseMs, resources = [] }) {
    assertText(issueId, "issueId");
    assertText(workerId, "workerId");
    assertText(token, "token");
    assertLease(leaseMs);
    if (!Array.isArray(resources)) throw new ClaimLockError("CLAIM_INPUT_INVALID", "resources must be an array");
    const selectedIssueId = issueId.trim();
    const selectedWorkerId = workerId.trim();
    const selectedToken = token.trim();
    const selectedResources = [...new Set(resources.map((resource) => {
      assertText(resource, "resource");
      return resource.trim();
    }))].sort();
    const now = this.clock();
    const expiresAt = now + leaseMs;

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.#archiveExpired(now);
      if (this.database.prepare("SELECT 1 FROM claims WHERE issue_id = ?").get(selectedIssueId)) {
        this.database.exec("ROLLBACK");
        return null;
      }
      for (const resource of selectedResources) {
        if (this.database.prepare("SELECT 1 FROM resource_claims WHERE resource_key = ?").get(resource)) {
          this.database.exec("ROLLBACK");
          return null;
        }
      }
      this.database.prepare(`
        INSERT INTO claims(issue_id, worker_id, token, expires_at, resources_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(selectedIssueId, selectedWorkerId, selectedToken, expiresAt, JSON.stringify(selectedResources));
      const insertResource = this.database.prepare(`
        INSERT INTO resource_claims(resource_key, issue_id, token, expires_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const resource of selectedResources) {
        insertResource.run(resource, selectedIssueId, selectedToken, expiresAt);
      }
      this.database.exec("COMMIT");
      return {
        issueId: selectedIssueId,
        workerId: selectedWorkerId,
        token: selectedToken,
        expiresAt,
        resources: selectedResources,
      };
    } catch (error) {
      rollbackIfNeeded(this.database);
      throw error;
    }
  }

  getActive(token) {
    assertText(token, "token");
    const now = this.clock();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.#archiveExpired(now);
      const row = this.database.prepare(
        "SELECT * FROM claims WHERE token = ? AND expires_at > ?",
      ).get(token.trim(), now);
      if (!row) {
        this.database.exec("ROLLBACK");
        throw new ClaimLockError("CLAIM_NOT_ACTIVE", "Claim token is missing, expired, or fenced");
      }
      this.database.exec("COMMIT");
      return fromClaimRow(row);
    } catch (error) {
      rollbackIfNeeded(this.database);
      throw error;
    }
  }

  heartbeat({ token, leaseMs }) {
    assertText(token, "token");
    assertLease(leaseMs);
    const now = this.clock();
    const expiresAt = now + leaseMs;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.#archiveExpired(now);
      const row = this.database.prepare(
        "SELECT * FROM claims WHERE token = ? AND expires_at > ?",
      ).get(token.trim(), now);
      if (!row) {
        this.database.exec("ROLLBACK");
        throw new ClaimLockError("CLAIM_NOT_ACTIVE", "Claim token is missing, expired, or fenced");
      }
      this.database.prepare("UPDATE claims SET expires_at = ? WHERE token = ?").run(expiresAt, token.trim());
      this.database.prepare("UPDATE resource_claims SET expires_at = ? WHERE token = ?").run(expiresAt, token.trim());
      this.database.exec("COMMIT");
      return { ...fromClaimRow(row), expiresAt };
    } catch (error) {
      rollbackIfNeeded(this.database);
      throw error;
    }
  }

  release(token) {
    assertText(token, "token");
    const now = this.clock();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.#archiveExpired(now);
      const row = this.database.prepare(
        "SELECT * FROM claims WHERE token = ? AND expires_at > ?",
      ).get(token.trim(), now);
      if (!row) {
        this.database.exec("ROLLBACK");
        throw new ClaimLockError("CLAIM_NOT_ACTIVE", "Claim token is missing, expired, or fenced");
      }
      this.database.prepare("DELETE FROM claims WHERE token = ?").run(token.trim());
      this.database.exec("COMMIT");
      return fromClaimRow(row);
    } catch (error) {
      rollbackIfNeeded(this.database);
      throw error;
    }
  }

  listActive() {
    const now = this.clock();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.#archiveExpired(now);
      const rows = this.database.prepare("SELECT * FROM claims ORDER BY issue_id").all();
      this.database.exec("COMMIT");
      return rows.map(fromClaimRow);
    } catch (error) {
      rollbackIfNeeded(this.database);
      throw error;
    }
  }

  listExpired() {
    const now = this.clock();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.#archiveExpired(now);
      const rows = this.database.prepare(
        "SELECT * FROM recovery_queue ORDER BY expired_at, issue_id",
      ).all();
      this.database.exec("COMMIT");
      return rows.map((row) => ({
        issueId: row.issue_id,
        workerId: row.worker_id,
        token: row.token,
        expiresAt: Number(row.expired_at),
        resources: JSON.parse(row.resources_json),
      }));
    } catch (error) {
      rollbackIfNeeded(this.database);
      throw error;
    }
  }

  acknowledgeExpired(issueId) {
    assertText(issueId, "issueId");
    const result = this.database.prepare(
      "DELETE FROM recovery_queue WHERE issue_id = ?",
    ).run(issueId.trim());
    return result.changes > 0;
  }

  close() {
    this.database.close();
  }

  #archiveExpired(now) {
    const rows = this.database.prepare("SELECT * FROM claims WHERE expires_at <= ?").all(now);
    const archive = this.database.prepare(`
      INSERT INTO recovery_queue(issue_id, worker_id, token, expired_at, resources_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(issue_id) DO UPDATE SET
        worker_id = excluded.worker_id,
        token = excluded.token,
        expired_at = excluded.expired_at,
        resources_json = excluded.resources_json
    `);
    for (const row of rows) {
      archive.run(
        row.issue_id,
        row.worker_id,
        row.token,
        row.expires_at,
        row.resources_json,
      );
    }
    this.database.prepare("DELETE FROM claims WHERE expires_at <= ?").run(now);
  }
}

function fromClaimRow(row) {
  return {
    issueId: row.issue_id,
    workerId: row.worker_id,
    token: row.token,
    expiresAt: Number(row.expires_at),
    resources: JSON.parse(row.resources_json),
  };
}

function assertText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ClaimLockError("CLAIM_INPUT_INVALID", `${name} must be a non-empty string`);
  }
}

function assertLease(value) {
  if (!Number.isInteger(value) || value < 100 || value > 86_400_000) {
    throw new ClaimLockError("CLAIM_INPUT_INVALID", "leaseMs must be between 100 ms and 24 hours");
  }
}

function rollbackIfNeeded(database) {
  if (database.isTransaction) database.exec("ROLLBACK");
}
