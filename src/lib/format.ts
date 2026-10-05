import type { Category, Severity, Verdict } from "./api";

const fmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatTime(iso: string | null): string {
  return iso ? fmt.format(new Date(iso)) : "-";
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  MERGEABLE: "머지 가능",
  NEEDS_CHANGES: "수정 후 머지",
  NOT_RECOMMENDED: "머지 비권장",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  INTENT: "A · 의도",
  IMPACT: "B · 영향",
  SECURITY: "C · 보안",
  RISK: "D · 위험도",
  GENERAL: "일반",
};

export const SEVERITY_ORDER: Severity[] = ["BLOCKER", "MAJOR", "MINOR", "INFO"];

/** com.example.board.service.PostService#getPost(Long) → PostService#getPost(Long) */
export function shortMethod(id: string | null): string {
  if (!id) return "-";
  const hash = id.indexOf("#");
  const type = hash < 0 ? id : id.slice(0, hash);
  return type.slice(type.lastIndexOf(".") + 1) + (hash < 0 ? "" : id.slice(hash));
}

export function fileName(path: string | null): string {
  return path ? path.slice(path.lastIndexOf("/") + 1) : "-";
}
