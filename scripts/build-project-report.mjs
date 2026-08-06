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
  const blockedKeys = (issue) => issue.relations?.blockedByKeys ?? issue.blockedByKeys ?? [];
  const done = issues.filter((issue) => issue.status === "Done");
  const blocked = issues.filter((issue) => issue.status === "Blocked" || blockedKeys(issue).some((key) => issueByKey.get(key)?.status !== "Done"));
  const ready = issues.filter((issue) => issue.status === "Ready" && !blocked.includes(issue));
  const review = issues.filter((issue) => issue.status === "In Review");
  const active = issues.filter((issue) => issue.status === "In Progress");
  const refinement = issues.filter((issue) => issue.status === "Refinement");
  const decisions = issues.filter((issue) => issue.type === "decision" || issue.kind === "decision");
  const percent = issues.length ? Math.round((done.length / issues.length) * 100) : 0;
  const estimated = issues.filter((issue) => typeof issue.estimate === "number");
  const totalEffort = estimated.reduce((sum, issue) => sum + issue.estimate, 0);
  const doneEffort = estimated.filter((issue) => issue.status === "Done").reduce((sum, issue) => sum + issue.estimate, 0);
  const effortPercent = totalEffort ? Math.round((doneEffort / totalEffort) * 100) : null;
  const roles = [...new Set(issues.flatMap((issue) => [issue.ownerRole, issue.reviewerRole]).filter(Boolean))].sort();
  const milestones = Array.isArray(snapshot.milestones) ? snapshot.milestones : [];
  const milestoneByKey = new Map(milestones.map((milestone) => [milestone.key, milestone]));

  const queue = (items, roleField) => items
    .slice()
    .sort((left, right) => (PRIORITY.get(left.priority ?? "none") ?? 4) - (PRIORITY.get(right.priority ?? "none") ?? 4))
    .map((issue) => {
      const planning = [
        issue.milestoneKey ? `milestone ${milestoneByKey.get(issue.milestoneKey)?.name ?? issue.milestoneKey}` : null,
        issue.cycleName ?? (issue.cycleId ? `cycle ${issue.cycleId}` : null),
        issue.dueDate ? `due ${issue.dueDate}` : null,
        typeof issue.estimate === "number" ? `estimate ${issue.estimate}` : null,
        issue.assignee ? `assignee ${issue.assignee}` : null,
      ].filter(Boolean).join("; ");
      return `- ${link(issue.title, issue.url)} — ${issue.priority ?? "none"}; ${roleField} ${issue[roleField] ?? "chưa gán"}${planning ? `; ${planning}` : ""}.`;
    });

  const milestoneLines = milestones.map((milestone) => {
    const scoped = issues.filter((issue) => issue.milestoneKey === milestone.key);
    const completed = scoped.filter((issue) => issue.status === "Done").length;
    const scopedEstimated = scoped.filter((issue) => typeof issue.estimate === "number");
    const scopedEffort = scopedEstimated.reduce((sum, issue) => sum + issue.estimate, 0);
    const scopedDoneEffort = scopedEstimated.filter((issue) => issue.status === "Done").reduce((sum, issue) => sum + issue.estimate, 0);
    const effort = scopedEffort ? `; effort ${scopedDoneEffort}/${scopedEffort}` : "";
    const atRisk = scoped.some((issue) => blocked.includes(issue));
    return `- ${link(milestone.name, milestone.url)} — ${completed}/${scoped.length} Done${effort}; ${atRisk ? "có rủi ro" : "đang đi đúng hướng/chưa đủ dữ liệu"}${milestone.targetDate ? `; mục tiêu ${milestone.targetDate}` : ""}.`;
  });

  const roleLines = roles.map((role) => {
    const ownedReady = ready.filter((issue) => issue.ownerRole === role).length;
    const ownedActive = active.filter((issue) => issue.ownerRole === role).length;
    const awaitingReview = review.filter((issue) => issue.reviewerRole === role).length;
    return `- **${role}:** ${ownedReady} Ready, ${ownedActive} In Progress, ${awaitingReview} chờ review.`;
  });

  const initiatives = Array.isArray(snapshot.initiatives) ? snapshot.initiatives : [];
  const initiativeLines = initiatives.map((initiative) => `- ${link(initiative.name, initiative.url)} — ${initiative.status ?? "unknown"}; ${initiative.priority ?? "none"}; owner ${initiative.owner ?? "chưa gán"}${initiative.targetDate ? `; target ${initiative.targetDate}` : ""}.`);
  const latestUpdate = snapshot.project.latestUpdate;
  const projectProperties = [
    `status ${snapshot.project.status ?? "unknown"}`,
    `health ${latestUpdate?.health ?? snapshot.project.health ?? "chưa cập nhật"}`,
    `priority ${snapshot.project.priority ?? "none"}`,
    `lead ${snapshot.project.lead ?? "chưa gán"}`,
    `window ${snapshot.project.startDate ?? "?"} → ${snapshot.project.targetDate ?? "?"}`,
  ].join("; ");

  return [
    `# Trạng thái dự án — ${snapshot.project.name}`,
    "", `Dữ liệu lúc: ${asOf.toISOString()}`, `Project: ${link(snapshot.project.name, snapshot.project.url)} (${snapshot.project.id})`,
    "", "## Project properties", "", `- ${projectProperties}.`,
    ...(latestUpdate ? [`- Latest update: ${latestUpdate.createdAt ?? "unknown time"} — ${latestUpdate.summary ?? "không có summary"}.`] : ["- Chưa có Native Project Update."]),
    "", "## Tổng quan", "",
    `- ${done.length}/${issues.length} issue Done (${percent}%).`,
    `- ${effortPercent === null ? "Chưa đủ estimate để tính effort progress" : `${doneEffort}/${totalEffort} estimated effort Done (${effortPercent}%)`}.`,
    `- Refinement ${refinement.length}; Ready ${ready.length}; In Progress ${active.length}; In Review ${review.length}; Blocked ${blocked.length}.`,
    `- ${decisions.filter((issue) => issue.status !== "Done").length} quyết định còn mở.`,
    "", "## Native Initiatives", "", ...(initiativeLines.length ? initiativeLines : ["- Project chưa gắn Native Initiative hoặc dữ liệu chưa được trả về."]),
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
