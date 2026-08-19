import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateHandoff, validateProjectUpdate, validateWorkPlan } from "../scripts/lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const loadHandoff = async () => JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-handoff-v2.json"), "utf8"));
const loadPlan = async () => JSON.parse(await readFile(join(root, "tests", "fixtures", "valid-work-plan-v4.json"), "utf8"));

test("v2 reviews and verifications require non-empty checks and evidence", async () => {
  const base = await loadHandoff();
  assert.equal(validateHandoff(base).length, 0, "fixture stays valid");

  const emptyReview = { ...base, checks: [], evidence: [] };
  const errors = validateHandoff(emptyReview);
  assert.ok(errors.some((e) => /review checks/u.test(e)), errors.join("; "));
  assert.ok(errors.some((e) => /review evidence/u.test(e)), errors.join("; "));

  const verification = {
    ...base,
    type: "verification",
    observedState: { ...base.observedState, status: "Delivery Verification", logicalState: "delivery-verification" },
    transition: { from: "delivery-verification", to: "ready" },
    verification: { decision: "failed" },
    checks: [],
    evidence: [],
  };
  delete verification.review;
  const vErrors = validateHandoff(verification);
  assert.ok(vErrors.some((e) => /verification checks/u.test(e)), vErrors.join("; "));
  assert.ok(vErrors.some((e) => /verification evidence/u.test(e)), vErrors.join("; "));
});

test("local evidence detection catches home and UNC paths without profile false positives", async () => {
  const base = await loadHandoff();

  const profileSummary = { ...base, summary: "Updated the user profile: avatar and display name now render correctly." };
  assert.equal(validateHandoff(profileSummary).length, 0, "'profile:' prose must not be treated as a file URI");

  const homePath = structuredClone(base);
  homePath.evidence[0].value = "Full findings saved at ~/reports/qa-findings.md";
  assert.ok(validateHandoff(homePath).some((e) => /shared evidence/u.test(e)), "~/ paths are local evidence");

  const uncPath = structuredClone(base);
  uncPath.evidence[0].value = "\\\\fileserver\\share\\qa-report.md";
  assert.ok(validateHandoff(uncPath).some((e) => /shared evidence/u.test(e)), "UNC paths are local evidence");

  const fileUri = structuredClone(base);
  fileUri.evidence[0].value = "file:///Users/example/report.md";
  assert.ok(validateHandoff(fileUri).some((e) => /shared evidence/u.test(e)), "file:// URIs stay local evidence");
});

test("project updates pass through the comment-safety net", () => {
  const clean = {
    schemaVersion: 1,
    kind: "linear-project-update",
    mode: "preview",
    projectId: "proj-1",
    health: "on-track",
    summary: "Delivery is progressing as planned.",
    progress: ["Checkout outcome shipped."],
    risks: [],
    nextSteps: ["Verify the live rollout."],
    evidence: [{ label: "Rollout dashboard", value: "https://example.invalid/dashboard" }],
  };
  assert.equal(validateProjectUpdate(clean).length, 0);

  const localEvidence = structuredClone(clean);
  localEvidence.evidence[0].value = "/Users/example/private/notes/secret-plan.md";
  assert.ok(validateProjectUpdate(localEvidence).some((e) => /comment-safe/u.test(e)), "absolute local paths must not render into a Project Update");

  const homeSummary = structuredClone(clean);
  homeSummary.summary = "Report generated at ~/reports/out.md";
  assert.ok(validateProjectUpdate(homeSummary).some((e) => /comment-safe/u.test(e)));

  const oauthLeak = structuredClone(clean);
  oauthLeak.summary = "Rotated token lin_oauth_abcdefghijklmnop1234 for the connector.";
  assert.ok(validateProjectUpdate(oauthLeak).some((e) => /secret-like/u.test(e)), "Linear OAuth tokens are secret-like values");
});

test("work plans reject private local paths in Linear-bound text fields", async () => {
  const base = await loadPlan();
  assert.equal(validateWorkPlan(base).length, 0, "fixture stays valid");

  const leak = structuredClone(base);
  leak.issues[0].deliverable = "Ship the summary stored at /Users/example/notes/summary.md";
  assert.ok(validateWorkPlan(leak).some((e) => /private local path/u.test(e)), "home-directory paths must not land in issue contracts");

  const homeLeak = structuredClone(base);
  homeLeak.issues[0].outcome = "Deliver ~/drafts/launch-plan.md to the owner";
  assert.ok(validateWorkPlan(homeLeak).some((e) => /private local path/u.test(e)));

  const repoRelative = structuredClone(base);
  repoRelative.issues[0].deliverable = "Update docs/launch-checklist.md with the approved scope";
  assert.equal(validateWorkPlan(repoRelative).filter((e) => /private local path/u.test(e)).length, 0, "repo-relative references stay allowed in planning contracts");
});

test("software handoff field values are validated at runtime", async () => {
  const base = await loadHandoff();
  const software = {
    ...base,
    type: "handoff",
    fromRole: "software-engineer",
    toRole: "qa",
    observedState: { ...base.observedState, status: "In Progress", logicalState: "in-progress" },
    transition: { from: "in-progress", to: "in-review" },
    delivery: { ...base.delivery, mode: "software-merge", ownerRole: "software-engineer", phase: "review", checks: [{ mode: "software-merge", check: "Reviewed pull request is merged into main" }] },
    deliverables: ["Checkout implementation"],
    software: {
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      branchName: "task/checkout",
      branchPushed: "yes",
      pullRequestUrl: "not-a-url",
      ciStatus: "banana",
      git: {
        baselineId: "a".repeat(64),
        changeBaseSha: "0123456789abcdef0123456789abcdef01234567",
        scopePaths: ["src/checkout"],
      },
    },
  };
  delete software.review;
  const errors = validateHandoff(software);
  assert.ok(errors.some((e) => /software\.ciStatus/u.test(e)), errors.join("; "));
  assert.ok(errors.some((e) => /software\.pullRequestUrl/u.test(e)), errors.join("; "));
  assert.ok(errors.some((e) => /software\.branchPushed/u.test(e)), errors.join("; "));
});
