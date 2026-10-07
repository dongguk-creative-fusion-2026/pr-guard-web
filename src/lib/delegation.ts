import type { FileRuntime } from "@/components/graph/runtime";
import { computeInsights, type Insights } from "@/components/insights/metrics";
import type { GraphData } from "./api";

/**
 * AI 위임 지도: 레포의 각 파일을 AI 에이전트에게 얼마나 맡겨도 되는지 세 구역으로 나눈다.
 *
 *   DELEGATE  맡겨도 됨 — 테스트가 지키고, 결합이 적고, 안정적
 *   REVIEW    맡기되 사람이 꼭 리뷰 — 위험 점수 2 이상 (테스트 없음 2, 핫스팟 · 숨은 결합 · 많이 쓰임 각 1)
 *   OWN       사람이 직접 — 보안 · 인증 · 결제 · 마이그레이션 · 설정, 또는 테스트 없이 많이 쓰이는 핵심
 *
 * 근거는 모두 레포 데이터(그래프 · git 이력 · 테스트 관계 · 런타임 기록)라 이유를 함께 돌려준다.
 */
export type Zone = "DELEGATE" | "REVIEW" | "OWN";

export const ZONE_META: Record<Zone, { label: string; short: string; color: string; desc: string }> = {
  DELEGATE: { label: "맡겨도 됨", short: "위임", color: "#22c55e", desc: "테스트가 지키고 결합이 적은 안정적인 코드" },
  REVIEW: { label: "맡기되 리뷰 필수", short: "리뷰", color: "#f59e0b", desc: "자주 바뀌거나, 숨은 결합이 있거나, 테스트가 없거나, 많이 쓰이는 코드" },
  OWN: { label: "사람이 직접", short: "직접", color: "#ef4444", desc: "보안 · 인증 · 결제 · 데이터 스키마 · 설정, 또는 테스트 없는 핵심 코드" },
};

export type Reason = { kind: "sensitive" | "untested" | "hotspot" | "coupling" | "hub" | "tested" | "runtime"; text: string };

export type FileZone = { path: string; zone: Zone; reasons: Reason[]; score: number };

export type Delegation = {
  files: Map<string, FileZone>;
  counts: Record<Zone, number>;
  /** 코드 파일만 (테스트 · 설정 제외) */
  code: FileZone[];
};

/** 사람이 직접 다뤄야 하는 영역 (경로 · 파일 이름) */
const SENSITIVE: { pattern: RegExp; label: string }[] = [
  { pattern: /security|auth(?!or)|permission|credential|password|token/i, label: "보안 · 인증" },
  { pattern: /(^|\/)(payment|billing|checkout|wallet|invoice)|payment|billing/i, label: "결제" },
  { pattern: /(^|\/)(db\/migration|migrations?|flyway|liquibase)\/|\.sql$/i, label: "데이터 스키마" },
  { pattern: /(^|\/)(config|configuration)\/|Config\.(java|kt)$|application[-.\w]*\.(ya?ml|properties)$/i, label: "설정" },
];

const HUB_MIN = 4;
/** 핫스팟 · 숨은 결합은 레포마다 기준이 달라 상대값으로 본다: 핫스팟 상위 이 비율 */
const HOTSPOT_TOP = 0.15;
const COUPLING_CONFIDENCE = 0.7;

const base = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");

