import "server-only";

// 백엔드(pr-guard-api) 주소. 브라우저가 아니라 Next 서버에서만 호출하므로 CORS 설정이 필요 없다.
const BASE = process.env.API_BASE_URL ?? "http://localhost:8080";

export type Project = {
  id: number;
  owner: string;
  name: string;
  htmlUrl: string;
  defaultBranch: string;
  openPullCount: number;
  lastPolledAt: string | null;
  lastPollError: string | null;
  createdAt: string;
};

export type PullRequest = {
  id: number;
  projectId: number;
  number: number;
  title: string;
  author: string;
  htmlUrl: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  state: "open" | "closed";
  draft: boolean;
  commentId: number | null;
  updatedAt: string;
  latestReviewId: number | null;
  latestReviewStatus: ReviewStatus | null;
};

export type ReviewStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SUPERSEDED";
export type Verdict = "MERGEABLE" | "NEEDS_CHANGES" | "NOT_RECOMMENDED";
export type Severity = "BLOCKER" | "MAJOR" | "MINOR" | "INFO";
export type Category = "INTENT" | "IMPACT" | "SECURITY" | "RISK" | "GENERAL";

export type Review = {
  id: number;
  projectId: number;
  prNumber: number;
  headSha: string;
  /** 같은 커밋을 다시 리뷰한 차수 (폴링이 만든 것은 1) */
  run: number;
  status: ReviewStatus;
  verdict: Verdict | null;
  reviewer: string | null;
  summary: string | null;
  /** PR 에 남긴 요약 코멘트 원문 (마크다운) */
  result: string | null;
  error: string | null;
  commentUrl: string | null;
  findingCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type Finding = {
  id: number;
  ruleId: string;
  category: Category;
  severity: Severity;
  file: string | null;
  line: number | null;
  title: string;
  message: string;
  evidence: string | null;
  fingerprint: string;
  source: "TOOL" | "LLM";
};

export type CallerView = { callerId: string; file: string; line: number };

export type ChangedMethodView = {
  kind: "ADDED" | "REMOVED" | "MODIFIED";
  id: string | null;
  baseId: string | null;
  file: string;
  line: number;
  signatureChanged: boolean;
  bodyChanged: boolean;
  annotationsChanged: boolean;
  test: boolean;
  callers: CallerView[];
  staleCalls: CallerView[];
};

export type IndexStats = {
  files: number;
  types: number;
  methods: number;
  calls: number;
  unresolvedCalls: number;
  failedFiles: number;
};

export type CoChange = {
  file: string;
  partner: string;
  directory: boolean;
  support: number;
  fileCommits: number;
  confidence: number;
};

export type AnalysisContext = {
  baseSha: string | null;
  headSha: string;
  baseIndex: IndexStats;
  headIndex: IndexStats;
  changedMethods: ChangedMethodView[];
  history: { file: string; commits: number; coChanges: CoChange[] }[];
  historyCommits: number;
  blame: { file: string; line: number; sha: string; author: string; time: number; summary: string }[];
  notes: string[];
  elapsedMs: number;
};

export type ReviewDetail = {
  review: Review;
  findings: Finding[];
  context: AnalysisContext | null;
};

export type PollResult = {
  projectId: number;
  notModified: boolean;
  openPulls: number;
  closedPulls: number;
  queuedReviews: number;
  error: string | null;
};

/** 백엔드 오류 응답 {timestamp, code, message} 를 그대로 담는다. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, "API_UNREACHABLE", `백엔드에 연결할 수 없습니다 (${BASE})`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.code ?? "API_ERROR", body?.message ?? `요청 실패 (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  listProjects: () => call<Project[]>("/api/projects"),
  getProject: (id: number) => call<Project>(`/api/projects/${id}`),
  registerProject: (url: string) =>
    call<Project>("/api/projects", { method: "POST", body: JSON.stringify({ url }) }),
  deleteProject: (id: number) => call<void>(`/api/projects/${id}`, { method: "DELETE" }),
  listPulls: (id: number) => call<PullRequest[]>(`/api/projects/${id}/pulls`),
  listReviews: (id: number, limit = 20) => call<Review[]>(`/api/projects/${id}/reviews?limit=${limit}`),
  pollNow: (id: number) => call<PollResult>(`/api/projects/${id}/poll`, { method: "POST" }),
  getReview: (reviewId: number) => call<ReviewDetail>(`/api/reviews/${reviewId}`),
  rerun: (id: number, number: number) =>
    call<Review>(`/api/projects/${id}/pulls/${number}/reviews`, { method: "POST" }),
};
