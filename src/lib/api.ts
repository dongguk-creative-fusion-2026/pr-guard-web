import "server-only";

// 백엔드(pr-guard-api) 주소. 브라우저가 아니라 Next 서버에서만 호출하므로 CORS 설정이 필요 없다.
export const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8080";
const BASE = API_BASE;

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
  /** false 면 리뷰만 하고 PR 에 코멘트를 달지 않는다 */
  commentEnabled: boolean;
  /** MAJOR 가 이 개수 이상이면 "수정 후 머지". null 이면 서버 기본값(1) */
  majorThreshold: number | null;
  /** 등록 화면(온보딩)을 끝낸 시각. null 이면 아직 */
  onboardedAt: string | null;
};

/** GitHub 레포 정보 (등록 화면) */
export type RepoInfo = {
  description: string | null;
  language: string | null;
  stars: number;
  sizeKb: number;
  pushedAt: string | null;
  defaultBranch: string;
  /** 언어별 코드 크기 (바이트) */
  languages: Record<string, number>;
};

/** 그래프 만들기 진행 단계: dispatched → started → cloned → indexing → indexed */
export type GraphProgress = {
  stage: string;
  message: string | null;
  data: Record<string, unknown>;
  at: string;
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

/** PR 에서 바뀐 파일. status: added, modified, removed, renamed … */
export type FileChange = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  previousPath: string | null;
};

