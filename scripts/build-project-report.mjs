#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { readJson } from "./lib.mjs";
import { analyzeProjectLifecycle, resolveProjectStatus } from "./project-lifecycle.mjs";
import { normalizeProjectSnapshot } from "./project-snapshot.mjs";

const PRIORITY = new Map([["urgent", 0], ["high", 1], ["normal", 2], ["low", 3], ["none", 4]]);
const CONSISTENCY_LABEL = Object.freeze({ consistent: "Nhất quán", mismatch: "Bất nhất", advisory: "Cần chú ý", unknown: "Không xác định" });

export function buildProjectReport(input) {
  if (!input?.project?.id || !input?.project?.name) throw new Error("snapshot.project.id and name are required");
  const snapshot = normalizeProjectSnapshot(input);
  const asOf = new Date(snapshot.asOf ?? Date.now());
  if (Number.isNaN(asOf.valueOf())) throw new Error("snapshot.asOf is invalid");
  const issues = snapshot.issues.filter((issue) => issue.logicalState !== "canceled");
  const issueByKey = new Map(issues.map((issue) => [issue.key ?? issue.id, issue]));
  // Blocker endpoints resolve against every snapshot issue, including the
  // canceled ones filtered out of the actionable set: a canceled blocker no
  // longer blocks anything, and terminal work is never actionable as blocked.
  const allIssuesByKey = new Map(snapshot.issues.map((issue) => [issue.key ?? issue.id, issue]));
  const blockedKeys = (issue) => issue.relations?.blockedByKeys ?? issue.blockedByKeys ?? [];
  const blockerOpen = (key) => {
    const blocker = allIssuesByKey.get(key);
    if (!blocker) return true;
    return blocker.logicalState !== "done" && blocker.logicalState !== "canceled";
  };
  const done = issues.filter((issue) => issue.logicalState === "done" && issue.terminalVerified === true);
  const terminalMismatches = issues.filter((issue) => issue.logicalState === "done" && issue.terminalVerified !== true);
  const blocked = issues.filter((issue) => issue.logicalState !== "done"
    && (issue.logicalState === "blocked" || blockedKeys(issue).some(blockerOpen)));
  const ready = issues.filter((issue) => issue.logicalState === "ready" && !blocked.includes(issue));
  const review = issues.filter((issue) => issue.logicalState === "in-review");
  const active = issues.filter((issue) => issue.logicalState === "in-progress");
  const readyToDeliver = issues.filter((issue) => issue.logicalState === "ready-to-deliver");
  const deliveryVerification = issues.filter((issue) => issue.logicalState === "delivery-verification");
  const refinement = issues.filter((issue) => issue.logicalState === "refinement");
  const unknown = issues.filter((issue) => issue.logicalState === "unknown");
  const staleHandoffs = issues.filter((issue) => issue.handoffStale);
  const missingPriority = issues.filter((issue) => !issue.priority || issue.priority === "none");
  const decisions = issues.filter((issue) => issue.type === "decision" || issue.kind === "decision");
  const percent = issues.length ? Math.round((done.length / issues.length) * 100) : 0;
  const estimated = issues.filter((issue) => typeof issue.estimate === "number");
  const totalEffort = estimated.reduce((sum, issue) => sum + issue.estimate, 0);
  const doneEffort = estimated.filter((issue) => issue.logicalState === "done" && issue.terminalVerified === true).reduce((sum, issue) => sum + issue.estimate, 0);
  const effortPercent = totalEffort ? Math.round((doneEffort / totalEffort) * 100) : null;
  const roles = [...new Set(issues.flatMap((issue) => [issue.ownerRole, issue.reviewerRole]).filter(Boolean))].sort();
  const milestones = Array.isArray(snapshot.milestones) ? snapshot.milestones : [];
  const milestoneByKey = new Map(milestones.map((milestone) => [milestone.key, milestone]));
  const lifecycle = analyzeProjectLifecycle(snapshot);
  const projectStatus = resolveProjectStatus(snapshot.project);

  const queue = (items, roleField) => items
    .slice()
     .sort((left, right) => compareIssues(left, right, issues, milestoneByKey, asOf))
    .map((issue) => {
      const planning = [
        issue.milestoneKey ? `milestone ${milestoneByKey.get(issue.milestoneKey)?.name ?? issue.milestoneKey}` : null,
        issue.cycleName ?? (issue.cycleId ? `cycle ${issue.cycleId}` : null),
        issue.dueDate ? `due ${issue.dueDate}` : null,
        typeof issue.estimate === "number" ? `estimate ${issue.estimate}` : null,
        issue.assignee ? `assignee ${issue.assignee}` : null,
      ].filter(Boolean).join("; ");
      const prioritySource = issue.prioritySource === "policy-default" ? "; priority source policy-default" : "";
      return `- ${link(issue.title, issue.url)} — ${issue.priority ?? "none"}${prioritySource}; ${roleField} ${issue[roleField] ?? "chưa gán"}${planning ? `; ${planning}` : ""}.`;
    });

  const milestoneLines = milestones.map((milestone) => {
    const scoped = issues.filter((issue) => issue.milestoneKey === milestone.key);
    const completed = scoped.filter((issue) => issue.logicalState === "done" && issue.terminalVerified === true).length;
    const scopedEstimated = scoped.filter((issue) => typeof issue.estimate === "number");
    const scopedEffort = scopedEstimated.reduce((sum, issue) => sum + issue.estimate, 0);
    const scopedDoneEffort = scopedEstimated.filter((issue) => issue.logicalState === "done" && issue.terminalVerified === true).reduce((sum, issue) => sum + issue.estimate, 0);
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
    `status ${projectStatus.name} (${projectStatus.category ?? "unknown category"})`,
    `health ${latestUpdate?.health ?? snapshot.project.health ?? "chưa cập nhật"}`,
    `priority ${snapshot.project.priority ?? "none"}`,
    `lead ${snapshot.project.lead ?? "chưa gán"}`,
    `window ${snapshot.project.startDate ?? "?"} → ${snapshot.project.targetDate ?? "?"}`,
  ].join("; ");
  const lifecycleLines = [
    `- Kết luận: **${CONSISTENCY_LABEL[lifecycle.consistency] ?? lifecycle.consistency}** — ${lifecycle.message}`,
    `- Evidence: ${lifecycle.evidence.length ? lifecycle.evidence.join("; ") : "chưa có execution evidence"}.`,
    ...(lifecycle.recommendedCategory && lifecycle.recommendedCategory !== projectStatus.category
      ? [lifecycle.safeTransition
        ? `- Đề xuất chuyển: **${projectStatus.name} → ${lifecycle.recommendedName}**; khi áp dụng phải dùng live Linear status ID thuộc category \`${lifecycle.recommendedCategory}\`.`
        : `- Cần quyết định lifecycle trước khi chuyển: **${projectStatus.name} → ${lifecycle.recommendedName}**; không tự reopen/complete/cancel.`]
      : []),
    ...(lifecycle.code === "continuous-needs-outcome"
      ? ["- Không chuyển Completed chỉ vì hàng đợi trống; CPO cần mở outcome/milestone tiếp theo."]
      : []),
  ];
  const phases = snapshot.phases;
  const phaseLines = phases.map((phase) => {
    const scoped = issues.filter((issue) => issue.phaseKey === phase.key);
    const outcomes = scoped.filter((issue) => issue.type === "outcome").length;
    return `- ${phase.order ?? "?"}. ${phase.objective ?? phase.name ?? phase.key} — ${outcomes} outcome; ${scoped.length} issue.`;
  });
  const outcomeLines = issues.filter((issue) => issue.type === "outcome").map((issue) => `- ${link(issue.title, issue.url)} — ${issue.logicalState}; ${issue.priority ?? "missing priority"}; phase ${issue.phaseKey ?? "unassigned"}.`);
  const recentCompletions = done
    .filter((issue) => issue.completedAt)
    .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)))
    .slice(0, 5);
  const nextActions = buildNextActions({
    issues,
    ready,
    review,
    readyToDeliver,
    deliveryVerification,
    lifecycle,
    projectStatus,
    milestoneByKey,
    asOf,
  });

  return [
    `# Trạng thái dự án — ${snapshot.project.name}`,
    "", `Dữ liệu lúc: ${asOf.toISOString()}`, `Project: ${link(snapshot.project.name, snapshot.project.url)} (${snapshot.project.id})`,
    "", "## Project properties", "", `- ${projectProperties}.`,
    ...(latestUpdate ? [`- Latest update: ${latestUpdate.createdAt ?? "unknown time"} — ${latestUpdate.summary ?? "không có summary"}`] : ["- Chưa có Native Project Update."]),
    "", "## Nhất quán Project lifecycle", "", ...lifecycleLines,
    "", "## Tổng quan", "",
    `- ${done.length}/${issues.length} issue Done (${percent}%).`,
    `- ${effortPercent === null ? "Chưa đủ estimate để tính effort progress" : `${doneEffort}/${totalEffort} estimated effort Done (${effortPercent}%)`}.`,
    `- Refinement ${refinement.length}; Ready ${ready.length}; In Progress ${active.length}; In Review ${review.length}; Ready to Deliver ${readyToDeliver.length}; Delivery Verification ${deliveryVerification.length}; Blocked ${blocked.length}; Unknown ${unknown.length}.`,
    `- ${decisions.filter((issue) => issue.logicalState !== "done").length} quyết định còn mở.`,
    "", "## Native Initiatives", "", ...(initiativeLines.length ? initiativeLines : ["- Project chưa gắn Native Initiative hoặc dữ liệu chưa được trả về."]),
    "", "## Milestones", "", ...(milestoneLines.length ? milestoneLines : ["- Chưa có dữ liệu milestone."]),
    "", "## Logical phases and outcomes", "", ...(phaseLines.length ? phaseLines : ["- Chưa có logical phase metadata."]), ...(outcomeLines.length ? outcomeLines : ["- Không có outcome issue."]),
    "", "## Hàng đợi theo vai trò", "", ...(roleLines.length ? roleLines : ["- Chưa có vai trò được gán."]),
    "", "## Active work", "", ...((queue(active, "ownerRole")).length ? queue(active, "ownerRole") : ["- Không có issue đang In Progress."]),
    "", "## Sẵn sàng thực hiện", "", ...((queue(ready, "ownerRole")).length ? queue(ready, "ownerRole") : ["- Không có issue Ready không bị chặn."]),
    "", "## Chờ review", "", ...((queue(review, "reviewerRole")).length ? queue(review, "reviewerRole") : ["- Không có issue chờ review."]),
    "", "## Ready to Deliver", "", ...((queue(readyToDeliver, "ownerRole")).length ? queue(readyToDeliver, "ownerRole") : ["- Không có issue Ready to Deliver."]),
    "", "## Delivery Verification", "", ...((queue(deliveryVerification, "ownerRole")).length ? queue(deliveryVerification, "ownerRole") : ["- Không có issue ở Delivery Verification."]),
    "", "## Blocker và quyết định", "",
    ...(blocked.length ? blocked.map((issue) => `- Blocked: ${link(issue.title, issue.url)} — cần ${issue.blocker?.neededFrom ?? "làm rõ người xử lý"}.`) : ["- Không có blocker."]),
    ...(decisions.filter((issue) => issue.logicalState !== "done").length ? decisions.filter((issue) => issue.logicalState !== "done").map((issue) => `- Decision: ${link(issue.title, issue.url)} — owner ${issue.ownerRole ?? "chưa gán"}.`) : ["- Không có quyết định mở."]),
    "", "## Unknown state diagnostics", "", ...(unknown.length ? unknown.map((issue) => `- ${link(issue.title, issue.url)} — physical status ${issue.observedStatus}.`) : ["- Không có unknown issue state."]),
    ...(missingPriority.length ? missingPriority.map((issue) => `- ${link(issue.title, issue.url)} — missing or legacy-none priority; excluded from next-action ranking.`) : []),
    "", "## Stale handoffs", "", ...(staleHandoffs.length ? staleHandoffs.map((issue) => `- ${link(issue.title, issue.url)} — latest handoff is stale and was not used for logical state.`) : ["- Không có stale handoff."]),
    "", "## Terminal mismatches", "", ...(terminalMismatches.length ? terminalMismatches.map((issue) => `- Terminal mismatch: ${link(issue.title, issue.url)} — physical Done lacks validated mode-specific terminal evidence.`) : ["- Không có terminal mismatch."]),
    "", "## Recent completions", "", ...(recentCompletions.length ? recentCompletions.map((issue) => `- ${link(issue.title, issue.url)} — completed ${issue.completedAt}.`) : ["- Không có recent completion timestamp."]),
    "", "## Hành động tiếp theo", "", ...(nextActions.length ? nextActions : ["- Làm rõ Refinement, tháo blocker hoặc để CPO quyết định outcome tiếp theo."]),
    "",
  ].join("\n");
}

