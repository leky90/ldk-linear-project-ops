#!/usr/bin/env node
import {
  parseCli,
  readJson,
  validateHandoff,
  validateHandoffAgainstIssue,
  validateProjectBinding,
} from "./lib.mjs";
import { validateLiveGitDelivery } from "./git-delivery-state.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
if (positional.length !== 1) {
  process.stderr.write("Usage: validate-handoff.mjs <handoff.json> [--binding <binding.json>] [--current-issue <snapshot.json> --for-mutation] [--baseline <baseline.json> --repository <path>]\n");
  process.exit(2);
}

try {
  const handoff = await readJson(positional[0]);
  const binding = typeof flags.get("binding") === "string" ? await readJson(flags.get("binding")) : undefined;
  const baseline = typeof flags.get("baseline") === "string" ? await readJson(flags.get("baseline")) : undefined;
  const currentIssue = typeof flags.get("current-issue") === "string" ? await readJson(flags.get("current-issue")) : undefined;
  const errors = [
    ...(binding ? validateProjectBinding(binding).map((error) => `binding: ${error}`) : []),
    ...validateHandoff(handoff, { roles: binding?.workflow?.roles }),
  ];
  if (flags.has("for-mutation")) {
    if (!currentIssue) errors.push("live-state: --current-issue is required for mutation validation");
    else errors.push(...validateHandoffAgainstIssue(handoff, currentIssue).map((error) => `live-state: ${error}`));
  }
  let git;
  if (handoff.software) {
    if (!baseline) {
      errors.push("git: --baseline is required for a software handoff");
    } else {
      git = await validateLiveGitDelivery({
        evidence: handoff,
        baseline,
        repository: typeof flags.get("repository") === "string" ? flags.get("repository") : ".",
        worktreeIsolation: "required",
      });
      errors.push(...git.errors.map((error) => `git: ${error}`));
    }
  }
  process.stdout.write(`${JSON.stringify({ valid: errors.length === 0, git: git?.summary, errors: [...new Set(errors)] }, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
