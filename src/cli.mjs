#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ClaimStore, createAgentWorkflow, createLinearClient, loadConfig, validatePlan } from "./index.mjs";

export async function runCli(argv = process.argv.slice(2), environment = process.env) {
  const { command, options, flags } = parseArguments(argv);
  if (!command || !options.config) throw new Error("Usage requires a command and --config");
  const config = await loadConfig(options.config);
  if (command === "plan-check") {
    const plan = await readJson(options.plan);
    return { ok: true, plan: validatePlan(plan, config, { requireApproved: false }) };
  }
  if (command === "sync" && !flags.has("approve")) {
    throw new Error("sync requires --approve after human review");
  }
  const linear = createLinearClient({ apiKey: environment.LINEAR_API_KEY });
  const store = new ClaimStore({ path: config.claimDatabase });
  const workflow = createAgentWorkflow({ config, linear, claimStore: store });
  try {
    if (command === "sync") return workflow.syncPlan(await readJson(options.plan));
    if (command === "claim") {
      return workflow.claimNext({
        workerId: options.worker,
        capabilities: csv(options.capabilities),
        ...(options["lease-ms"] ? { leaseMs: integer(options["lease-ms"], "lease-ms") } : {}),
      });
    }
    if (command === "heartbeat") {
      return workflow.heartbeat({
        token: options.token,
        ...(options["lease-ms"] ? { leaseMs: integer(options["lease-ms"], "lease-ms") } : {}),
      });
    }
    if (command === "recover") return workflow.recoverExpired();
    if (command === "reconcile") return workflow.reconcileParents();
    if (command === "decompose") {
      return workflow.decompose({ token: options.token, plan: await readJson(options.plan) });
    }
    if (command === "finish") {
      return workflow.finish({
        token: options.token,
        outcome: options.outcome,
        evidence: csv(options.evidence),
        summary: options.summary ?? "",
      });
    }
    throw new Error(`Unknown command: ${command}`);
  } finally {
    store.close();
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const flags = new Set();
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
    const name = item.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) flags.add(name);
    else {
      options[name] = next;
      index += 1;
    }
  }
  return { command, options, flags };
}

async function readJson(path) {
  if (!path) throw new Error("--plan is required");
  return JSON.parse(await readFile(path, "utf8"));
}

function csv(value) {
  return typeof value === "string" && value.length ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function integer(value, name) {
  const selected = Number(value);
  if (!Number.isInteger(selected)) throw new Error(`--${name} must be an integer`);
  return selected;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code ?? "CLI_ERROR", message: error.message } })}\n`);
      process.exitCode = 1;
    });
}
