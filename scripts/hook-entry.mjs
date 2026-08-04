#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";

const event = process.argv[2];
let input = "";
for await (const chunk of process.stdin) input += chunk;

try {
  const payload = input ? JSON.parse(input) : {};
  const cwd = payload.cwd || process.cwd();
  const binding = await findBinding(cwd);
  if (!binding) process.exit(0);
  const output = handle(event, payload, binding);
  if (output) process.stdout.write(output);
} catch {
  process.exit(0);
}

function handle(name, payload, binding) {
  const attributes = `project_id="${escapeXml(binding.projectId)}" team_id="${escapeXml(binding.teamId)}"`;
  if (name === "SessionStart") {
    return wrap(attributes, "This repository is bound to one immutable Linear project. Load $linear-project-context before Linear work; never select a project by name.");
  }
  if (name === "UserPromptSubmit") {
    const prompt = String(payload.prompt ?? payload.userPrompt ?? "");
    if (!/(?:linear|milestone|issue|task|brainstorm|feature|goal|mục tiêu|công việc|kế hoạch|tính năng)/iu.test(prompt)) return "";
    return wrap(attributes, "For planning or brainstorming, draft with $linear-capture-brainstorm and do not mutate Linear until explicit approval. For execution, require a verified claim.");
  }
  const toolName = String(payload.tool_name ?? payload.toolName ?? "");
  if (name === "PreToolUse" && isMutation(toolName)) {
    return wrap(attributes, "Before this Linear mutation, verify exact project/team IDs, current state, approval authority, stable key, resource conflicts, and absence of secrets.");
  }
  if (name === "PostToolUse" && isMutation(toolName)) {
    return wrap(attributes, "Re-read every affected Linear entity now. Report actual created, updated, skipped, conflicted, and failed results.");
  }
  if (name === "Stop") {
    return wrap(attributes, "If Linear work occurred, release or preserve the claim explicitly, attach evidence, reconcile parent/child state, and summarize remaining work.");
  }
  return "";
}

function isMutation(toolName) {
  return /(?:create|update|delete|archive|assign|comment|relation|label|milestone|resource)/iu.test(toolName);
}

async function findBinding(start) {
  let current = start;
  const root = parse(current).root;
  while (true) {
    for (const relative of [".linear-project-ops.json"]) {
      try {
        const raw = JSON.parse(await readFile(join(current, relative), "utf8"));
        const projectId = raw.project?.linearProjectId ?? raw.linear?.projectId;
        const teamId = raw.project?.linearTeamId ?? raw.linear?.teamId;
        if (isConcreteId(projectId) && isConcreteId(teamId)) {
          return { projectId: String(projectId), teamId: String(teamId) };
        }
      } catch {
        // Continue discovery; hooks fail open.
      }
    }
    if (current === root) return null;
    current = dirname(current);
  }
}

function isConcreteId(value) {
  return typeof value === "string" && value.trim().length > 0
    && !/^(?:replace-with-|example-)/u.test(value.trim());
}

function wrap(attributes, message) {
  return `<ldk-linear-project-ops ${attributes}>\n${message}\n</ldk-linear-project-ops>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
