#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { pathToFileURL } from "node:url";

import { classifyLinearOperation } from "./linear-tool-mapping.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.argv[2];
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  try {
    const payload = input ? JSON.parse(input) : {};
    const bindings = await findBindings(payload.cwd || process.cwd());
    const output = handle(event, payload, bindings);
    if (output) process.stdout.write(output);
  } catch {
    process.exit(0);
  }
}

export function handle(name, payload, bindings) {
  const binding = bindings.linear;
  if (name === "UserPromptSubmit") {
    const prompt = String(payload.prompt ?? payload.userPrompt ?? "");
    const intent = resolveIntent(prompt);
    if (!intent) return "";
    const route = classifyTracker(prompt, bindings);
    if (route === "github") return "";
    if (route === "ambiguous") {
      // When both plugins are bound, the GitHub hook emits the single shared
      // ambiguity notice so the host does not show duplicate router messages.
      if (bindings.github) return "";
      return wrapRouter("Both Linear and GitHub are in scope. Ask the owner to define an explicit cross-tracker source, destination, mapping, and write scope. Do not mutate either tracker yet.");
    }
    if (route !== "linear") return "";
    if (!binding) return wrap('binding="missing"', `Use $${intent.skill} for read-only Linear target discovery. Produce an exact .linear-project-ops.json preview and do not infer a Project from GitHub, a similar title, or stale context. Apply only after the Project/team boundary is unambiguous and setup writes are authorized.`);
    return routeIntent(intent, binding);
  }
  if (!binding) return "";
  const attributes = `project_id="${escapeXml(binding.projectId)}" team_id="${escapeXml(binding.teamId)}"`;
  if (name === "SessionStart") {
    return wrap(attributes, `This repository is bound to one Linear project${bindings.github ? " and also has a GitHub binding; explicit tracker signals win and generic tracker work must be clarified" : ""}. Preserve native Initiative → Project → Milestone → Issue hierarchy. For normal work, use $linear-do-issue: resolve the current role from issue state, perform one role phase, then hand off with one human-readable comment.`);
  }
  const toolName = String(payload.tool_name ?? payload.toolName ?? "");
  const operation = classifyLinearOperation(toolName);
  if ((name === "PreToolUse" || name === "PostToolUse") && operation === "unknown") return wrap(attributes, "Unknown Linear tool operation. Treat this as a capability warning, read the tool contract, and do not mutate until its operation class is explicit.");
  if (name === "PreToolUse" && operation === "mutation") return wrap(attributes, "Before mutating Linear, verify exact project/team IDs, native hierarchy, live Project and issue status IDs, lifecycle policy, planning properties, current role/state/DoR/DoD, delivery mode/phase/authority, resources and relations. Read the live state of blocker endpoints; do not treat a resolved dependency as an open blocker. For deletion, require an exact approved entity ID and a verified canonical destination when preserving content. Do not publish machine telemetry or raw JSON.");
  if (name === "PostToolUse" && operation === "mutation") return wrap(attributes, "Re-read each affected Linear entity and both ends of every changed relation. Confirm Project lifecycle consistency, issue delivery phase and terminal evidence, native hierarchy, project/milestone properties, resources, relations, human handoff or native Project Update match the actual result; report every skipped, conflicted, failed, and deleted entity. Never infer Project Completed only from queue completion or issue Done only from a role handoff.");
  if (name === "Stop") return wrap(attributes, "If issue work occurred, leave at most one human-readable handoff, review, blocked or reconciliation comment; release the internal file lock. Record delivery mode and phase. Software engineers must account for scoped Git changes before In Review; QA reviews immutable commit/PR/test evidence and does not reuse the engineer worktree. A QA pass for software-merge is merge-ready, not Done.");
  return "";
}

function resolveIntent(prompt) {
  if (/(?:đồng bộ|sync|map|mirror|migrate|di chuyển).*(?:github).*(?:linear)|(?:đồng bộ|sync|map|mirror|migrate|di chuyển).*(?:linear).*(?:github)/iu.test(prompt)) return { kind: "cross-tracker", skill: "linear-create-work" };
  if (/(?:hòa giải|hoà giải|reconcile|recover.*lock|sửa trạng thái.*sai|legacy.*(?:audit|cleanup|purge)|(?:audit|cleanup|purge).*legacy|migrate.*flow|dọn.*(?:issue|comment))/iu.test(prompt)) return { kind: "reconcile", skill: "linear-reconcile" };
  if (/(?:báo cáo|tổng quan|tiến độ|project status|status report|project update|cập nhật.*health|đổi.*trạng thái.*project|sửa.*project.*status|on track|at risk|off track)/iu.test(prompt)) return { kind: "status", skill: "linear-project-status" };
  const hasIssueId = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/u.test(prompt);
  if (hasIssueId && /(?:fix|work\s+on|execute|implement|review|test|verify|thực hiện|xử lý|làm|kiểm thử|kiểm tra|update\s+(?:the\s+)?issue\s+description|cập nhật\s+mô tả\s+issue)/iu.test(prompt)) return { kind: "execute", skill: "linear-do-issue" };
  if (/(?:tạo|khởi tạo|capture|brainstorm|prd|product brief|đề xuất|lên kế hoạch|phân rã|break\s*down|breakdown|sub-?issues?|views?|board|backlog|roadmap|estimate|ước lượng|chuẩn hóa|đồng bộ|sync|organize|update|cập nhật).*(?:issue|project|linear|tính năng|dự án|công việc|initiative|milestone|roadmap|view|board|backlog|estimate|[A-Z][A-Z0-9]{1,9}-\d+)|(?:issue|project|linear|initiative|milestone|sub-?issues?|views?|board|backlog|roadmap|estimate).*(?:tạo|khởi tạo|phân rã|break\s*down|breakdown|chuẩn hóa|đồng bộ|sync|organize|update|cập nhật)/iu.test(prompt)) return { kind: "create", skill: "linear-create-work" };
  if (/(?:thực hiện|xử lý|làm|review|kiểm thử|kiểm tra).*(?:issue|[A-Z][A-Z0-9]+-\d+)|(?:issue|[A-Z][A-Z0-9]+-\d+).*(?:thực hiện|xử lý|làm|review|kiểm thử|kiểm tra)/iu.test(prompt)) return { kind: "execute", skill: "linear-do-issue" };
  return null;
}

