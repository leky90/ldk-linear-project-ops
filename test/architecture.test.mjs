import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("plugin binding is canonical and contains no credential fields", async () => {
  const binding = JSON.parse(await readFile(join(root, ".ldk-linear-project.json"), "utf8"));
  assert.equal(binding.schemaVersion, 1);
  assert.equal(binding.project.linearProjectId, "98a2bdf1-f648-4ba0-8de6-d37480b5daac");
  assert.equal(binding.project.linearTeamId, "8dee37c7-a36e-4e19-8e42-d88b8b72f663");
  assert.equal(binding.coordination.mode, "atomic-local-lease");
  assert.equal(binding.coordination.claimCommand, "node claim-lock/cli.mjs");
  assert.doesNotMatch(JSON.stringify(binding), /api.?key|password|credential|access.?token/iu);
});

test("legacy ldk-agent implementation and plan schema are absent", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.deepEqual(packageJson.bin, { "ldk-claim-lock": "./claim-lock/cli.mjs" });
  for (const path of [
    "src/cli.mjs",
    "src/plan.mjs",
    "src/workflow.mjs",
    "src/linear-client.mjs",
    "examples/plan.example.json",
    "config/linear.json",
  ]) {
    await assert.rejects(access(join(root, path)));
  }
});

test("local lock implementation has no Linear transport", async () => {
  const sources = await Promise.all([
    readFile(join(root, "claim-lock", "cli.mjs"), "utf8"),
    readFile(join(root, "claim-lock", "store.mjs"), "utf8"),
  ]);
  assert.doesNotMatch(
    sources.join("\n"),
    /LINEAR_API_KEY|api\.linear|graphql|fetch\(|createIssue|updateIssue/iu,
  );
});