function buildNextActions({ issues, ready, review, readyToDeliver, deliveryVerification, lifecycle, projectStatus, milestoneByKey, asOf }) {
  const actions = [];
  if (lifecycle.recommendedCategory && lifecycle.recommendedCategory !== projectStatus.category) {
    actions.push(lifecycle.safeTransition
      ? `- Project lead/CPO: xác nhận hoặc áp dụng chuyển Project sang ${lifecycle.recommendedName}.`
      : `- CPO: quyết định có reopen Project sang ${lifecycle.recommendedName} hay đóng/cancel phần work còn mở.`);
  } else if (lifecycle.code === "continuous-needs-outcome") {
    actions.push("- CPO: chọn outcome và milestone tiếp theo; giữ Project ở In Progress.");
  }
  const candidates = [...readyToDeliver, ...deliveryVerification, ...review, ...ready]
    .filter((issue) => issue.priority && issue.priority !== "none")
    .sort((left, right) => compareIssues(left, right, issues, milestoneByKey, asOf));
  for (const issue of candidates) {
    const action = {
      "ready-to-deliver": `- ${issue.ownerRole ?? "Owner"}: perform authorized delivery for ${link(issue.title, issue.url)}.`,
      "delivery-verification": `- ${issue.reviewerRole ?? issue.ownerRole ?? "Verifier"}: verify terminal evidence for ${link(issue.title, issue.url)}.`,
      "in-review": `- ${issue.reviewerRole ?? "Reviewer"}: review ${link(issue.title, issue.url)}.`,
      ready: `- ${issue.ownerRole ?? "Owner"}: thực hiện ${link(issue.title, issue.url)}.`,
    }[issue.logicalState];
    if (action) actions.push(action);
    if (actions.length === 5) break;
  }
  return actions.slice(0, 5);
}

