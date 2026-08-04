import { AgentWorkflowError } from "./errors.mjs";

const DEFAULT_ENDPOINT = "https://api.linear.app/graphql";

export function createLinearClient({ apiKey, endpoint = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new AgentWorkflowError("LINEAR_API_KEY_REQUIRED", "LINEAR_API_KEY is required at runtime");
  }
  if (typeof fetchImpl !== "function") throw new AgentWorkflowError("LINEAR_CLIENT_INVALID", "fetch is required");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname))) {
    throw new AgentWorkflowError("LINEAR_ENDPOINT_INVALID", "Linear endpoint must use HTTPS");
  }

  return {
    async listProjectIssues({ teamId, projectId }) {
      return readIssues({ teamId, projectId });
    },

    async listReadyIssues({ teamId, projectId, statusId }) {
      return readIssues({ teamId, projectId, statusId });
    },

    async createIssue({ teamId, projectId, statusId, title, description, priority }) {
      const data = await graphql(
        `mutation CreateAgentIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier url title description priority team { id } project { id } state { id } } }
        }`,
        { input: { teamId, projectId, stateId: statusId, title, description, ...(priority !== undefined ? { priority } : {}) } },
      );
      if (!data.issueCreate?.success) throw new AgentWorkflowError("LINEAR_MUTATION_FAILED", "Linear did not create the issue");
      return normalizeIssue(data.issueCreate.issue);
    },

    async updateIssueState({ issueId, statusId }) {
      const data = await graphql(
        `mutation UpdateAgentIssueState($issueId: String!, $statusId: String!) {
          issueUpdate(id: $issueId, input: { stateId: $statusId }) { success }
        }`,
        { issueId, statusId },
      );
      if (!data.issueUpdate?.success) throw new AgentWorkflowError("LINEAR_MUTATION_FAILED", "Linear did not update issue state");
    },

    async createRunComment({ issueId, body }) {
      const data = await graphql(
        `mutation CreateAgentRunComment($input: CommentCreateInput!) {
          commentCreate(input: $input) { success comment { id body } }
        }`,
        { input: { issueId, body } },
      );
      if (!data.commentCreate?.success) throw new AgentWorkflowError("LINEAR_MUTATION_FAILED", "Linear did not create run comment");
      return data.commentCreate.comment;
    },

    async updateRunComment({ commentId, body }) {
      const data = await graphql(
        `mutation UpdateAgentRunComment($commentId: String!, $body: String!) {
          commentUpdate(id: $commentId, input: { body: $body }) { success }
        }`,
        { commentId, body },
      );
      if (!data.commentUpdate?.success) throw new AgentWorkflowError("LINEAR_MUTATION_FAILED", "Linear did not update run comment");
    },
  };

  async function readIssues({ teamId, projectId, statusId }) {
    const withStatus = typeof statusId === "string" && statusId.length > 0;
    const data = await graphql(
      withStatus
        ? `query AgentReadyIssues($teamId: ID!, $projectId: ID!, $statusId: ID!) {
        issues(first: 250, filter: {
          team: { id: { eq: $teamId } },
          project: { id: { eq: $projectId } },
          state: { id: { eq: $statusId } }
        }) {
          nodes {
            id identifier url title description priority
            team { id }
            project { id }
            state { id }
            relations { nodes { type relatedIssue { id state { type } } } }
          }
        }
      }`
        : `query AgentProjectIssues($teamId: ID!, $projectId: ID!) {
        issues(first: 250, filter: {
          team: { id: { eq: $teamId } },
          project: { id: { eq: $projectId } }
        }) {
          nodes {
            id identifier url title description priority
            team { id }
            project { id }
            state { id }
            relations { nodes { type relatedIssue { id state { type } } } }
          }
        }
      }`,
      withStatus ? { teamId, projectId, statusId } : { teamId, projectId },
    );
    return (data.issues?.nodes ?? []).map(normalizeIssue);
  }

  async function graphql(query, variables) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: apiKey, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      throw new AgentWorkflowError("LINEAR_UNAVAILABLE", "Linear request failed", { cause: error.message });
    }
    const envelope = await response.json().catch(() => null);
    if (!response.ok || !envelope?.data || envelope.errors?.length) {
      throw new AgentWorkflowError("LINEAR_REQUEST_FAILED", "Linear returned an error", {
        status: response.status,
        errors: envelope?.errors?.map(({ message }) => message) ?? [],
      });
    }
    return envelope.data;
  }
}

function normalizeIssue(issue) {
  const blocked = (issue.relations?.nodes ?? []).some(({ type, relatedIssue }) =>
    type === "blockedBy" && !["completed", "canceled"].includes(relatedIssue?.state?.type)
  );
  return {
    id: issue.id,
    identifier: issue.identifier,
    url: issue.url,
    title: issue.title,
    description: issue.description ?? "",
    priority: issue.priority ?? 0,
    teamId: issue.team?.id,
    projectId: issue.project?.id,
    statusId: issue.state?.id,
    blocked,
  };
}
