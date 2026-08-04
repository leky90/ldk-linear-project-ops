import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateProjectBinding } from "../scripts/lib.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("repository is the canonical reusable plugin source", async () => {
  const manifest = JSON.parse(await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8"));
  const claudeManifest = JSON.parse(await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8"));
  const claudeMarketplace = JSON.parse(await readFile(join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(manifest.name, "ldk-linear-project-ops");
  assert.equal(claudeManifest.name, manifest.name);
  assert.equal(packageJson.name, manifest.name);
  assert.equal(manifest.version.split("+")[0], packageJson.version);
  assert.equal(claudeManifest.version, packageJson.version);
  assert.equal(claudeMarketplace.name, "ldk-linear-project-ops-local");
  assert.deepEqual(claudeMarketplace.plugins.map(({ name, source, version }) => ({ name, source, version })), [{
    name: manifest.name,
    source: "./",
    version: packageJson.version,
  }]);
  assert.deepEqual(packageJson.bin, { "linear-claim-lock": "./scripts/claim-lock/cli.mjs" });
  for (const required of ["skills", "references", "schemas", "scripts", "assets", "examples", "tests", "hooks/hooks.json"]) {
    await access(join(root, required));
  }
});

test("source repository contains no live project binding", async () => {
  for (const relative of [
    ".linear-project-ops.json",
    ".ldk-linear-project.json",
    "config/linear.json",
    ".state/claims.sqlite",
    ".linear-ops/claims.sqlite",
  ]) {
    await assert.rejects(access(join(root, relative)));
  }

  const example = JSON.parse(await readFile(join(root, "examples", "project-binding.example.json"), "utf8"));
  assert.deepEqual(validateProjectBinding(example, { allowPlaceholders: true }), []);
  assert.match(validateProjectBinding(example).join("\n"), /placeholder/u);
});

test("plugin source excludes the former LDKTech operations binding", async () => {
  const files = await listSourceFiles(root);
  const content = (await Promise.all(files.map((path) => readFile(path, "utf8")))).join("\n");
  const packageFiles = files.filter((path) => !path.includes(`${join(root, "test")}/`) && !path.includes(`${join(root, "tests")}/`));
  const packageContent = (await Promise.all(packageFiles.map((path) => readFile(path, "utf8")))).join("\n");
  const formerProjectId = ["98a2bdf1", "f648", "4ba0", "8de6", "d37480b5daac"].join("-");
  const formerTeamId = ["8dee37c7", "a36e", "4e19", "8e42", "d88b8b72f663"].join("-");
  assert.equal(content.includes(formerProjectId), false);
  assert.equal(content.includes(formerTeamId), false);
  const formerProjectName = ["LDKTech Solutions", "Agent Operations"].join(" — ");
  assert.equal(content.includes(formerProjectName), false);
  assert.doesNotMatch(packageContent, /\blin_api_[A-Za-z0-9_-]{8,}\b/u);
});

async function listSourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".codegraph", ".state", ".linear-ops", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(path));
    else files.push(path);
  }
  return files;
}

test("packaged local lock has no Linear transport", async () => {
  const sources = await Promise.all([
    readFile(join(root, "scripts", "claim-lock", "cli.mjs"), "utf8"),
    readFile(join(root, "scripts", "claim-lock", "store.mjs"), "utf8"),
  ]);
  assert.doesNotMatch(
    sources.join("\n"),
    /LINEAR_API_KEY|api\.linear|graphql|fetch\(|createIssue|updateIssue/iu,
  );
});
