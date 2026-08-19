const NEW_ISSUE_PRIORITIES = new Set(["urgent", "high", "normal", "low"]);

export function validatePlanningStructure(plan) {
  const errors = [];
  const issues = Array.isArray(plan?.issues) ? plan.issues : [];

  if (plan?.planningStage === "goal-structure") {
    if (issues.some((issue) => issue?.type === "task")) errors.push("goal-structure must not contain execution tasks");
  } else if (plan?.planningStage === "outcome-decomposition") {
    if (typeof plan.sourceOutcomeKey !== "string" || !plan.sourceOutcomeKey) {
      errors.push("outcome-decomposition requires sourceOutcomeKey");
    } else {
      const source = issues.find((issue) => issue?.key === plan.sourceOutcomeKey);
      if (!source || source.type !== "outcome") errors.push("sourceOutcomeKey must reference the source outcome in the plan");
      for (const issue of issues) {
        if (issue?.key === plan.sourceOutcomeKey) continue;
        if (!new Set(["task", "decision"]).has(issue?.type)) {
          errors.push(`outcome-decomposition issue ${issue?.key ?? "unknown"} must be a task or decision`);
        }
        if (issue?.parentKey !== plan.sourceOutcomeKey) {
          errors.push(`outcome-decomposition issue ${issue?.key ?? "unknown"} must be a direct child of ${plan.sourceOutcomeKey}`);
        }
      }
    }
  } else {
    errors.push("planningStage must be goal-structure or outcome-decomposition");
  }

  return [...new Set(errors)];
}

export function resolveNewIssuePriority({ explicitPriority, parentPriority } = {}) {
  if (explicitPriority !== undefined) {
    assertPriority(explicitPriority);
    return { priority: explicitPriority, source: "explicit" };
  }
  if (parentPriority !== undefined) {
    assertPriority(parentPriority);
    return { priority: parentPriority, source: "inherited" };
  }
  return { priority: "normal", source: "policy-default" };
}

export function buildParallelWaves(items) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  const byKey = new Map();
  for (const item of items) {
    if (!item || typeof item.key !== "string" || !item.key) throw new Error("every item requires a key");
    if (byKey.has(item.key)) throw new Error(`duplicate item key ${item.key}`);
    byKey.set(item.key, new Set(item.blockedByKeys ?? []));
  }
  for (const [key, dependencies] of byKey) {
    for (const dependency of dependencies) {
      if (!byKey.has(dependency)) throw new Error(`${key} references unknown dependency ${dependency}`);
      if (dependency === key) throw new Error(`dependency cycle: ${key} -> ${key}`);
    }
  }

  const remaining = new Set(byKey.keys());
  const completed = new Set();
  const waves = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((key) => [...byKey.get(key)].every((dependency) => completed.has(dependency)))
      .sort();
    if (ready.length === 0) throw new Error(`dependency cycle: ${[...remaining].sort().join(", ")}`);
    waves.push(ready);
    ready.forEach((key) => {
      remaining.delete(key);
      completed.add(key);
    });
  }
  return waves;
}

function assertPriority(value) {
  if (!NEW_ISSUE_PRIORITIES.has(value)) throw new Error("priority must be urgent, high, normal, or low");
}
