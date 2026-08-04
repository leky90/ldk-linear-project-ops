#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { readJson } from "./lib.mjs";

const PRIORITY = new Map([
  ["urgent", 0],
  ["high", 1],
  ["normal", 2],
  ["low", 3],
  ["none", 4]
]);

export function buildProjectReport(snapshot) {
  if (!snapshot?.project?.id || !snapshot?.project?.name) throw new Error("snapshot.project.id and name are required");
  const asOf = new Date(snapshot.asOf ?? Date.now());
  if (Number.isNaN(asOf.valueOf())) throw new Error("snapshot.asOf is invalid");
  const issues = Array.isArray(snapshot.issues) ? snapshot.issues : [];
  const active = issues.filter((issue) => issue.status !== "Canceled");
  const done = active.filter((issue) => issue.status === "Done");
  const percent = active.length ? Math.round((done.length / active.length) * 100) : 0;
  const byStatus = new Map();
  active.forEach((issue) => byStatus.set(issue.status ?? "Unknown", (byStatus.get(issue.status ?? "Unknown") ?? 0) + 1));
  const issueByKey = new Map(issues.map((issue) => [issue.key, issue]));

  const blockers = active.filter((issue) => {
    if (issue.status === "Blocked") return true;
    return (issue.blockedByKeys ?? []).some((key) => issueByKey.get(key)?.status !== "Done");
  });
  const decisions = active.filter((issue) => issue.kind === "decision" || issue.labels?.includes("manager:decision"));
  const runnable = active
    .filter((issue) => issue.status === "Ready")
    .filter((issue) => !(issue.blockedByKeys ?? []).some((key) => issueByKey.get(key)?.status !== "Done"))
    .sort((left, right) => {
      const priority = (PRIORITY.get(left.priority ?? "none") ?? 4) - (PRIORITY.get(right.priority ?? "none") ?? 4);
      if (priority) return priority;
      const leftDue = left.dueDate ? Date.parse(left.dueDate) : Number.POSITIVE_INFINITY;
      const rightDue = right.dueDate ? Date.parse(right.dueDate) : Number.POSITIVE_INFINITY;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return Date.parse(left.readyAt ?? left.updatedAt ?? 0) - Date.parse(right.readyAt ?? right.updatedAt ?? 0);
    })
    .slice(0, 5);

  const staleIssues = active.filter((issue) => {
    if (["Done", "In Review"].includes(issue.status)) return false;
    const updated = Date.parse(issue.updatedAt ?? "");
    return Number.isFinite(updated) && asOf.valueOf() - updated > 48 * 60 * 60 * 1000;
  });
  const staleClaims = active.filter((issue) => {
    const expiry = Date.parse(issue.claim?.expiresAt ?? "");
    return Number.isFinite(expiry) && expiry < asOf.valueOf() && issue.status === "In Progress";
  });

  const milestones = Array.isArray(snapshot.milestones) ? snapshot.milestones : [];
  const milestoneLines = milestones.length
    ? milestones.map((milestone) => {
        const scoped = active.filter((issue) => issue.milestoneKey === milestone.key);
        const scopedDone = scoped.filter((issue) => issue.status === "Done").length;
        const risk = scoped.some((issue) => blockers.includes(issue)) ? "at risk" : "on track/unknown";
        return `- ${link(milestone.name, milestone.url)}: ${scopedDone}/${scoped.length} Done; ${risk}${milestone.targetDate ? `; target ${milestone.targetDate}` : ""}.`;
      }) : ["- No milestone data returned."];

  const parentLines = active.filter((issue) => issue.kind === "parent").map((parent) => {
    const children = active.filter((issue) => issue.parentKey === parent.key);
    const childDone = children.filter((issue) => issue.status === "Done").length;
    return `- ${link(parent.title, parent.url)} — ${parent.status}; children ${childDone}/${children.length} Done.`;
  });

  const claimLines = active.filter((issue) => issue.claim && issue.status === "In Progress").map((issue) =>
    `- ${link(issue.title, issue.url)} — ${issue.claim.runId ?? "unknown run"}; expires ${issue.claim.expiresAt ?? "unknown"}; resources ${(issue.resources ?? []).join(", ") || "none declared"}.`
  );

  return [
    `# Project status — ${snapshot.project.name}`,
    "",
    `Data timestamp: ${asOf.toISOString()}`,
    `Project: ${link(snapshot.project.name, snapshot.project.url)} (${snapshot.project.id})`,
    "",
    "## Executive status",
    "",
    `- ${done.length}/${active.length} non-canceled issues are Done (${percent}%).`,
    `- States: ${[...byStatus.entries()].sort().map(([state, count]) => `${state} ${count}`).join(", ") || "no issues"}.`,
    `- ${blockers.length} blocked/dependency-blocked; ${decisions.length} manager decisions; ${staleClaims.length} expired claims.`,
    "",
    "## Milestones",
    "",
    ...milestoneLines,
    "",
    "## Parent outcomes",
    "",
    ...(parentLines.length ? parentLines : ["- No parent outcomes returned."]),
    "",
    "## Active goal chains",
    "",
    ...(claimLines.length ? claimLines : ["- No verified active goal chain returned."]),
    "",
    "## Blockers and decisions",
    "",
    ...(blockers.length ? blockers.map((issue) => `- Blocker: ${link(issue.title, issue.url)} — ${issue.status}.`) : ["- No blockers returned."]),
    ...(decisions.length ? decisions.map((issue) => `- Decision: ${link(issue.title, issue.url)} — owner ${issue.assignee ?? "manager required"}.`) : ["- No manager decisions returned."]),
    "",
    "## Priority queue",
    "",
    ...(runnable.length ? runnable.map((issue, index) => `${index + 1}. ${link(issue.title, issue.url)} — ${issue.priority ?? "none"}; ${issue.priorityRationale ?? "explicit rationale not recorded"}.`) : ["- No runnable Ready issue returned."]),
    "",
    "## Stale or inconsistent work",
    "",
    ...(staleClaims.length ? staleClaims.map((issue) => `- Expired claim: ${link(issue.title, issue.url)} (${issue.claim.expiresAt}).`) : ["- No expired claim returned."]),
    ...(staleIssues.length ? staleIssues.map((issue) => `- Stale >48h: ${link(issue.title, issue.url)}; last updated ${issue.updatedAt}.`) : ["- No stale open issue returned."]),
    "",
    "## Next actions",
    "",
    ...(runnable.length
      ? runnable.map((issue) => `- Agent: claim ${link(issue.title, issue.url)} and submit evidence for its acceptance criteria.`)
      : ["- Manager/triage: resolve blockers or prepare a fully specified Ready issue."]),
    ...(snapshot.measurementGaps?.length
      ? snapshot.measurementGaps.map((gap) => `- Measurement required: ${gap}.`)
      : ["- No measurement gap supplied in the snapshot."]),
    ""
  ].join("\n");
}

function link(label, url) {
  return url ? `[${label}](${url})` : label;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) {
    process.stderr.write("Usage: build-project-report.mjs <snapshot.json>\n");
    process.exit(2);
  }
  try {
    process.stdout.write(`${buildProjectReport(await readJson(process.argv[2]))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
