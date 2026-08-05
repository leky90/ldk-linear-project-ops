#!/usr/bin/env node
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { captureGitBaseline, validateBaselineOutputPath } from "./git-delivery-state.mjs";
import { parseCli } from "./lib.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
if (positional.length !== 1 || typeof flags.get("issue") !== "string") {
  process.stderr.write("Usage: capture-git-baseline.mjs <output.json> --issue <issue-id> [--repository <path>] [--allow-clean-primary]\n");
  process.exit(2);
}

try {
  const output = positional[0];
  await access(output).then(
    () => { throw new Error("baseline output already exists; reuse it instead of replacing it"); },
    (error) => { if (error.code !== "ENOENT") throw error; },
  );
  const repository = typeof flags.get("repository") === "string" ? flags.get("repository") : ".";
  await validateBaselineOutputPath({ repository, output });
  const baseline = await captureGitBaseline({
    repository,
    issueId: flags.get("issue"),
    worktreeIsolation: flags.has("allow-clean-primary") ? "allow-clean-primary" : "required",
  });
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, output);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    baselineId: baseline.baselineId,
    issueId: baseline.issueId,
    branchName: baseline.branchName,
    baselineCommit: baseline.baselineCommit,
    worktreeMode: baseline.worktreeMode,
    output,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
