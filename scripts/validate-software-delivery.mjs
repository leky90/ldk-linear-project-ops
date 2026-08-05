#!/usr/bin/env node
import {
  parseCli,
  readJson,
  resolveSoftwareDeliveryPolicy,
  validateProjectBinding,
  validateSoftwareDelivery,
} from "./lib.mjs";
import { validateLiveGitDelivery } from "./git-delivery-state.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
if (positional.length !== 1 || typeof flags.get("target") !== "string") {
  process.stderr.write("Usage: validate-software-delivery.mjs <evidence.json> --target child-done|in-review|done --baseline <baseline.json> [--binding <binding.json>] [--repository <path>]\n");
  process.exit(2);
}

try {
  const evidence = await readJson(positional[0]);
  const bindingPath = flags.get("binding");
  const binding = typeof bindingPath === "string" ? await readJson(bindingPath) : undefined;
  const baselinePath = flags.get("baseline");
  const baseline = typeof baselinePath === "string" ? await readJson(baselinePath) : undefined;
  const bindingErrors = binding ? validateProjectBinding(binding) : [];
  const policy = resolveSoftwareDeliveryPolicy(binding);
  const liveGit = baseline
    ? await validateLiveGitDelivery({
      evidence,
      baseline,
      repository: typeof flags.get("repository") === "string" ? flags.get("repository") : ".",
      worktreeIsolation: policy.worktreeIsolation,
    })
    : {
      errors: ["--baseline is required for software delivery validation"],
      summary: { baselineRecorded: false, isolationSatisfied: false, scopeClean: false },
    };
  const errors = [
    ...bindingErrors.map((error) => `binding: ${error}`),
    ...liveGit.errors.map((error) => `git: ${error}`),
    ...validateSoftwareDelivery(evidence, { target: flags.get("target"), binding, gitValidation: liveGit.summary }),
  ];
  process.stdout.write(`${JSON.stringify({
    valid: errors.length === 0,
    target: flags.get("target"),
    policy,
    git: liveGit.summary,
    errors: [...new Set(errors)],
  }, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
