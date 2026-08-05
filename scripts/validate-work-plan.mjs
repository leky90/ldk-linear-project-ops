#!/usr/bin/env node
import { parseCli, readJson, validateProjectBinding, validateWorkPlan } from "./lib.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
if (positional.length !== 1) {
  process.stderr.write("Usage: validate-work-plan.mjs <plan.json> [--binding <binding.json>] [--apply]\n");
  process.exit(2);
}

try {
  const plan = await readJson(positional[0]);
  const bindingPath = flags.get("binding");
  const binding = typeof bindingPath === "string" ? await readJson(bindingPath) : undefined;
  const bindingErrors = binding ? validateProjectBinding(binding) : [];
  const errors = [
    ...bindingErrors.map((error) => `binding: ${error}`),
    ...validateWorkPlan(plan, {
      projectId: binding?.project?.linearProjectId,
      teamId: binding?.project?.linearTeamId,
      roles: binding?.workflow?.roles,
      forApply: flags.has("apply"),
    }),
  ];
  process.stdout.write(`${JSON.stringify({ valid: errors.length === 0, errors: [...new Set(errors)] }, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
