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
    return wrap(attributes, "This repository is bound to one Linear project. For normal work, use $linear-do-issue: resolve the current role from issue state, perform that role's work, then hand off with one human-readable comment.");
  }
  if (name === "UserPromptSubmit") {
    const prompt = String(payload.prompt ?? payload.userPrompt ?? "");
    if (/(?:hòa giải|hoà giải|reconcile|recover.*lock|sửa trạng thái.*sai)/iu.test(prompt)) return wrap(attributes, "Use $linear-reconcile only for the named inconsistency; normal issue work belongs to $linear-do-issue.");
    if (/(?:báo cáo|tổng quan|tiến độ|project status|status report)/iu.test(prompt)) return wrap(attributes, "Use $linear-project-status for an evidence-based, role-oriented project view. It is read-only.");
    if (/(?:tạo|khởi tạo|capture|brainstorm|prd|product brief|đề xuất).*(?:issue|linear|tính năng|dự án|công việc)|(?:issue|linear).*(?:tạo|khởi tạo)/iu.test(prompt)) return wrap(attributes, "Use $linear-create-work. Draft when the user asks to plan or preview; apply when the user directly asks to create or update Linear.");
    if (/(?:thực hiện|xử lý|làm|review|kiểm thử|kiểm tra).*(?:issue|[A-Z][A-Z0-9]+-\d+)|(?:issue|[A-Z][A-Z0-9]+-\d+).*(?:thực hiện|xử lý|làm|review|kiểm thử|kiểm tra)/iu.test(prompt)) return wrap(attributes, "Use $linear-do-issue. Read the issue, resources, role labels, DoR/DoD, state and dependencies; acquire the internal lock; perform exactly the current role phase; publish one handoff/review/blocked comment; update state and role; release the lock.");
    return "";
  }
  const toolName = String(payload.tool_name ?? payload.toolName ?? "");
  if (name === "PreToolUse" && isMutation(toolName)) return wrap(attributes, "Before mutating Linear, verify exact project/team IDs and the issue's current role, state, DoR, DoD, resources and dependencies. Do not publish lock tokens, run IDs, heartbeats, local paths or raw JSON as comments.");
  if (name === "PostToolUse" && isMutation(toolName)) return wrap(attributes, "Re-read each affected Linear entity. Confirm the human comment, resource links, role label and workflow state represent the actual result.");
  if (name === "Stop") return wrap(attributes, "If issue work occurred, leave at most one human-readable handoff, review, blocked or reconciliation comment; release the internal file lock. Software engineers must account for scoped Git changes before In Review; QA reviews immutable commit/PR/test evidence and does not reuse the engineer worktree.");
  return "";
}

function isMutation(toolName) {
  return /(?:create|update|delete|archive|assign|comment|relation|label|milestone|resource)/iu.test(toolName);
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
