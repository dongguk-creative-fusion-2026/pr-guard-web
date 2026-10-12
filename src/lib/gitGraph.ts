import type { CommitGraph } from "./api";

export type GraphCommit = CommitGraph["commits"][number];

/** 한 줄에서 다음 줄로 이어지는 선 (레인 번호) */
export type Segment = { from: number; to: number; lane: number };

export type GraphRow = {
  commit: GraphCommit;
  /** 이 커밋이 놓인 레인 */
  lane: number;
  /** 다음 줄로 이어지는 선들 (마지막 줄이면 화면 밖으로 이어지는 선) */
  segments: Segment[];
  /** 기본 브랜치의 first-parent 줄기 위에 있는가 */
  main: boolean;
  merge: boolean;
};

/**
 * git log --graph 처럼 커밋마다 레인을 정한다 (커밋은 최신 → 오래된 topo-order).
 * 레인은 "다음에 올 커밋 해시"를 기다리는 자리다. 커밋은 자기를 기다리던 첫 레인에 놓이고,
 * 첫 부모는 같은 레인을 이어받고, 나머지 부모는 빈 레인을 새로 연다. 같은 커밋을 기다리던 다른 레인은 그 커밋으로 합류한다.
 */
export function layoutGraph(graph: CommitGraph): { rows: GraphRow[]; lanes: number } {
  const commits = graph.commits;
  const lanes: (string | null)[] = [];
  const freeSlot = (except: number) => {
    const i = lanes.findIndex((h, j) => h === null && j !== except);
    if (i >= 0) return i;
    lanes.push(null);
    return lanes.length - 1;
  };

  // 기본 브랜치 줄기: 기본 브랜치 끝에서 첫 부모만 따라간 커밋들
  const byHash = new Map(commits.map((c) => [c.h, c]));
  const mainLine = new Set<string>();
  let cur = commits.find((c) => c.refs?.includes(graph.head));
  while (cur && !mainLine.has(cur.h)) {
    mainLine.add(cur.h);
    cur = cur.p[0] ? byHash.get(cur.p[0]) : undefined;
  }

  type Step = { commit: GraphCommit; lane: number; after: (string | null)[]; fromNode: Set<number>; mergeInto: number[] };
  const steps: Step[] = [];
  for (const c of commits) {
    let lane = lanes.indexOf(c.h);
    if (lane < 0) lane = freeSlot(-1);
    // 같은 커밋을 기다리던 다른 레인은 여기서 끝난다 (앞 줄에서 이 레인으로 휘어 들어온다)
    lanes.forEach((h, j) => {
      if (h === c.h && j !== lane) lanes[j] = null;
    });
    const fromNode = new Set<number>();
    const mergeInto: number[] = [];
    const [first, ...rest] = c.p;
    if (first === undefined) {
      lanes[lane] = null;
    } else {
      const existing = lanes.indexOf(first);
      if (existing >= 0 && existing !== lane) {
        // 첫 부모를 이미 다른 레인이 기다리고 있으면 그쪽으로 합류하고 이 레인은 닫는다
        lanes[lane] = null;
        mergeInto.push(existing);
      } else {
        lanes[lane] = first;
        fromNode.add(lane);
      }
    }
    for (const p of rest) {
      const existing = lanes.indexOf(p);
      if (existing >= 0) {
        mergeInto.push(existing);
      } else {
        const slot = freeSlot(lane);
        lanes[slot] = p;
        fromNode.add(slot);
      }
    }
    steps.push({ commit: c, lane, after: [...lanes], fromNode, mergeInto });
  }

  const rows: GraphRow[] = steps.map((s, i) => {
    const next = steps[i + 1];
    // 다음 줄에서 그 해시가 놓일 레인 (다음 커밋이면 그 커밋의 레인, 아니면 그대로)
    const target = (j: number) => (next && s.after[j] === next.commit.h ? next.lane : j);
    const segments: Segment[] = [];
    s.after.forEach((h, j) => {
      if (h === null) return;
      segments.push({ from: s.fromNode.has(j) ? s.lane : j, to: target(j), lane: j });
    });
    for (const j of s.mergeInto) segments.push({ from: s.lane, to: target(j), lane: j });
    return { commit: s.commit, lane: s.lane, segments, main: mainLine.has(s.commit.h), merge: s.commit.p.length > 1 };
  });
  return { rows, lanes: Math.max(1, ...steps.map((s) => s.after.length), ...rows.map((r) => r.lane + 1)) };
}