function routeIntent(intent, binding) {
  const attributes = `project_id="${escapeXml(binding.projectId)}" team_id="${escapeXml(binding.teamId)}"`;
  if (intent.kind === "reconcile") return wrap(attributes, "Use $linear-reconcile. Project-wide legacy cleanup must first produce an exact validated preview; delete only individually approved IDs after preserving canonical content and relations.");
  if (intent.kind === "status") return wrap(attributes, "Use $linear-project-status. Read the live Project status ID/category and run lifecycle consistency analysis. Reports are read-only; a direct fix/update request may apply a verified Backlog/Planned → In Progress correction. Never infer Completed from an empty queue. Publish a native Linear Project Update only on a direct publish request.");
  if (intent.kind === "create") return wrap(attributes, "Use $linear-create-work. Use native Initiative → Project → Milestone → Issue hierarchy and issue type outcome; draft when asked to plan or preview, apply on a direct create/update request. Never mirror the plan to GitHub without an explicit cross-tracker mapping and scope.");
  return wrap(attributes, "Use $linear-do-issue. Read the issue and live Project status. Before execution, move a Backlog/Planned Project to the exact live In Progress status ID; stop on Completed/Canceled without explicit reopen authority. Perform exactly the current role phase, publish one human handoff, re-read Project/issue, and never auto-complete the Project from queue completion.");
}

export function classifyTracker(prompt, bindings) {
  const hasGitHubSignal = /(?:\bgithub\b|github\.com|\bgh\s+project\b|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+)/iu.test(prompt);
  const hasLinearSignal = /(?:\blinear\b|linear\.app|\b[A-Z][A-Z0-9]{1,9}-\d+\b)/iu.test(prompt);
  if (hasGitHubSignal && hasLinearSignal) return "ambiguous";
  if (hasGitHubSignal) return "github";
  if (hasLinearSignal) return "linear";
  if (bindings.github && bindings.linear) return "ambiguous";
  if (bindings.linear) return "linear";
  if (bindings.github) return "github";
  return "none";
}

async function findBindings(start) {
  let current = start;
  const root = parse(current).root;
  let github = null;
  let linear = null;
  while (true) {
    linear ??= await readLinearBinding(current);
    github ??= await readGitHubBinding(current);
    if (current === root) return { linear, github };
    current = dirname(current);
  }
}

async function readLinearBinding(directory) {
  try {
    const raw = JSON.parse(await readFile(join(directory, ".linear-project-ops.json"), "utf8"));
    const projectId = raw.project?.linearProjectId ?? raw.linear?.projectId;
    const teamId = raw.project?.linearTeamId ?? raw.linear?.teamId;
    if (isConcreteId(projectId) && isConcreteId(teamId)) return { projectId: String(projectId), teamId: String(teamId) };
  } catch {
    // Binding discovery fails open so host hooks never block unrelated work.
  }
  return null;
}

async function readGitHubBinding(directory) {
  try {
    const raw = JSON.parse(await readFile(join(directory, ".github-project-ops.json"), "utf8"));
    const owner = raw.github?.owner;
    const projectNumber = raw.github?.projectNumber;
    if (typeof owner === "string" && owner && Number.isInteger(projectNumber) && projectNumber > 0) return { owner, projectNumber };
  } catch {
    // A peer binding is advisory routing context only.
  }
  return null;
}

function isConcreteId(value) {
  return typeof value === "string" && value.trim().length > 0 && !/^(?:replace-with-|example-)/u.test(value.trim());
}

function wrap(attributes, message) {
  return `<ldk-linear-project-ops ${attributes}>\n${message}\n</ldk-linear-project-ops>`;
}

function wrapRouter(message) {
  return `<project-ops-router tracker="ambiguous">\n${message}\n</project-ops-router>`;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
