import assert from "node:assert/strict";
import test from "node:test";

import { createLinearClient } from "../src/index.mjs";

test("project issue query omits the status filter instead of comparing it with null", async () => {
  const requests = [];
  const client = createLinearClient({ apiKey: "runtime-only", fetchImpl: fakeFetch(requests) });
  await client.listProjectIssues({ teamId: "team-new", projectId: "project-new" });
  assert.doesNotMatch(requests[0].query, /state:\s*\{/u);
  assert.deepEqual(requests[0].variables, { teamId: "team-new", projectId: "project-new" });
});

test("ready issue query is pinned to team, project, and status", async () => {
  const requests = [];
  const client = createLinearClient({ apiKey: "runtime-only", fetchImpl: fakeFetch(requests) });
  await client.listReadyIssues({ teamId: "team-new", projectId: "project-new", statusId: "ready-new" });
  assert.match(requests[0].query, /team:\s*\{ id: \{ eq: \$teamId \} \}/u);
  assert.match(requests[0].query, /project:\s*\{ id: \{ eq: \$projectId \} \}/u);
  assert.match(requests[0].query, /state:\s*\{ id: \{ eq: \$statusId \} \}/u);
  assert.deepEqual(requests[0].variables, {
    teamId: "team-new",
    projectId: "project-new",
    statusId: "ready-new",
  });
});

function fakeFetch(requests) {
  return async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      async json() {
        return { data: { issues: { nodes: [] } } };
      },
    };
  };
}
