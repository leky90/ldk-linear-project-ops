#!/usr/bin/env node
import { parseCli, readJson, validateProjectBinding } from "./lib.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
if (positional.length !== 1) {
  process.stderr.write("Usage: validate-project-binding.mjs <binding.json> [--allow-placeholders]\n");
  process.exit(2);
}

try {
  const binding = await readJson(positional[0]);
  const errors = validateProjectBinding(binding, {
    allowPlaceholders: flags.has("allow-placeholders"),
  });
  process.stdout.write(`${JSON.stringify({ valid: errors.length === 0, errors }, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
