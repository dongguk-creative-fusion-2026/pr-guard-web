import { computeBriefing } from "@/components/graph/briefing";
import { computeInsights } from "@/components/insights/metrics";
import type { AgentsInfo, GraphData } from "./api";
import { fileName } from "./format";

const GROUPS = 8;
const HOT = 5;
const COUPLINGS = 8;
/** 함께 바뀜 규칙으로 쓸 최소 기준: 3번 이상, 덜 바뀐 쪽이 바뀔 때 60% 이상 같이 바뀜 */
const MIN_SUPPORT = 3;
const MIN_CONFIDENCE = 0.6;

/** 초안 각 부분이 어디서 왔는지 (화면에서 근거로 보여 준다) */
export type AgentsDraft = {
  markdown: string;
  sources: { section: string; from: string }[];
};

const code = (s: string) => "`" + s + "`";

/**
 * AI 코딩 에이전트용 레포 규칙(AGENTS.md) 초안.
 * 레포 그래프(GitNexus) · git 이력 · 빌드 파일에서 확인한 사실로 레포별 부분을 채우고,
 * AI 코드에서 자주 생기는 문제(테스트 약화 · 요청하지 않은 변경 · 큰 PR)를 막는 공통 규칙을 붙인다.
 */
export function buildAgentsMd(repo: string, data: GraphData, info: AgentsInfo, commitSha: string | null): AgentsDraft {
  const b = computeBriefing(data);
  const ins = computeInsights(data);
  const sources: AgentsDraft["sources"] = [];
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  push(
    "# AGENTS.md",
    "",
    `이 파일은 AI 코딩 에이전트(Claude Code · Codex · Cursor 등)가 ${code(repo)} 에서 작업할 때 지켜야 할 규칙입니다.`,
    `사람 기여자에게도 같은 규칙이 적용됩니다.`,
    "",
    `> PR Guard 가 레포 분석으로 만든 초안입니다${commitSha ? ` (${code(commitSha.slice(0, 7))} 기준)` : ""}. 팀에 맞게 고쳐 쓰세요.`,
    "",
  );

  // 빌드 · 테스트
  const { build } = info;
  push("## 빌드 · 테스트", "");
  if (build.build && build.test) {
    push(`- 빌드: ${code(build.build)}`, `- 테스트: ${code(build.test)}`);
    if (build.java) push(`- Java ${build.java}`);
    sources.push({ section: "빌드 · 테스트", from: `루트의 ${build.tool === "gradle" ? "Gradle" : build.tool === "maven" ? "Maven" : "npm"} 빌드 파일` });
  } else {
    push("- 빌드 · 테스트 명령을 여기에 적어 주세요 (PR Guard 가 빌드 도구를 찾지 못했습니다).");
  }
  push(
    "- 코드를 바꾼 뒤에는 반드시 테스트를 돌려 통과를 확인하고, 실행한 명령과 결과를 PR 본문에 적습니다.",
    "- 테스트가 실패하면 테스트를 고치기 전에 코드가 맞는지 먼저 확인합니다.",
    "",
  );

  // 구조
  push("## 구조", "");
  push(`파일 ${b.files}개 · 함수 ${b.functions}개 · 호출 ${b.calls}개. 기능 묶음(서로 많이 호출하는 파일 모음):`, "");
  for (const g of b.groups.slice(0, GROUPS)) {
    push(`- **${g.label}** — 파일 ${g.files}개${g.topFile ? `, 중심 파일 ${code(g.topFile)}` : ""}`);
  }
  push("");
  if (b.layers.length >= 2) {
    push(
      `레이어: ${b.layers.map((l) => `${l.name}(${l.files})`).join(" → ")}.`,
      "새 코드는 같은 역할의 기존 코드와 같은 레이어 · 패키지에 둡니다. 아래 레이어가 위 레이어를 부르지 않게 합니다.",
      "",
    );
  }
  if (b.entryPoints.length > 0) {
    push("요청 처리 · 실행 시작점 (여기서부터 읽으면 흐름이 보입니다):", "");
    for (const e of b.entryPoints) push(`- ${code(e.name)} — ${code(e.file)}`);
    push("");
  }
  sources.push({ section: "구조", from: "GitNexus 코드 그래프 (기능 묶음 · 호출 관계)" });

  // 조심할 곳
  push("## 바꿀 때 조심할 곳", "");
  if (b.hubFiles.length > 0) {
    push("많은 파일이 쓰는 파일 — 바꾸면 영향이 넓습니다. 쓰는 곳을 모두 확인하고, 공개 메서드 시그니처는 바꾸지 않습니다:", "");
    for (const h of b.hubFiles) push(`- ${code(h.path)} (${h.usedBy}개 파일이 사용)`);
    push("");
  }
  if (b.hotFunctions.length > 0) {
    push("많이 호출되는 함수 — 동작을 바꾸면 호출하는 쪽과 테스트를 함께 고칩니다:", "");
    for (const f of b.hotFunctions) push(`- ${code(f.name)} — ${code(fileName(f.file))} (호출 ${f.callers}곳)`);
    push("");
  }
  const hotspots = ins.files
    .filter((f) => f.source && !f.test && (f.hotspot ?? 0) > 0.3)
    .sort((a, b2) => (b2.hotspot ?? 0) - (a.hotspot ?? 0))
    .slice(0, HOT);
  if (hotspots.length > 0) {
    push("핫스팟 — 자주 바뀌고 큰 파일입니다. 작게 나눠 고치고, 고치는 김에 다른 정리를 섞지 않습니다:", "");
    for (const f of hotspots) push(`- ${code(f.path)} (${f.history?.commits ?? 0}번 변경, ${f.lines}줄)`);
    push("");
    sources.push({ section: "핫스팟", from: `git 이력 최근 ${ins.commits}커밋 × 파일 크기` });
  }

  // 함께 바뀌는 파일
  const couplings = ins.couplings
    .filter((c) => c.support >= MIN_SUPPORT && c.confidence >= MIN_CONFIDENCE)
    .sort((a, c) => Number(a.linked) - Number(c.linked) || c.confidence - a.confidence)
    .slice(0, COUPLINGS);
  if (couplings.length > 0) {
    push(
      "## 함께 바뀌어야 하는 파일",
      "",
      "git 이력상 거의 항상 같이 바뀐 파일입니다. 한쪽을 고치면 다른 쪽도 고쳐야 하는지 확인합니다.",
      "",
    );
    for (const c of couplings) {
      push(
        `- ${code(c.a)} ↔ ${code(c.b)} — ${c.support}번 함께 변경 (${Math.round(c.confidence * 100)}%)${c.linked ? "" : " · 코드 의존이 없어 놓치기 쉬움"}`,
      );
    }
    push("");
    sources.push({ section: "함께 바뀌어야 하는 파일", from: "git 이력 동시 변경 통계" });
  }

  // 테스트 규칙
  push("## 테스트", "");
  const testRoot = data.nodes.some((n) => n.id.includes("src/test/java/"))
    ? "테스트는 `src/test/java` 아래, 대상 클래스와 같은 패키지에 `{클래스}Test` 로 둡니다."
    : null;
  if (testRoot) push(`- ${testRoot}`);
  if (b.tests.sourceFiles > 0) {
    push(`- 지금 테스트가 직접 쓰는 소스 파일은 ${b.tests.covered}/${b.tests.sourceFiles}개입니다. 테스트가 없는 곳을 바꾸면 테스트를 먼저 추가합니다.`);
  }
  push(
    "- 동작을 바꾸면 그 동작을 확인하는 테스트를 추가하거나 고칩니다. 버그를 고치면 그 버그를 재현하는 테스트를 먼저 씁니다.",
    "- **테스트를 지우거나, assert 를 약하게 하거나, `@Disabled` · skip 을 붙여서 통과시키지 않습니다.** 필요하면 PR 본문에 이유를 적고 사람에게 확인받습니다.",
    "- 외부 서비스 · 시간 · 난수에 기대는 테스트를 만들지 않습니다.",
    "",
  );
  sources.push({ section: "테스트", from: "그래프의 테스트 파일 + AI 에이전트의 테스트 약화 사례" });

  // PR 규칙
  push(
    "## PR",
    "",
    "- PR 하나에는 목적 하나만 담습니다. 크면 나눕니다 (큰 PR 은 리뷰가 늦어지고 배포 안정성을 떨어뜨립니다).",
    "- 본문에 **무엇을 왜 바꿨는지**, **동작이 바뀌는지**, 실행한 테스트를 적습니다. PR Guard 가 설명과 실제 변경 · 실행 결과를 대조합니다.",
    "- 요청받지 않은 리팩터링 · 이름 바꾸기 · 포맷 변경을 섞지 않습니다.",
    "- 비밀값(토큰 · 비밀번호 · 키)을 코드와 설정 파일에 넣지 않습니다.",
    "- 새 의존성을 추가하면 이유를 적습니다.",
    "",
  );
  sources.push({ section: "PR", from: "AI 코드 품질 연구 (DORA · Faros · CodeRabbit) 기반 공통 규칙" });

  return { markdown: out.join("\n"), sources };
}
