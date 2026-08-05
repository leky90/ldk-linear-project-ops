#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { readJson } from "./lib.mjs";

const PRIORITY = new Map([["urgent", 0], ["high", 1], ["normal", 2], ["low", 3], ["none", 4]]);

export function buildProjectReport(snapshot) {
  if (!snapshot?.project?.id || !snapshot?.project?.name) throw new Error("snapshot.project.id and name are required");
  const asOf = new Date(snapshot.asOf ?? Date.now());
  if (Number.isNaN(asOf.valueOf())) throw new Error("snapshot.asOf is invalid");
  const issues = (Array.isArray(snapshot.issues) ? snapshot.issues : []).filter((issue) => issue.status !== "Canceled");
  const issueByKey = new Map(issues.map((issue) => [issue.key ?? issue.id, issue]));
  const done = issues.filter((issue) => issue.status === "Done");
  const blocked = issues.filter((issue) => issue.status === "Blocked" || (issue.blockedByKeys ?? []).some((key) => issueByKey.get(key)?.status !== "Done"));
  const ready = issues.filter((issue) => issue.status === "Ready" && !blocked.includes(issue));
  const review = issues.filter((issue) => issue.status === "In Review");
  const active = issues.filter((issue) => issue.status === "In Progress");
  const refinement = issues.filter((issue) => issue.status === "Refinement");
  const decisions = issues.filter((issue) => issue.type === "decision" || issue.kind === "decision");
  const percent = issues.length ? Math.round((done.length / issues.length) * 100) : 0;
  const roles = [...new Set(issues.flatMap((issue) => [issue.ownerRole, issue.reviewerRole]).filter(Boolean))].sort();

  const queue = (items, roleField) => items
    .slice()
    .sort((left, right) => (PRIORITY.get(left.priority ?? "none") ?? 4) - (PRIORITY.get(right.priority ?? "none") ?? 4))
    .map((issue) => `- ${link(issue.title, issue.url)} — ${issue.priority ?? "none"}; ${roleField} ${issue[roleField] ?? "chưa gán"}.`);

  const milestones = Array.isArray(snapshot.milestones) ? snapshot.milestones : [];
  const milestoneLines = milestones.map((milestone) => {
    const scoped = issues.filter((issue) => issue.milestoneKey === milestone.key);
    const completed = scoped.filter((issue) => issue.status === "Done").length;
    const atRisk = scoped.some((issue) => blocked.includes(issue));
    return `- ${link(milestone.name, milestone.url)} — ${completed}/${scoped.length} Done; ${atRisk ? "có rủi ro" : "đang đi đúng hướng/chưa đủ dữ liệu"}${milestone.targetDate ? `; mục tiêu ${milestone.targetDate}` : ""}.`;
  });

  const roleLines = roles.map((role) => {
    const ownedReady = ready.filter((issue) => issue.ownerRole === role).length;
    const ownedActive = active.filter((issue) => issue.ownerRole === role).length;
    const awaitingReview = review.filter((issue) => issue.reviewerRole === role).length;
    return `- **${role}:** ${ownedReady} Ready, ${ownedActive} In Progress, ${awaitingReview} chờ review.`;
  });

  return [
    `# Trạng thái dự án — ${snapshot.project.name}`,
    "", `Dữ liệu lúc: ${asOf.toISOString()}`, `Project: ${link(snapshot.project.name, snapshot.project.url)} (${snapshot.project.id})`,
    "", "## Tổng quan", "",
    `- ${done.length}/${issues.length} issue Done (${percent}%).`,
    `- Refinement ${refinement.length}; Ready ${ready.length}; In Progress ${active.length}; In Review ${review.length}; Blocked ${blocked.length}.`,
    `- ${decisions.filter((issue) => issue.status !== "Done").length} quyết định còn mở.`,
    "", "## Milestones", "", ...(milestoneLines.length ? milestoneLines : ["- Chưa có dữ liệu milestone."]),
    "", "## Hàng đợi theo vai trò", "", ...(roleLines.length ? roleLines : ["- Chưa có vai trò được gán."]),
    "", "## Sẵn sàng thực hiện", "", ...((queue(ready, "ownerRole")).length ? queue(ready, "ownerRole") : ["- Không có issue Ready không bị chặn."]),
    "", "## Chờ review", "", ...((queue(review, "reviewerRole")).length ? queue(review, "reviewerRole") : ["- Không có issue chờ review."]),
    "", "## Blocker và quyết định", "",
    ...(blocked.length ? blocked.map((issue) => `- Blocked: ${link(issue.title, issue.url)} — cần ${issue.blocker?.neededFrom ?? "làm rõ người xử lý"}.`) : ["- Không có blocker."]),
    ...(decisions.filter((issue) => issue.status !== "Done").length ? decisions.filter((issue) => issue.status !== "Done").map((issue) => `- Decision: ${link(issue.title, issue.url)} — owner ${issue.ownerRole ?? "chưa gán"}.`) : ["- Không có quyết định mở."]),
    "", "## Hành động tiếp theo", "",
    ...(review.length ? review.map((issue) => `- ${issue.reviewerRole ?? "Reviewer"}: review ${link(issue.title, issue.url)}.`) : []),
    ...(ready.length ? ready.slice(0, 5).map((issue) => `- ${issue.ownerRole ?? "Owner"}: thực hiện ${link(issue.title, issue.url)}.`) : []),
    ...(!review.length && !ready.length ? ["- Làm rõ Refinement hoặc tháo blocker để tạo hàng đợi tiếp theo."] : []),
    "",
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
