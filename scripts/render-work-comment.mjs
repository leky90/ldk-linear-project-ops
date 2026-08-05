#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { parseCli, readJson, renderWorkComment, validateProjectBinding } from "./lib.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { positional, flags } = parseCli(process.argv.slice(2));
  if (positional.length !== 1) {
    process.stderr.write("Usage: render-work-comment.mjs <handoff.json> [--binding <binding.json>]\n");
    process.exit(2);
  }
  try {
    const binding = typeof flags.get("binding") === "string" ? await readJson(flags.get("binding")) : undefined;
    const bindingErrors = binding ? validateProjectBinding(binding) : [];
    if (bindingErrors.length) throw new Error(`invalid binding: ${bindingErrors.join("; ")}`);
    process.stdout.write(`${renderWorkComment(await readJson(positional[0]), { roles: binding?.workflow?.roles })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
