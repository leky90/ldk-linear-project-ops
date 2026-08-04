#!/usr/bin/env node
import { stableKey } from "./lib.mjs";

const parts = process.argv.slice(2);
if (!parts.length) {
  process.stderr.write("Usage: stable-key.mjs <project> <entity title> [...]\n");
  process.exit(2);
}
process.stdout.write(`${stableKey(parts)}\n`);