function compareIssues(left, right, issues, milestoneByKey, asOf) {
  const stateRank = new Map([["ready-to-deliver", 0], ["delivery-verification", 1], ["in-review", 2], ["ready", 3], ["blocked", 4], ["refinement", 5]]);
  const blockedImpact = (issue) => issues.filter((candidate) => (candidate.relations?.blockedByKeys ?? candidate.blockedByKeys ?? []).includes(issue.key)).length;
  const overdue = (issue) => issue.dueDate && new Date(issue.dueDate) < asOf ? 0 : 1;
  const committedCycle = (issue) => issue.cycleName || issue.cycleId ? 0 : 1;
  const leftTuple = [stateRank.get(left.logicalState) ?? 9, -blockedImpact(left), PRIORITY.get(left.priority) ?? 9, overdue(left), left.dueDate ?? "9999", milestoneByKey.get(left.milestoneKey)?.targetDate ?? "9999", committedCycle(left), left.cycleName ?? left.cycleId ?? "", left.key ?? left.id ?? ""];
  const rightTuple = [stateRank.get(right.logicalState) ?? 9, -blockedImpact(right), PRIORITY.get(right.priority) ?? 9, overdue(right), right.dueDate ?? "9999", milestoneByKey.get(right.milestoneKey)?.targetDate ?? "9999", committedCycle(right), right.cycleName ?? right.cycleId ?? "", right.key ?? right.id ?? ""];
  for (let index = 0; index < leftTuple.length; index += 1) {
    const comparison = typeof leftTuple[index] === "number" ? leftTuple[index] - rightTuple[index] : String(leftTuple[index]).localeCompare(String(rightTuple[index]));
    if (comparison !== 0) return comparison;
  }
  return 0;
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
