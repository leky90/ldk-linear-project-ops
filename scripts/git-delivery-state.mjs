import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SHA_PATTERN = /^[0-9a-f]{7,64}$/iu;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/iu;
const EMPTY_STATUS_HASH = sha256(Buffer.alloc(0));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function git(repository, args, { encoding = "utf8", allowFailure = false } = {}) {
  try {
    const result = await execFileAsync("git", ["-C", repository, ...args], {
      encoding,
      maxBuffer: 16 * 1024 * 1024,
    });
    return result.stdout;
  } catch (error) {
    if (allowFailure) return null;
    const detail = typeof error.stderr === "string" ? error.stderr.trim() : "";
    throw new Error(detail || `git ${args.join(" ")} failed`);
  }
}

async function currentGitState(repository) {
  const root = await realpath((await git(repository, ["rev-parse", "--show-toplevel"])).trim());
  const gitDir = await realpath((await git(root, ["rev-parse", "--absolute-git-dir"])).trim());
  const commonDir = await realpath((await git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim());
  const branchName = (await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true }))?.trim() ?? "";
  const headCommit = (await git(root, ["rev-parse", "HEAD"])).trim();
  const status = await git(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"], { encoding: "buffer" });
  return {
    root,
    repositoryId: sha256(commonDir),
    worktreeId: sha256(root),
    worktreeMode: gitDir === commonDir ? "primary-worktree" : "linked-worktree",
    branchName,
    headCommit,
    clean: status.length === 0,
    statusHash: sha256(status),
  };
}

function baselineIdentity(baseline) {
  const { baselineId: _ignored, ...payload } = baseline;
  return sha256(stableJson(payload));
}

export async function captureGitBaseline({ repository = ".", issueId, worktreeIsolation = "required" }) {
  if (typeof issueId !== "string" || !issueId.trim()) throw new Error("issueId is required");
  if (!new Set(["required", "allow-clean-primary"]).has(worktreeIsolation)) {
    throw new Error("worktreeIsolation must be required or allow-clean-primary");
  }

  const state = await currentGitState(repository);
  if (!state.branchName) throw new Error("a named issue branch is required; detached HEAD is not allowed");
  if (!state.clean) throw new Error("cannot record a baseline from a dirty worktree, including untracked files");
  if (worktreeIsolation === "required" && state.worktreeMode !== "linked-worktree") {
    throw new Error("a dedicated linked Git worktree is required");
  }
  if (!state.branchName.toLowerCase().includes(issueId.trim().toLowerCase())) {
    throw new Error("the issue branch name must contain issueId");
  }

  const baseline = {
    schemaVersion: 1,
    kind: "linear-git-worktree-baseline",
    issueId: issueId.trim(),
    capturedAt: new Date().toISOString(),
    repositoryId: state.repositoryId,
    worktreeId: state.worktreeId,
    worktreeMode: state.worktreeMode,
    branchName: state.branchName,
    baselineCommit: state.headCommit,
    clean: true,
    statusHash: state.statusHash,
  };
  return { ...baseline, baselineId: baselineIdentity(baseline) };
}

export function validateGitBaseline(baseline) {
  const errors = [];
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) return ["Git baseline must be an object"];
  if (baseline.schemaVersion !== 1) errors.push("Git baseline schemaVersion must be 1");
  if (baseline.kind !== "linear-git-worktree-baseline") errors.push("Git baseline kind is invalid");
  if (typeof baseline.issueId !== "string" || !baseline.issueId.trim()) errors.push("Git baseline issueId is required");
  if (typeof baseline.capturedAt !== "string" || Number.isNaN(Date.parse(baseline.capturedAt))) {
    errors.push("Git baseline capturedAt must be a valid timestamp");
  }
  for (const field of ["repositoryId", "worktreeId", "statusHash", "baselineId"]) {
    if (typeof baseline[field] !== "string" || !DIGEST_PATTERN.test(baseline[field])) errors.push(`Git baseline ${field} is invalid`);
  }
  if (!new Set(["primary-worktree", "linked-worktree"]).has(baseline.worktreeMode)) errors.push("Git baseline worktreeMode is invalid");
  if (typeof baseline.branchName !== "string" || !baseline.branchName.trim()) errors.push("Git baseline branchName is required");
  if (typeof baseline.branchName === "string" && typeof baseline.issueId === "string"
    && !baseline.branchName.toLowerCase().includes(baseline.issueId.trim().toLowerCase())) {
    errors.push("Git baseline branchName must contain issueId");
  }
  if (typeof baseline.baselineCommit !== "string" || !SHA_PATTERN.test(baseline.baselineCommit)) errors.push("Git baseline baselineCommit is invalid");
  if (baseline.clean !== true) errors.push("Git baseline must be clean");
  if (baseline.statusHash !== EMPTY_STATUS_HASH) errors.push("Git baseline statusHash must represent a clean worktree");
  if (typeof baseline.baselineId === "string" && DIGEST_PATTERN.test(baseline.baselineId)
    && baseline.baselineId !== baselineIdentity(baseline)) errors.push("Git baseline integrity check failed");
  return [...new Set(errors)];
}

