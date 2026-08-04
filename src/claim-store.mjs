import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AgentWorkflowError } from "./errors.mjs";

export class ClaimStore {
  constructor({ path, clock = () => Date.now() } = {}) {
    if (typeof path !== "string" || path.length === 0) {
      throw new AgentWorkflowError("CLAIM_STORE_INVALID", "Claim database path is required");
    }
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
        comment_id TEXT,
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
        comment_id TEXT,
        resources_json TEXT NOT NULL
      );
    `);
  }

  tryClaim({ issueId, workerId, token, leaseMs, resources = [] }) {
    assertText(issueId, "issueId");
    assertText(workerId, "workerId");
    assertText(token, "token");
    assertLease(leaseMs);
    const selectedResources = [...new Set(resources)].sort();
    const now = this.clock();
    const expiresAt = now + leaseMs;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.#deleteExpired(now);
      const existing = this.database.prepare("SELECT issue_id FROM claims WHERE issue_id = ?").get(issueId);
      if (existing) return this.#rollbackNull();
      for (const resource of selectedResources) {
        assertText(resource, "resource");
        const conflict = this.database.prepare("SELECT issue_id FROM resource_claims WHERE resource_key = ?").get(resource);
        if (conflict) return this.#rollbackNull();
      }
      this.database.prepare(`
        INSERT INTO claims(issue_id, worker_id, token, expires_at, resources_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(issueId, workerId, token, expiresAt, JSON.stringify(selectedResources));
      const insertResource = this.database.prepare(`
        INSERT INTO resource_claims(resource_key, issue_id, token, expires_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const resource of selectedResources) insertResource.run(resource, issueId, token, expiresAt);
      this.database.exec("COMMIT");
      return { issueId, workerId, token, expiresAt, resources: selectedResources, commentId: null };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  setCommentId(token, commentId) {
    assertText(commentId, "commentId");
    const claim = this.getActive(token);
    this.database.prepare("UPDATE claims SET comment_id = ? WHERE token = ?").run(commentId, token);
    return { ...claim, commentId };
  }

  heartbeat({ token, leaseMs }) {
    assertLease(leaseMs);
    const claim = this.getActive(token);
    const expiresAt = this.clock() + leaseMs;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE claims SET expires_at = ? WHERE token = ?").run(expiresAt, token);
      this.database.prepare("UPDATE resource_claims SET expires_at = ? WHERE token = ?").run(expiresAt, token);
      this.database.exec("COMMIT");
      return { ...claim, expiresAt };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getActive(token) {
    assertText(token, "token");
    const now = this.clock();
    this.database.exec("BEGIN IMMEDIATE");
    let row;
    try {
      this.#deleteExpired(now);
      row = this.database.prepare("SELECT * FROM claims WHERE token = ? AND expires_at > ?").get(token, now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    if (!row) throw new AgentWorkflowError("CLAIM_NOT_ACTIVE", "Claim token is missing, expired, or fenced");
    return fromRow(row);
  }

  release(token) {
    const claim = this.getActive(token);
    this.database.prepare("DELETE FROM claims WHERE token = ?").run(token);
    return claim;
  }

  listActive() {
    const now = this.clock();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.#deleteExpired(now);
      const rows = this.database.prepare("SELECT * FROM claims ORDER BY issue_id").all();
      this.database.exec("COMMIT");
      return rows.map(fromRow);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listRecoverable() {
    const now = this.clock();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.#deleteExpired(now);
      const rows = this.database.prepare("SELECT * FROM recovery_queue ORDER BY expired_at, issue_id").all();
      this.database.exec("COMMIT");
      return rows.map((row) => ({
        issueId: row.issue_id,
        workerId: row.worker_id,
        token: row.token,
        expiresAt: Number(row.expired_at),
        resources: JSON.parse(row.resources_json),
        commentId: row.comment_id ?? null,
      }));
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  acknowledgeRecovery(issueId) {
    assertText(issueId, "issueId");
    this.database.prepare("DELETE FROM recovery_queue WHERE issue_id = ?").run(issueId);
  }

  close() {
    this.database.close();
  }

  #deleteExpired(now) {
    const rows = this.database.prepare("SELECT * FROM claims WHERE expires_at <= ?").all(now);
    const archive = this.database.prepare(`
      INSERT INTO recovery_queue(issue_id, worker_id, token, expired_at, comment_id, resources_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(issue_id) DO UPDATE SET
        worker_id = excluded.worker_id,
        token = excluded.token,
        expired_at = excluded.expired_at,
        comment_id = excluded.comment_id,
        resources_json = excluded.resources_json
    `);
    for (const row of rows) {
      archive.run(row.issue_id, row.worker_id, row.token, row.expires_at, row.comment_id, row.resources_json);
    }
    this.database.prepare("DELETE FROM claims WHERE expires_at <= ?").run(now);
  }

  #rollbackNull() {
    this.database.exec("ROLLBACK");
    return null;
  }
}

function fromRow(row) {
  return {
    issueId: row.issue_id,
    workerId: row.worker_id,
    token: row.token,
    expiresAt: Number(row.expires_at),
    resources: JSON.parse(row.resources_json),
    commentId: row.comment_id ?? null,
  };
}

function assertText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AgentWorkflowError("CLAIM_INPUT_INVALID", `${name} must be a non-empty string`);
  }
}

function assertLease(value) {
  if (!Number.isInteger(value) || value < 100 || value > 86_400_000) {
    throw new AgentWorkflowError("CLAIM_INPUT_INVALID", "leaseMs must be between 100 ms and 24 hours");
  }
}
