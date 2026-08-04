import { randomUUID } from "node:crypto";

import { AgentWorkflowError } from "./errors.mjs";
import { formatTaskDescription, parseTaskMetadata } from "./metadata.mjs";
import { validatePlan } from "./plan.mjs";

export function createAgentWorkflow({ config, linear, claimStore, clock = () => Date.now(), tokenFactory = randomUUID } = {}) {
  if (!config || !linear || !claimStore) {
    throw new AgentWorkflowError("WORKFLOW_INVALID", "Config, Linear gateway, and claim store are required");
  }
  return {
    async syncPlan(inputPlan) {
      const plan = validatePlan(inputPlan, config);
      const existingIssues = await linear.listProjectIssues({
        teamId: config.linear.teamId,
        projectId: config.linear.projectId,
      });
      assertIssueScope(existingIssues, config);
      const existingKeys = new Set();
      for (const issue of existingIssues) {
        try {
          existingKeys.add(parseTaskMetadata(issue.description).key);
        } catch (error) {
          if (error.code !== "TASK_METADATA_REQUIRED" && error.code !== "TASK_METADATA_INVALID") throw error;
        }
      }
      const results = [];
      for (const item of plan.items) {
        if (existingKeys.has(item.key)) {
          results.push({ key: item.key, created: false });
          continue;
        }
        const issue = await linear.createIssue({
          teamId: config.linear.teamId,
          projectId: config.linear.projectId,
          statusId: config.linear.statuses.ready,
          title: item.title,
          description: formatTaskDescription(item),
          ...(item.priority !== undefined ? { priority: item.priority } : {}),
        });
        results.push({ key: item.key, created: true, issue });
        existingKeys.add(item.key);
      }
      return {
        schemaVersion: 1,
        projectId: config.linear.projectId,
        created: results.filter(({ created }) => created).length,
        existing: results.filter(({ created }) => !created).length,
        results,
      };
    },

    async claimNext({ workerId, capabilities = [], leaseMs = config.defaultLeaseMs }) {
      if (typeof workerId !== "string" || workerId.trim().length === 0) {
        throw new AgentWorkflowError("WORKER_ID_REQUIRED", "workerId is required");
      }
      await recoverExpired();
      const workerCapabilities = new Set(capabilities);
      const issues = await linear.listReadyIssues({
        teamId: config.linear.teamId,
        projectId: config.linear.projectId,
        statusId: config.linear.statuses.ready,
      });
      assertIssueScope(issues, config);
      const candidates = issues
        .filter((issue) => issue.blocked !== true)
        .map((issue) => {
          try {
            return { issue, metadata: parseTaskMetadata(issue.description) };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter(({ metadata }) => metadata.capabilities.every((capability) => workerCapabilities.has(capability)))
        .sort(compareCandidate);
      for (const candidate of candidates) {
        const token = tokenFactory();
        const claim = claimStore.tryClaim({
          issueId: candidate.issue.id,
          workerId,
          token,
          leaseMs,
          resources: candidate.metadata.resources,
        });
        if (!claim) continue;
        let movedToInProgress = false;
        try {
          await linear.updateIssueState({
            issueId: candidate.issue.id,
            statusId: config.linear.statuses.inProgress,
          });
          movedToInProgress = true;
          const comment = await linear.createRunComment({
            issueId: candidate.issue.id,
            body: runBody({
              issue: candidate.issue,
              workerId,
              resources: candidate.metadata.resources,
              status: "In Progress",
              startedAt: new Date(clock()).toISOString(),
            }),
          });
          claimStore.setCommentId(token, comment.id);
          return {
            schemaVersion: 1,
            issue: candidate.issue,
            token,
            workerId,
            expiresAt: claim.expiresAt,
            resources: candidate.metadata.resources,
          };
        } catch (error) {
          if (movedToInProgress) {
            try {
              await linear.updateIssueState({
                issueId: candidate.issue.id,
                statusId: config.linear.statuses.ready,
              });
              claimStore.release(token);
            } catch {
              // Keep the lease so recovery can reconcile a partially claimed issue safely.
            }
          } else {
            claimStore.release(token);
          }
          throw error;
        }
      }
      return null;
    },

    async recoverExpired() {
      return recoverExpired();
    },

    async heartbeat({ token, leaseMs = config.defaultLeaseMs }) {
      const claim = claimStore.heartbeat({ token, leaseMs });
      return { schemaVersion: 1, issueId: claim.issueId, expiresAt: claim.expiresAt };
    },

    async finish({ token, outcome, evidence = [], summary = "" }) {
      const statusId = finishStatus(config, outcome);
      const claim = claimStore.getActive(token);
      const safeEvidence = normalizeEvidence(evidence);
      if (["review", "done"].includes(outcome) && safeEvidence.length === 0) {
        throw new AgentWorkflowError("EVIDENCE_REQUIRED", "review and done outcomes require at least one evidence URI");
      }
      if (outcome === "blocked" && (typeof summary !== "string" || summary.trim().length === 0)) {
        throw new AgentWorkflowError("BLOCKER_SUMMARY_REQUIRED", "blocked outcome requires a summary");
      }
      await linear.updateIssueState({ issueId: claim.issueId, statusId });
      if (claim.commentId) {
        await linear.updateRunComment({
          commentId: claim.commentId,
          body: runBody({
            issue: { id: claim.issueId },
            workerId: claim.workerId,
            resources: claim.resources,
            status: outcomeLabel(outcome),
            finishedAt: new Date(clock()).toISOString(),
            evidence: safeEvidence,
            summary,
          }),
        });
      }
      claimStore.release(token);
      return { schemaVersion: 1, issueId: claim.issueId, outcome, evidence: safeEvidence };
    },
  };

  async function recoverExpired() {
    const recoverable = claimStore.listRecoverable();
    if (recoverable.length === 0) return { schemaVersion: 1, recovered: 0, acknowledged: 0 };
    const issues = await linear.listProjectIssues({
      teamId: config.linear.teamId,
      projectId: config.linear.projectId,
    });
    assertIssueScope(issues, config);
    const byId = new Map(issues.map((issue) => [issue.id, issue]));
    let recovered = 0;
    let acknowledged = 0;
    for (const expired of recoverable) {
      const issue = byId.get(expired.issueId);
      if (issue?.statusId === config.linear.statuses.inProgress) {
        if (expired.commentId) {
          await linear.updateRunComment({
            commentId: expired.commentId,
            body: runBody({
              issue,
              workerId: expired.workerId,
              resources: expired.resources,
              status: "Lease Expired — Returned to Ready",
              finishedAt: new Date(clock()).toISOString(),
              summary: "The worker lease expired before completion. This task was returned to the claim queue automatically.",
            }),
          });
        }
        await linear.updateIssueState({ issueId: expired.issueId, statusId: config.linear.statuses.ready });
        recovered += 1;
      } else {
        acknowledged += 1;
      }
      claimStore.acknowledgeRecovery(expired.issueId);
    }
    return { schemaVersion: 1, recovered, acknowledged };
  }
}

function assertIssueScope(issues, config) {
  for (const issue of issues) {
    if (issue.projectId !== config.linear.projectId || issue.teamId !== config.linear.teamId) {
      throw new AgentWorkflowError("ISSUE_SCOPE_MISMATCH", "Linear returned an issue outside the pinned new project", {
        issueId: issue.id,
      });
    }
  }
}

function compareCandidate(left, right) {
  const leftPriority = left.issue.priority === 0 ? 5 : left.issue.priority ?? 5;
  const rightPriority = right.issue.priority === 0 ? 5 : right.issue.priority ?? 5;
  return leftPriority - rightPriority || String(left.issue.identifier).localeCompare(String(right.issue.identifier));
}

function finishStatus(config, outcome) {
  const selected = {
    review: config.linear.statuses.inReview,
    blocked: config.linear.statuses.blocked,
    done: config.linear.statuses.done,
  }[outcome];
  if (!selected) throw new AgentWorkflowError("OUTCOME_INVALID", "outcome must be review, blocked, or done");
  return selected;
}

function outcomeLabel(outcome) {
  return { review: "In Review", blocked: "Blocked", done: "Done" }[outcome];
}

function normalizeEvidence(values) {
  if (!Array.isArray(values)) throw new AgentWorkflowError("EVIDENCE_INVALID", "evidence must be an array");
  const output = [...new Set(values)].sort();
  for (const value of output) {
    try {
      const url = new URL(value);
      if (!url.protocol) throw new Error("protocol required");
    } catch {
      throw new AgentWorkflowError("EVIDENCE_INVALID", "Every evidence item must be a URI");
    }
  }
  return output;
}

function runBody({ workerId, resources, status, startedAt, finishedAt, evidence = [], summary = "" }) {
  return [
    "## Agent Run",
    "",
    `- Worker: ${workerId}`,
    `- Status: ${status}`,
    ...(startedAt ? [`- Started: ${startedAt}`] : []),
    ...(finishedAt ? [`- Finished: ${finishedAt}`] : []),
    "",
    "### Resources",
    ...(resources.length ? resources.map((resource) => `- ${resource}`) : ["- None"]),
    "",
    "### Evidence",
    ...(evidence.length ? evidence.map((item) => `- ${item}`) : ["- Pending"]),
    ...(summary ? ["", "### Summary", summary] : []),
  ].join("\n");
}