export type AnalysisContext = {
  baseSha: string | null;
  headSha: string;
  baseIndex: IndexStats;
  headIndex: IndexStats;
  /** 예전 리뷰에는 없다 (그때는 history 의 파일로 대신한다) */
  files?: FileChange[];
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

export type GraphStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

/** GitNexus 인덱스로 만든 의존성 그래프: 파일 단위 의존 + 그 파일들 안의 함수와 함수 간 호출 */
export type GraphData = {
  /** id = 레포 안 파일 경로. community = GitNexus 가 찾은 기능 묶음 */
  nodes: { id: string; community: string | null; symbols: number; /** 줄 수 (예전 그래프에는 없다) */ lines?: number }[];
  /** source 가 target 을 쓴다. types = 관계 종류별 개수 (IMPORTS, CALLS, INJECTS …) */
  edges: { source: string; target: string; weight: number; types: Record<string, number> }[];
  communities: { id: string; label: string; files: number }[];
  /** 함수 (Method · Function · Constructor). 예전 그래프에는 없다 */
  functions?: { id: string; name: string; kind: string; file: string; line: number; endLine: number }[];
  /** source 함수가 target 함수를 호출한다 */
  calls?: { source: string; target: string; weight: number }[];
  /** 최근 커밋(최대 1000개) 기준 git 이력. 예전 그래프에는 없다 */
  history?: GitHistory | null;
  /** 인프라 지도. 예전 그래프에는 없다 */
  infra?: InfraMap | null;
  stats: {
    files: number;
    connectedFiles: number;
    shownFiles: number;
    edges: number;
    shownEdges: number;
    truncated: boolean;
    functions?: number;
    shownFunctions?: number;
    shownCalls?: number;
    analyzeMs: number;
  };
};

export type InfraKind =
  | "client" | "dns" | "tunnel" | "proxy" | "app" | "database" | "cache" | "queue"
  | "storage" | "monitoring" | "registry" | "external" | "platform" | "ci";

/** 근거 수준: file = 설정 파일에 적혀 있음, inferred = 이름 · 종류로 추정, missing = 레포에 없음 */
export type InfraConfidence = "file" | "inferred" | "missing";

export type InfraMap = {
  nodes: {
    id: string;
    kind: InfraKind;
    label: string;
    detail: string | null;
    sources: { file: string; line: number }[];
    confidence: InfraConfidence;
    /** docker-compose · kubernetes … 어디서 정의됐는지 */
    env: string | null;
  }[];
  links: { from: string; to: string; label: string | null; confidence: InfraConfidence; source: { file: string; line: number } | null }[];
  /** 인프라 노드와 코드 파일: entry = 요청을 받는 진입점, data = DB 를 쓰는 코드, external = 외부 API 를 부르는 코드 */
  codeLinks: { node: string; file: string; kind: "entry" | "data" | "external"; detail: string | null }[];
  files: string[];
};

export type FileHistory = {
  commits: number;
  additions: number;
  deletions: number;
  authors: number;
  topAuthor: string;
  lastAt: string;
  firstAt: string;
};

export type GitHistory = {
  commits: number;
  since: string | null;
  until: string | null;
  files: Record<string, FileHistory>;
  /** 같이 바뀐 파일 쌍. confidence = 덜 바뀐 파일이 바뀔 때 다른 파일도 같이 바뀐 비율 */
  coChanges: { a: string; b: string; support: number; confidence: number }[];
  /** 커밋별 변경 (오래된 순). c = [[timelineFiles 번호, 추가, 삭제]], a = authors 번호. 예전 그래프에는 없다 */
  timeline?: { at: number; a: number; c: [number, number, number][] }[];
  timelineFiles?: string[];
  authors?: string[];
};

export type RepoGraph = {
  projectId: number;
  status: GraphStatus;
  /** 그래프를 만든 기본 브랜치 커밋 */
  commitSha: string | null;
  /** 처음 만들기 전에는 null. 다시 만드는 중이거나 실패해도 예전 그래프는 남는다 */
  graph: GraphData | null;
  error: string | null;
  progress: GraphProgress[];
  /** 그래프를 만든 GitHub Actions 실행 */
  runUrl: string | null;
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
/**
 * 테스트가 도는 동안 실제로 일어난 호출 (실행 검증 러너의 trace-agent 기록).
 * methods 는 "com.a.Foo#bar" (생성자는 #<init>), edges 는 [호출하는 쪽, 불린 쪽, 횟수], tests 는 테스트 → 지나간 함수 번호
 */
export type RuntimeTrace = {
  methods: string[];
  counts: number[];
  edges: [number, number, number][];
  tests: Record<string, number[]>;
};

/** 프로젝트의 가장 최근 런타임 기록 (head 쪽) */
export type ProjectRuntime = {
  runId: number;
  reviewId: number;
  prNumber: number;
  sha: string;
  finishedAt: string | null;
  trace: RuntimeTrace;
};

/** 레포의 AI 에이전트 규칙 파일 상태 (AGENTS.md · CLAUDE.md …) */
export type AgentsInfo = {
  existing: { path: string; htmlUrl: string; content: string }[];
  build: { tool: "gradle" | "maven" | "npm" | "unknown"; wrapper: boolean; build: string | null; test: string | null; java: number | null };
  /** PR Guard 봇이 이 레포에 브랜치 · PR 을 만들 수 있는가 */
  canCreatePr: boolean;
  /** 전에 올린 AGENTS.md PR 이 열려 있으면 그 주소 */
  openPr: string | null;
  defaultBranch: string;
};

/** 리뷰에서 반복된 실수 유형과 AGENTS.md 에 넣을 규칙 (백엔드 LessonService) */
export type Lesson = {
  type: string;
  label: string;
  rule: string;
  prs: number[];
  findings: number;
  /** 서로 다른 PR 2개 이상에서 나옴 */
  repeated: boolean;
  worst: Severity;
  examples: { prNumber: number; reviewId: number; severity: Severity; file: string | null; title: string }[];
};

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
  /** 그래프 행이 없으면 null */
  getGraph: (id: number) =>
    call<RepoGraph>(`/api/projects/${id}/graph`).catch((e) => {
      if (e instanceof ApiError && e.code === "GRAPH_NOT_FOUND") return null;
      throw e;
    }),
  rebuildGraph: (id: number) => call<RepoGraph>(`/api/projects/${id}/graph`, { method: "POST" }),
  getRepoInfo: (id: number) => call<RepoInfo>(`/api/projects/${id}/repo`),
  updateSettings: (id: number, commentEnabled: boolean, majorThreshold: number | null) =>
    call<Project>(`/api/projects/${id}/settings`, {
      method: "PATCH",
      body: JSON.stringify({ commentEnabled, majorThreshold }),
    }),
  finishOnboarding: (id: number) => call<Project>(`/api/projects/${id}/onboarded`, { method: "POST" }),
  /** 런타임 기록이 없거나 백엔드가 아직 지원하지 않으면 null */
  getRuntime: (id: number) =>
    call<ProjectRuntime | undefined>(`/api/projects/${id}/runtime`)
      .then((r) => r ?? null)
      .catch(() => null),
  /** 리뷰 단계 기록 (스트림이 아니라 한 번에). 실패하면 빈 목록 */
  getReviewEvents: (reviewId: number) =>
    call<{ stage: string; status: string; data: Record<string, unknown> | null }[]>(`/api/reviews/${reviewId}/events`, {
      headers: { Accept: "application/json" },
    }).catch(() => []),
  getAgentsMd: (id: number) => call<AgentsInfo>(`/api/projects/${id}/agents-md`),
  /** 백엔드가 지원하지 않으면 빈 목록 */
  getLessons: (id: number) => call<Lesson[]>(`/api/projects/${id}/agents-md/lessons`).catch(() => [] as Lesson[]),
  createAgentsPull: (id: number, content: string) =>
    call<{ url: string }>(`/api/projects/${id}/agents-md/pull`, { method: "POST", body: JSON.stringify({ content }) }),
  rerun: (id: number, number: number) =>
    call<Review>(`/api/projects/${id}/pulls/${number}/reviews`, { method: "POST" }),
};
