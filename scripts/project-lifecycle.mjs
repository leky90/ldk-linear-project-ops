const CATEGORY_LABELS = Object.freeze({
  backlog: "Backlog",
  planned: "Planned",
  "in-progress": "In Progress",
  completed: "Completed",
  canceled: "Canceled",
});

const STARTED_ISSUE_STATES = new Set(["in progress", "in review", "done"]);
const OPEN_ISSUE_STATES = new Set(["refinement", "ready", "in progress", "in review", "blocked"]);

export function normalizeProjectStatusCategory(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return normalizeProjectStatusCategory(value.category ?? value.type ?? value.name);
  }
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase().replaceAll("_", "-").replace(/\s+/gu, "-");
  if (token === "backlog") return "backlog";
  if (token === "planned" || token === "plan") return "planned";
  if (["started", "active", "in-progress", "inprogress"].includes(token)) return "in-progress";
  if (["completed", "complete", "done"].includes(token)) return "completed";
  if (["canceled", "cancelled", "cancel"].includes(token)) return "canceled";
  return null;
}

export function resolveProjectStatus(project = {}) {
  const status = project.projectStatus ?? project.status;
  const category = normalizeProjectStatusCategory(project.statusCategory ?? status);
  const name = typeof status === "object" && status !== null
    ? status.name
    : (project.statusName ?? (typeof status === "string" ? status : undefined));
  return {
    id: typeof status === "object" && status !== null ? status.id : project.statusId,
    name: name ?? (category ? CATEGORY_LABELS[category] : "Unknown"),
    category,
  };
}

export function analyzeProjectLifecycle(snapshot) {
  if (!snapshot?.project) throw new Error("snapshot.project is required");
  const status = resolveProjectStatus(snapshot.project);
  const issues = (Array.isArray(snapshot.issues) ? snapshot.issues : [])
    .filter((issue) => normalizeIssueState(issue.status) !== "canceled");
  const startedIssues = issues.filter((issue) => STARTED_ISSUE_STATES.has(normalizeIssueState(issue.status)));
  const openIssues = issues.filter((issue) => OPEN_ISSUE_STATES.has(normalizeIssueState(issue.status)));
  const milestones = Array.isArray(snapshot.milestones) ? snapshot.milestones : [];
  const progressedMilestones = milestones.filter(hasMilestoneProgress);
  const lifecycleMode = snapshot.project.lifecycle?.mode ?? snapshot.project.lifecycleMode ?? "unspecified";
  const evidence = [];
  if (startedIssues.length) evidence.push(`${startedIssues.length} issue đã bắt đầu hoặc hoàn thành`);
  if (progressedMilestones.length) evidence.push(`${progressedMilestones.length} milestone đã có tiến độ`);

  if (!status.category) {
    return result("unknown-status", "unknown", status, lifecycleMode, evidence, openIssues.length, {
      message: "Không xác định được Linear Project status category từ dữ liệu live.",
      requiresDecision: true,
    });
  }

  const workHasStarted = startedIssues.length > 0 || progressedMilestones.length > 0;
  if (isPausedStatusName(status.name)) {
    return result("paused-project", "advisory", status, lifecycleMode, evidence, openIssues.length, {
      message: "Project đang dùng custom paused/on-hold status; không tự resume nếu thiếu yêu cầu rõ ràng.",
      requiresDecision: true,
    });
  }
  if (["backlog", "planned"].includes(status.category) && workHasStarted) {
    return result("status-mismatch", "mismatch", status, lifecycleMode, evidence, openIssues.length, {
      message: "Project vẫn ở giai đoạn chưa bắt đầu dù execution evidence đã tồn tại.",
      recommendedCategory: "in-progress",
      recommendedName: CATEGORY_LABELS["in-progress"],
      safeTransition: true,
    });
  }

  if (status.category === "completed" && openIssues.length > 0) {
    return result("completed-with-open-work", "mismatch", status, lifecycleMode, evidence, openIssues.length, {
      message: `Project đã Completed nhưng còn ${openIssues.length} issue chưa kết thúc.`,
      recommendedCategory: "in-progress",
      recommendedName: CATEGORY_LABELS["in-progress"],
      requiresDecision: true,
    });
  }

  if (status.category === "canceled" && openIssues.length > 0) {
    return result("canceled-with-open-work", "mismatch", status, lifecycleMode, evidence, openIssues.length, {
      message: `Project đã Canceled nhưng còn ${openIssues.length} issue chưa kết thúc.`,
      requiresDecision: true,
    });
  }

  if (status.category === "in-progress" && openIssues.length === 0) {
    if (lifecycleMode === "continuous") {
      return result("continuous-needs-outcome", "advisory", status, lifecycleMode, evidence, 0, {
        message: "Project lifecycle liên tục đang không có outcome mở; giữ In Progress và yêu cầu CPO chọn outcome tiếp theo.",
        recommendedCategory: "in-progress",
        recommendedName: CATEGORY_LABELS["in-progress"],
        requiresDecision: true,
      });
    }
    return result("no-open-work", "advisory", status, lifecycleMode, evidence, 0, {
      message: "Project không còn issue mở; cần CPO quyết định mở outcome tiếp theo hay xác nhận completion criteria.",
      requiresDecision: true,
    });
  }

  return result("consistent", "consistent", status, lifecycleMode, evidence, openIssues.length, {
    message: "Project status nhất quán với execution evidence hiện có.",
  });
}

function result(code, consistency, status, lifecycleMode, evidence, openIssueCount, extra) {
  return { code, consistency, status, lifecycleMode, evidence, openIssueCount, ...extra };
}

function normalizeIssueState(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasMilestoneProgress(milestone) {
  const progress = milestone.progress ?? milestone.progressPercentage ?? milestone.completionPercentage;
  return milestone.completedAt != null || normalizeIssueState(milestone.status) === "done" || (typeof progress === "number" && progress > 0);
}

function isPausedStatusName(value) {
  if (typeof value !== "string") return false;
  const token = value.trim().toLowerCase().replaceAll("_", "-").replace(/\s+/gu, "-");
  return ["paused", "pause", "on-hold", "hold"].includes(token);
}
