#!/usr/bin/env node
import { parseCli, readJson, validateProjectBinding, validateProjectUpdate } from "./lib.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
if (positional.length !== 1) {
  process.stderr.write("Usage: validate-project-update.mjs <update.json> [--binding <binding.json>] [--publish]\n");
  process.exit(2);
}

try {
  const update = await readJson(positional[0]);
  const binding = typeof flags.get("binding") === "string" ? await readJson(flags.get("binding")) : undefined;
  const errors = [
    ...(binding ? validateProjectBinding(binding).map((error) => `binding: ${error}`) : []),
    ...validateProjectUpdate(update, { projectId: binding?.project?.linearProjectId, forPublish: flags.has("publish") }),
  ];
  process.stdout.write(`${JSON.stringify({ valid: errors.length === 0, errors: [...new Set(errors)] }, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