function validateScopePaths(paths) {
  const errors = [];
  if (!Array.isArray(paths) || paths.length === 0) return ["git.scopePaths must be a non-empty array"];
  if (new Set(paths).size !== paths.length) errors.push("git.scopePaths must contain unique paths");
  for (const path of paths) {
    if (typeof path !== "string" || !path.trim()) {
      errors.push("git.scopePaths must contain non-empty strings");
      continue;
    }
    const normalized = path.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/$/u, "");
    if (isAbsolute(path) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")
      || normalized === ".git" || normalized.startsWith(".git/")) {
      errors.push(`git.scopePaths contains unsafe path ${path}`);
    }
  }
  return [...new Set(errors)];
}

function pathInScope(path, scopes) {
  const normalizedPath = path.replaceAll("\\", "/");
  return scopes.some((scope) => {
    const normalizedScope = scope.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/$/u, "");
    return normalizedScope === "." || normalizedPath === normalizedScope || normalizedPath.startsWith(`${normalizedScope}/`);
  });
}

async function isAncestor(repository, ancestor, descendant) {
  const result = await git(repository, ["merge-base", "--is-ancestor", ancestor, descendant], { allowFailure: true });
  return result !== null;
}

export async function validateLiveGitDelivery({ evidence, baseline, repository = ".", worktreeIsolation = "required" }) {
  const errors = validateGitBaseline(baseline);
  const delivery = evidence?.software ?? evidence;
  const gitEvidence = delivery?.git;
  if (!gitEvidence || typeof gitEvidence !== "object" || Array.isArray(gitEvidence)) {
    return {
      errors: [...errors, "software.git is required"],
      summary: { baselineRecorded: false, isolationSatisfied: false, scopeClean: false },
    };
  }
  if (gitEvidence.baselineId !== baseline?.baselineId) errors.push("software.git.baselineId does not match the baseline artifact");
  if (baseline?.issueId !== evidence?.issueId) errors.push("Git baseline issueId does not match evidence.issueId");
  errors.push(...validateScopePaths(gitEvidence.scopePaths));
  if (typeof gitEvidence.changeBaseSha !== "string" || !SHA_PATTERN.test(gitEvidence.changeBaseSha)) {
    errors.push("software.git.changeBaseSha is invalid");
  }
  if (!new Set(["required", "allow-clean-primary"]).has(worktreeIsolation)) errors.push("worktreeIsolation is invalid");

  let state;
  try {
    state = await currentGitState(repository);
  } catch (error) {
    errors.push(`cannot inspect live Git state: ${error.message}`);
  }
  if (!state) {
    return {
      errors: [...new Set(errors)],
      summary: { baselineRecorded: errors.length === 0, isolationSatisfied: false, scopeClean: false },
    };
  }

  if (state.repositoryId !== baseline?.repositoryId) errors.push("live repository does not match the Git baseline");
  if (state.worktreeId !== baseline?.worktreeId) errors.push("live worktree does not match the Git baseline");
  if (state.branchName !== baseline?.branchName) errors.push("live branch does not match the Git baseline");
  if (worktreeIsolation === "required" && (baseline?.worktreeMode !== "linked-worktree" || state.worktreeMode !== "linked-worktree")) {
    errors.push("a dedicated linked Git worktree is required");
  }
  if (!state.clean) errors.push("live worktree contains uncommitted or untracked files");
  if (state.headCommit !== delivery?.commitSha) errors.push("software.commitSha must equal the live worktree HEAD");

  const commitShaValid = typeof delivery?.commitSha === "string" && SHA_PATTERN.test(delivery.commitSha);
  const changeBaseValid = typeof gitEvidence.changeBaseSha === "string" && SHA_PATTERN.test(gitEvidence.changeBaseSha);
  if (commitShaValid && baseline?.baselineCommit && !(await isAncestor(state.root, baseline.baselineCommit, delivery.commitSha))) {
    errors.push("software.commitSha is not descended from the recorded baseline commit");
  }
  if (changeBaseValid && baseline?.baselineCommit && !(await isAncestor(state.root, baseline.baselineCommit, gitEvidence.changeBaseSha))) {
    errors.push("software.git.changeBaseSha is outside the recorded baseline chain");
  }
  if (changeBaseValid && commitShaValid && !(await isAncestor(state.root, gitEvidence.changeBaseSha, delivery.commitSha))) {
    errors.push("software.commitSha is not descended from software.git.changeBaseSha");
  }

  let changedPaths = [];
  if (changeBaseValid && commitShaValid) {
    try {
      const output = await git(state.root, ["diff", "--name-only", "--no-renames", "-z", gitEvidence.changeBaseSha, delivery.commitSha], { encoding: "buffer" });
      changedPaths = output.toString("utf8").split("\0").filter(Boolean);
      if (changedPaths.length === 0) errors.push("the verified commit range contains no changed paths");
      if (Array.isArray(gitEvidence.scopePaths)) {
        const outsideScope = changedPaths.filter((path) => !pathInScope(path, gitEvidence.scopePaths));
        if (outsideScope.length) errors.push(`committed paths outside declared scope: ${outsideScope.join(", ")}`);
      }
    } catch (error) {
      errors.push(`cannot inspect committed paths: ${error.message}`);
    }
  }

  const baselineRecorded = validateGitBaseline(baseline).length === 0
    && gitEvidence.baselineId === baseline.baselineId
    && baseline.issueId === evidence.issueId;
  const isolationSatisfied = baselineRecorded
    && state.repositoryId === baseline.repositoryId
    && state.worktreeId === baseline.worktreeId
    && state.branchName === baseline.branchName
    && (worktreeIsolation === "allow-clean-primary" || state.worktreeMode === "linked-worktree");
  const scopeClean = errors.length === 0 && state.clean && changedPaths.length > 0;
  return {
    errors: [...new Set(errors)],
    summary: {
      baselineRecorded,
      isolationSatisfied,
      scopeClean,
      repositoryId: state.repositoryId,
      worktreeId: state.worktreeId,
      worktreeMode: state.worktreeMode,
      branchName: state.branchName,
      baselineCommit: baseline?.baselineCommit,
      changeBaseSha: gitEvidence.changeBaseSha,
      commitSha: delivery?.commitSha,
      changedPaths,
      remainingWorktreeChanges: state.clean ? 0 : 1,
    },
  };
}

export function repositoryRelativePath(repositoryRoot, candidate) {
  const result = relative(resolve(repositoryRoot), resolve(candidate));
  return result.split(sep).join("/");
}

export async function validateBaselineOutputPath({ repository = ".", output }) {
  if (typeof output !== "string" || !output.trim()) throw new Error("baseline output path is required");
  const state = await currentGitState(repository);
  const relativeOutput = repositoryRelativePath(state.root, output);
  if (relativeOutput === ".." || relativeOutput.startsWith("../")) return;
  if (relativeOutput === ".git" || relativeOutput.startsWith(".git/")) {
    throw new Error("baseline output must not be stored inside .git");
  }
  const tracked = await git(state.root, ["ls-files", "--error-unmatch", "--", relativeOutput], { allowFailure: true });
  if (tracked !== null) throw new Error("baseline output must not overwrite a tracked file");
  const ignored = await git(state.root, ["check-ignore", "--quiet", "--no-index", "--", relativeOutput], { allowFailure: true });
  if (ignored === null) throw new Error("baseline output inside the worktree must be ignored by Git");
}
