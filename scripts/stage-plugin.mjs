#!/usr/bin/env node
import { cp, mkdir, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RUNTIME_ENTRIES = Object.freeze([
  ".claude-plugin",
  ".codex-plugin",
  "assets",
  "examples",
  "hooks",
  "references",
  "schemas",
  "scripts",
  "skills",
  "README.md",
  "package.json",
]);

export async function stagePlugin({ root, destination }) {
  if (typeof root !== "string" || !root) throw new Error("root is required");
  if (typeof destination !== "string" || !destination) throw new Error("destination is required");
  const sourceRoot = resolve(root);
  const targetRoot = resolve(destination);
  if (sourceRoot === targetRoot || targetRoot.startsWith(`${sourceRoot}/`)) throw new Error("staging destination must be outside the source repository");
  await mkdir(targetRoot, { recursive: true, mode: 0o700 });
  if ((await readdir(targetRoot)).length > 0) throw new Error("staging destination must be empty");
  for (const entry of RUNTIME_ENTRIES) {
    await cp(join(sourceRoot, entry), join(targetRoot, basename(entry)), { recursive: true, errorOnExist: true });
  }
  return { destination: targetRoot, entries: [...RUNTIME_ENTRIES] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destination = process.argv[2];
  if (!destination) {
    process.stderr.write("Usage: stage-plugin.mjs <empty-destination-outside-repository>\n");
    process.exitCode = 2;
  } else {
    stagePlugin({ root: new URL("..", import.meta.url).pathname, destination })
      .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
      .catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      });
  }
}
