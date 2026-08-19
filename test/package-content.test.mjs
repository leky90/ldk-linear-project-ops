import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { stagePlugin } from "../scripts/stage-plugin.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("runtime staging contains one shared bundle and exactly four public skills", async () => {
  const destination = await mkdtemp(join(tmpdir(), "roleflow-plugin-stage-"));
  await stagePlugin({ root, destination });
  const files = (await listFiles(destination)).map((path) => relative(destination, path));
  const skills = files.filter((path) => path.endsWith("SKILL.md"));
  assert.deepEqual(skills.sort(), [
    "skills/linear-create-work/SKILL.md",
    "skills/linear-do-issue/SKILL.md",
    "skills/linear-project-status/SKILL.md",
    "skills/linear-reconcile/SKILL.md",
  ]);
  for (const shared of [
    "references/decomposition-policy.md",
    "references/execution-profiles.md",
    "schemas/work-plan.schema.json",
    "scripts/delivery-lifecycle.mjs",
  ]) assert.ok(files.includes(shared), `${shared} must be staged once`);
  assert.equal(files.some((path) => /^skills\/[^/]+\/(?:references|schemas|scripts|skills)\//u.test(path)), false);
  assert.equal(files.some((path) => /(?:^|\/)(?:\.git|\.codegraph|test|tests|fixtures|evals|docs)(?:\/|$)/u.test(path)), false);
});

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else files.push(path);
  }
  return files;
}
