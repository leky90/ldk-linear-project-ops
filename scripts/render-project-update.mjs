#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { readJson, renderProjectUpdate } from "./lib.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) {
    process.stderr.write("Usage: render-project-update.mjs <update.json>\n");
    process.exit(2);
  }
  try {
    process.stdout.write(`${renderProjectUpdate(await readJson(process.argv[2]))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
