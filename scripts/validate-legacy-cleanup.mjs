#!/usr/bin/env node
import { parseCli, readJson, validateLegacyCleanupPlan, validateProjectBinding } from "./lib.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
if (positional.length !== 1) {
  process.stderr.write("Usage: validate-legacy-cleanup.mjs <plan.json> [--binding <binding.json>] [--apply]\n");
  process.exit(2);
}

try {
  const plan = await readJson(positional[0]);
  const binding = typeof flags.get("binding") === "string" ? await readJson(flags.get("binding")) : undefined;
  const errors = [
    ...(binding ? validateProjectBinding(binding).map((error) => `binding: ${error}`) : []),
    ...validateLegacyCleanupPlan(plan, { projectId: binding?.project?.linearProjectId, forApply: flags.has("apply") }),
  ];
  process.stdout.write(`${JSON.stringify({ valid: errors.length === 0, errors: [...new Set(errors)] }, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
