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

test("sub-issue creation pins the parent and blocker relation points from blocker to blocked issue", async () => {
  const requests = [];
  const client = createLinearClient({ apiKey: "runtime-only", fetchImpl: mutationFetch(requests) });
  const child = await client.createIssue({
    teamId: "team-new",
    projectId: "project-new",
    statusId: "ready-new",
    parentId: "parent-new",
    title: "Child",
    description: "Child description",
  });
  await client.ensureBlockedBy({ issueId: child.id, blockerIssueId: "blocker-new" });
  assert.equal(requests[0].headers["graphql-features"], "sub_issues");
  assert.equal(requests[0].body.variables.input.parentId, "parent-new");
  assert.deepEqual(requests[1].body.variables.input, {
    issueId: "blocker-new",
    relatedIssueId: "child-new",
    type: "blocks",
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

function mutationFetch(requests) {
  return async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ body, headers: options.headers });
    const data = body.query.includes("CreateAgentIssue")
      ? {
          issueCreate: {
            success: true,
            issue: {
              id: "child-new",
              identifier: "OPS-1",
              title: "Child",
              description: "Child description",
              priority: 0,
              team: { id: "team-new" },
              project: { id: "project-new" },
              state: { id: "ready-new" },
              parent: { id: "parent-new" },
            },
          },
        }
      : { issueRelationCreate: { success: true } };
    return { ok: true, status: 200, async json() { return { data }; } };
  };
}
