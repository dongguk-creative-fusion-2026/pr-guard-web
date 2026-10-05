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

export type Review = {
  id: number;
  projectId: number;
  prNumber: number;
  headSha: string;
  status: ReviewStatus;
  reviewer: string | null;
  result: string | null;
  error: string | null;
  commentUrl: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
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
};
