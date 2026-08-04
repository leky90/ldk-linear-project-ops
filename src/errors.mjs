export class AgentWorkflowError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AgentWorkflowError";
    this.code = code;
    this.details = details;
  }
}
