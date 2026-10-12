import type { PullRequest, Review } from "./api";

/** PR 대기열의 칸: 사람이 볼 순서대로 */
export type Lane = "BLOCKED" | "CHECK" | "PASS" | "REVIEWING" | "NONE";

export const LANE_META: Record<Lane, { label: string; hint: string; color: string }> = {
  BLOCKED: { label: "차단", hint: "머지 비권장 · BLOCKER 가 있어요", color: "#f43f5e" },
  CHECK: { label: "확인 필요", hint: "수정 후 머지 · 사람이 지적을 확인할 PR", color: "#fbbf24" },
  PASS: { label: "자동 통과", hint: "머지 가능 · 사람이 깊게 보지 않아도 되는 PR", color: "#4ade80" },
  REVIEWING: { label: "리뷰 중", hint: "대기열에 있거나 분석하는 중", color: "#818cf8" },
  NONE: { label: "리뷰 없음", hint: "아직 리뷰하지 않았거나 실패한 PR", color: "#8a8aa3" },
};

export const LANES: Lane[] = ["BLOCKED", "CHECK", "PASS", "REVIEWING", "NONE"];

export type QueueItem = { pull: PullRequest; review: Review | null; lane: Lane };

export function laneOf(review: Review | null): Lane {
  if (!review) return "NONE";
  if (review.status === "PENDING" || review.status === "RUNNING") return "REVIEWING";
  if (review.status !== "DONE" || !review.verdict) return "NONE";
  return review.verdict === "NOT_RECOMMENDED" ? "BLOCKED" : review.verdict === "NEEDS_CHANGES" ? "CHECK" : "PASS";
}

/** PR 마다 가장 최근 리뷰 (reviews 는 최신순) */
export function latestReviews(reviews: Review[]): Map<number, Review> {
  const latest = new Map<number, Review>();
  for (const r of reviews) if (!latest.has(r.prNumber)) latest.set(r.prNumber, r);
  return latest;
}

export type QueueStats = {
  open: number;
  /** 사람이 볼 PR = 차단 + 확인 필요 */
  human: number;
  pass: number;
  reviewing: number;
  /** 끝난 리뷰의 분석 시간 중앙값 (초) */
  medianSeconds: number | null;
  /** 끝난 리뷰 수 (중앙값의 모수) */
  timed: number;
};

/** 열린 PR 을 칸별로 나누고, 병목 숫자를 센다 */
export function buildQueue(pulls: PullRequest[], reviews: Review[]): { items: QueueItem[]; stats: QueueStats } {
  const latest = latestReviews(reviews);
  const items = pulls
    .filter((p) => p.state === "open")
    .map((pull) => {
      const review = latest.get(pull.number) ?? null;
      return { pull, review, lane: laneOf(review) };
    })
    .sort((a, b) => LANES.indexOf(a.lane) - LANES.indexOf(b.lane) || b.pull.number - a.pull.number);
  const seconds = reviews
    .filter((r) => r.status === "DONE" && r.startedAt && r.finishedAt)
    .map((r) => (Date.parse(r.finishedAt!) - Date.parse(r.startedAt!)) / 1000)
    .sort((a, b) => a - b);
  const count = (lane: Lane) => items.filter((i) => i.lane === lane).length;
  return {
    items,
    stats: {
      open: items.length,
      human: count("BLOCKED") + count("CHECK"),
      pass: count("PASS"),
      reviewing: count("REVIEWING"),
      medianSeconds: seconds.length ? Math.round(seconds[Math.floor(seconds.length / 2)]) : null,
      timed: seconds.length,
    },
  };
}
