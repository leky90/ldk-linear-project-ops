import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ClaimLockError, ClaimLockStore } from "../claim-lock/store.mjs";
import { runClaimLockCli } from "../claim-lock/cli.mjs";

test("competing stores cannot claim the same issue or exact resource", async () => {
  await withStores(({ first, second }) => {
    const claim = first.tryClaim({
      issueId: "issue-1",
      workerId: "codex-1",
      token: "token-1",
      leaseMs: 30_000,
      resources: ["repo:ldktech-solutions:src"],
    });
    assert.equal(claim.issueId, "issue-1");
    assert.equal(second.tryClaim({
      issueId: "issue-1",
      workerId: "codex-2",
      token: "token-2",
      leaseMs: 30_000,
      resources: [],
    }), null);
    assert.equal(second.tryClaim({
      issueId: "issue-2",
      workerId: "codex-2",
      token: "token-3",
      leaseMs: 30_000,
      resources: ["repo:ldktech-solutions:src"],
    }), null);
  });
});

test("expired tokens are fenced and archived before a replacement claim", async () => {
  let now = 1_000;
  await withStores(({ first, second }) => {
    first.tryClaim({
      issueId: "issue-1",
      workerId: "codex-old",
      token: "token-old",
      leaseMs: 1_000,
      resources: ["docs:baseline"],
    });
    now = 2_001;
    const replacement = second.tryClaim({
      issueId: "issue-1",
      workerId: "codex-new",
      token: "token-new",
      leaseMs: 1_000,
      resources: ["docs:baseline"],
    });
    assert.equal(replacement.token, "token-new");
    assert.throws(
      () => first.getActive("token-old"),
      (error) => error instanceof ClaimLockError && error.code === "CLAIM_NOT_ACTIVE",
    );
    assert.deepEqual(second.listExpired().map(({ token }) => token), ["token-old"]);
    second.acknowledgeExpired("issue-1");
    assert.deepEqual(second.listExpired(), []);
  }, { clock: () => now });
});

test("heartbeat extends a lease and release frees issue and resources", async () => {
  let now = 5_000;
  await withStores(({ first, second }) => {
    first.tryClaim({
      issueId: "issue-1",
      workerId: "codex-1",
      token: "token-1",
      leaseMs: 1_000,
      resources: ["docs:baseline"],
    });
    now = 5_500;
    assert.equal(first.heartbeat({ token: "token-1", leaseMs: 2_000 }).expiresAt, 7_500);
    assert.equal(first.release("token-1").issueId, "issue-1");
    assert.equal(second.tryClaim({
      issueId: "issue-1",
      workerId: "codex-2",
      token: "token-2",
      leaseMs: 1_000,
      resources: ["docs:baseline"],
    }).token, "token-2");
  }, { clock: () => now });
});

test("one goal-chain worker can hold parent and child leases without duplicating shared keys", async () => {
  await withStores(({ first, second }) => {
    assert.ok(first.tryClaim({
      issueId: "parent-1",
      workerId: "codex-run-1",
      token: "parent-token",
      leaseMs: 30_000,
      resources: ["repo:shared"],
    }));
    assert.ok(first.tryClaim({
      issueId: "child-1",
      workerId: "codex-run-1",
      token: "child-token",
      leaseMs: 30_000,
      resources: ["docs:child-only"],
    }));
    assert.equal(second.tryClaim({
      issueId: "other-1",
      workerId: "codex-run-2",
      token: "other-token",
      leaseMs: 30_000,
      resources: ["repo:shared"],
    }), null);
  });
});

test("CLI is local-only and returns structured claim lifecycle results", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ldk-claim-cli-"));
  const database = join(directory, "claims.sqlite");
  try {
    const claimed = await runClaimLockCli([
      "claim",
      "--database", database,
      "--issue-id", "issue-1",
      "--worker", "codex-cli",
      "--resources", "repo:src,docs:baseline",
      "--lease-ms", "30000",
    ], { tokenFactory: () => "cli-token" });
    assert.equal(claimed.ok, true);
    assert.equal(claimed.claim.token, "cli-token");
    assert.deepEqual(claimed.claim.resources, ["docs:baseline", "repo:src"]);

    const active = await runClaimLockCli(["active", "--database", database]);
    assert.equal(active.claims.length, 1);
    assert.equal("token" in active.claims[0], false);
    const verified = await runClaimLockCli([
      "verify", "--database", database, "--token", "cli-token",
    ]);
    assert.equal("token" in verified.claim, false);
    const released = await runClaimLockCli(["release", "--database", database, "--token", "cli-token"]);
    assert.equal(released.released.issueId, "issue-1");
    assert.equal("token" in released.released, false);

    const cliSource = await readFile(new URL("../claim-lock/cli.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(cliSource, /LINEAR_API_KEY|fetch\(|createIssue|updateIssue/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function withStores(callback, { clock = () => Date.now() } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "ldk-claim-store-"));
  const database = join(directory, "claims.sqlite");
  const first = new ClaimLockStore({ path: database, clock });
  const second = new ClaimLockStore({ path: database, clock });
  try {
    await callback({ first, second, database });
  } finally {
    first.close();
    second.close();
    await rm(directory, { recursive: true, force: true });
  }
}
