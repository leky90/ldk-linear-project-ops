#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";

const event = process.argv[2];
let input = "";
for await (const chunk of process.stdin) input += chunk;

try {
  const payload = input ? JSON.parse(input) : {};
  const binding = await findBinding(payload.cwd || process.cwd());
  if (!binding) process.exit(0);
  const output = handle(event, payload, binding);
  if (output) process.stdout.write(output);
} catch {
  process.exit(0);
}

export function handle(name, payload, binding) {
  const attributes = `project_id="${escapeXml(binding.projectId)}" team_id="${escapeXml(binding.teamId)}"`;
  if (name === "SessionStart") {
    return wrap(attributes, "This repository is bound to one Linear project. Preserve native Initiative → Project → Milestone → Issue hierarchy. For normal work, use $linear-do-issue: resolve the current role from issue state, perform one role phase, then hand off with one human-readable comment.");
  }
  if (name === "UserPromptSubmit") {
    const prompt = String(payload.prompt ?? payload.userPrompt ?? "");
    if (/(?:hòa giải|hoà giải|reconcile|recover.*lock|sửa trạng thái.*sai|legacy.*(?:audit|cleanup|purge)|(?:audit|cleanup|purge).*legacy|migrate.*flow|dọn.*(?:issue|comment))/iu.test(prompt)) return wrap(attributes, "Use $linear-reconcile. Project-wide legacy cleanup must first produce an exact validated preview; delete only individually approved IDs after preserving canonical content and relations.");
    if (/(?:báo cáo|tổng quan|tiến độ|project status|status report|project update|cập nhật.*health|đổi.*trạng thái.*project|sửa.*project.*status|on track|at risk|off track)/iu.test(prompt)) return wrap(attributes, "Use $linear-project-status. Read the live Project status ID/category and run lifecycle consistency analysis. Reports are read-only; a direct fix/update request may apply a verified Backlog/Planned → In Progress correction. Never infer Completed from an empty queue. Publish a native Linear Project Update only on a direct publish request.");
    if (/(?:tạo|khởi tạo|capture|brainstorm|prd|product brief|đề xuất).*(?:issue|linear|tính năng|dự án|công việc|initiative|milestone|roadmap)|(?:issue|linear|initiative|milestone).*(?:tạo|khởi tạo)/iu.test(prompt)) return wrap(attributes, "Use $linear-create-work. Use native Initiative → Project → Milestone → Issue hierarchy and issue type outcome; draft when asked to plan or preview, apply on a direct create/update request.");
    if (/(?:thực hiện|xử lý|làm|review|kiểm thử|kiểm tra).*(?:issue|[A-Z][A-Z0-9]+-\d+)|(?:issue|[A-Z][A-Z0-9]+-\d+).*(?:thực hiện|xử lý|làm|review|kiểm thử|kiểm tra)/iu.test(prompt)) return wrap(attributes, "Use $linear-do-issue. Read the issue and live Project status. Before execution, move a Backlog/Planned Project to the exact live In Progress status ID; stop on Completed/Canceled without explicit reopen authority. Perform exactly the current role phase, publish one human handoff, re-read Project/issue, and never auto-complete the Project from queue completion.");
    return "";
  }
  const toolName = String(payload.tool_name ?? payload.toolName ?? "");
  if (name === "PreToolUse" && isMutation(toolName)) return wrap(attributes, "Before mutating Linear, verify exact project/team IDs, native hierarchy, live Project status ID/category, lifecycle policy, planning properties, current role/state/DoR/DoD, resources and relations. For deletion, require an exact approved entity ID and a verified canonical destination when preserving content. Do not publish machine telemetry or raw JSON.");
  if (name === "PostToolUse" && isMutation(toolName)) return wrap(attributes, "Re-read each affected Linear entity. Confirm Project lifecycle consistency, native hierarchy, project/milestone properties, resources, relations, human handoff or native Project Update match the actual result; report every skipped, conflicted, failed, and deleted entity. Never infer Project Completed only from queue completion.");
  if (name === "Stop") return wrap(attributes, "If issue work occurred, leave at most one human-readable handoff, review, blocked or reconciliation comment; release the internal file lock. Software engineers must account for scoped Git changes before In Review; QA reviews immutable commit/PR/test evidence and does not reuse the engineer worktree.");
  return "";
}

function isMutation(toolName) {
  return /(?:create|update|delete|archive|assign|comment|relation|label|milestone|initiative|project|resource)/iu.test(toolName);
}

async function findBinding(start) {
  let current = start;
  const root = parse(current).root;
  while (true) {
    try {
      const raw = JSON.parse(await readFile(join(current, ".linear-project-ops.json"), "utf8"));
      const projectId = raw.project?.linearProjectId ?? raw.linear?.projectId;
      const teamId = raw.project?.linearTeamId ?? raw.linear?.teamId;
      if (isConcreteId(projectId) && isConcreteId(teamId)) return { projectId: String(projectId), teamId: String(teamId) };
    } catch {
      // Binding discovery fails open so host hooks never block unrelated work.
    }
    if (current === root) return null;
    current = dirname(current);
  }
}

function isConcreteId(value) {
  return typeof value === "string" && value.trim().length > 0 && !/^(?:replace-with-|example-)/u.test(value.trim());
}

function wrap(attributes, message) {
  return `<ldk-linear-project-ops ${attributes}>\n${message}\n</ldk-linear-project-ops>`;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
