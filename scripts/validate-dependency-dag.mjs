#!/usr/bin/env node
import { parseCli, readJson, validateDecomposition } from "./lib.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
if (positional.length !== 1) {
  process.stderr.write("Usage: validate-dependency-dag.mjs <decomposition.json> [--project-id ID] [--for-apply]\n");
  process.exit(2);
}

try {
  const data = await readJson(positional[0]);
  const errors = validateDecomposition(data, {
    projectId: flags.get("project-id"),
    forApply: flags.has("for-apply")
  });
  process.stdout.write(`${JSON.stringify({ valid: errors.length === 0, errors }, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