export function computeDelegation(data: GraphData, runtime?: FileRuntime | null, insights?: Insights): Delegation {
  const ins = insights ?? computeInsights(data);
  const tests = new Set(ins.files.filter((f) => f.test).map((f) => f.path));
  // 테스트 파일이 직접 쓰는 파일 (정적) + 테스트 중 실제로 불린 파일 (런타임)
  const testedBy = new Map<string, number>();
  for (const e of data.edges) {
    if (tests.has(e.source) && !tests.has(e.target)) testedBy.set(e.target, (testedBy.get(e.target) ?? 0) + 1);
  }
  const usedBy = new Map<string, Set<string>>();
  for (const e of data.edges) {
    if (tests.has(e.source)) continue;
    if (!usedBy.has(e.target)) usedBy.set(e.target, new Set());
    usedBy.get(e.target)!.add(e.source);
  }
  // 이름 규칙: FooTest · FooTests · FooIT · FooSpec 은 Foo 를 테스트한다 (MockMvc 처럼 호출 간선이 안 잡히는 테스트)
  const testNames = new Set<string>();
  for (const t of tests) testNames.add(base(t).replace(/(Tests?|IT|Spec)$/, ""));
  const scores = ins.files
    .filter((f) => f.source && !f.test && (f.hotspot ?? 0) > 0)
    .map((f) => f.hotspot ?? 0)
    .sort((a, b) => b - a);
  const hotCut = Math.max(0.3, scores[Math.max(0, Math.ceil(scores.length * HOTSPOT_TOP) - 1)] ?? 1);
  const hidden = new Map<string, string[]>();
  for (const c of ins.couplings) {
    if (c.linked || c.support < 3 || c.confidence < COUPLING_CONFIDENCE) continue;
    hidden.set(c.a, [...(hidden.get(c.a) ?? []), c.b]);
    hidden.set(c.b, [...(hidden.get(c.b) ?? []), c.a]);
  }

  // 숨은 결합은 이력이 긴 레포일수록 흔하다. 결합 상대가 많은 상위 파일만 위험 신호로 본다
  const partnerCounts = [...hidden.values()].map((v) => v.length).sort((a, b) => b - a);
  const couplingCut = Math.max(2, partnerCounts[Math.max(0, Math.ceil(partnerCounts.length * HOTSPOT_TOP) - 1)] ?? 2);

  const files = new Map<string, FileZone>();
  const counts: Record<Zone, number> = { DELEGATE: 0, REVIEW: 0, OWN: 0 };
  for (const f of ins.files) {
    const reasons: Reason[] = [];
    if (f.test) {
      files.set(f.path, { path: f.path, zone: "DELEGATE", reasons: [{ kind: "tested", text: "테스트 코드" }], score: 0 });
      continue;
    }
    const sensitive = SENSITIVE.find((s) => s.pattern.test(f.path));
    if (sensitive) reasons.push({ kind: "sensitive", text: `${sensitive.label} 영역` });

    const staticTests = testedBy.get(f.path) ?? 0;
    const runtimeCalls = runtime?.calls.get(f.path) ?? 0;
    const named = testNames.has(base(f.path));
    const tested = staticTests > 0 || runtimeCalls > 0 || named;
    if (!tested && f.functions > 0) reasons.push({ kind: "untested", text: runtime ? "테스트가 쓰지도, 실행 중 지나가지도 않음" : "테스트가 직접 쓰지 않음" });

    const fanIn = usedBy.get(f.path)?.size ?? 0;
    if (fanIn >= HUB_MIN) reasons.push({ kind: "hub", text: `${fanIn}개 파일이 사용` });
    if ((f.hotspot ?? 0) >= hotCut) reasons.push({ kind: "hotspot", text: `핫스팟 (${f.history?.commits ?? 0}번 변경)` });
    const partners = hidden.get(f.path) ?? [];
    if (partners.length >= couplingCut) reasons.push({ kind: "coupling", text: `코드 의존 없이 함께 바뀌는 파일 ${partners.length}개` });
    if (tested) {
      reasons.push({
        kind: runtimeCalls > 0 ? "runtime" : "tested",
        text:
          runtimeCalls > 0
            ? `테스트 중 ${runtimeCalls}번 실행됨`
            : staticTests > 0
              ? `테스트 ${staticTests}개가 사용`
              : `${base(f.path)}Test 가 있음`,
      });
    }

    // 신호 하나만으로 리뷰 필수로 보내지 않는다: 테스트 없음은 2점, 나머지는 1점 (아주 많이 쓰이면 2점)
    const score = reasons.reduce(
      (sum, r) =>
        sum + (r.kind === "untested" ? 2 : r.kind === "hub" ? (fanIn >= HUB_MIN * 2 ? 2 : 1) : r.kind === "hotspot" || r.kind === "coupling" ? 1 : 0),
      0,
    );
    const zone: Zone = sensitive || (!tested && fanIn >= HUB_MIN) ? "OWN" : score >= 2 ? "REVIEW" : "DELEGATE";
    files.set(f.path, { path: f.path, zone, reasons, score: score + (sensitive ? 3 : 0) });
    if (f.source) counts[zone]++;
  }
  const code = ins.files
    .filter((f) => f.source && !f.test)
    .map((f) => files.get(f.path)!)
    .sort((a, b) => zoneRank(a.zone) - zoneRank(b.zone) || b.score - a.score || a.path.localeCompare(b.path));
  return { files, counts, code };
}

function zoneRank(z: Zone): number {
  return z === "OWN" ? 0 : z === "REVIEW" ? 1 : 2;
}

/** PR 이 건드린 파일의 구역 (리뷰 화면) */
export function touchedZones(delegation: Delegation, paths: string[]): FileZone[] {
  return paths
    .map((p) => delegation.files.get(p))
    .filter((z): z is FileZone => z !== undefined && !z.reasons.some((r) => r.text === "테스트 코드"))
    .sort((a, b) => zoneRank(a.zone) - zoneRank(b.zone));
}
