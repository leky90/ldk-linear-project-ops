#!/usr/bin/env node
import {
  parseCli,
  readJson,
  resolveSoftwareDeliveryPolicy,
  validateProjectBinding,
  validateSoftwareDelivery,
} from "./lib.mjs";

const { positional, flags } = parseCli(process.argv.slice(2));
if (positional.length !== 1 || typeof flags.get("target") !== "string") {
  process.stderr.write("Usage: validate-software-delivery.mjs <evidence.json> --target child-done|in-review|done [--binding <binding.json>]\n");
  process.exit(2);
}

try {
  const evidence = await readJson(positional[0]);
  const bindingPath = flags.get("binding");
  const binding = typeof bindingPath === "string" ? await readJson(bindingPath) : undefined;
  const bindingErrors = binding ? validateProjectBinding(binding) : [];
  const errors = bindingErrors.length
    ? bindingErrors.map((error) => `binding: ${error}`)
    : validateSoftwareDelivery(evidence, { target: flags.get("target"), binding });
  process.stdout.write(`${JSON.stringify({
    valid: errors.length === 0,
    target: flags.get("target"),
    policy: resolveSoftwareDeliveryPolicy(binding),
    errors,
  }, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
