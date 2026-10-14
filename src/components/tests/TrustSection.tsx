import type { Finding } from "@/lib/api";
import { killedStatus, mutantLabel, shortTest, type MutationData } from "@/lib/trust";

/**
 * 테스트 신뢰도: "테스트가 통과했다"가 아니라 "테스트가 버그를 실제로 잡느냐".
 * 변경분 변이 테스트(바뀐 메서드에 심은 버그를 잡았나) · flaky(다시 돌리면 통과) · 정적 검사(테스트 약화 · 검증 없음)
 */
export function TrustSection({
  mutation,
  mutationNote,
  flaky,
  findings,
}: {
  mutation: MutationData | null;
  /** 변이 테스트를 못 했을 때 이유 (단계 기록 메시지) */
  mutationNote: string | null;
  flaky: string[];
  findings: Finding[];
}) {
  const staticFindings = findings.filter((f) => f.ruleId.startsWith("TEST_") || f.ruleId === "EXEC_FLAKY_TEST");
  const covered = mutation ? mutation.killed + mutation.survived : 0;
  return (
    <section className="tr" aria-label="테스트 신뢰도">
      <header className="ts-sec-head">
        <h2>테스트 신뢰도</h2>
        <p className="ts-note">통과했는지가 아니라, 바뀐 코드에 버그를 심었을 때 테스트가 실제로 잡는지 봅니다.</p>
      </header>

      <div className="tr-stats">
        <div className={`tr-stat ${mutation && mutation.score >= 0 ? (mutation.score >= 80 ? "ok" : mutation.score >= 50 ? "warn" : "bad") : ""}`}>
          <b>{mutation && mutation.score >= 0 ? `${mutation.score}%` : "–"}</b>
          <span>변이 점수 (지나간 버그 중 잡은 비율)</span>
        </div>
        <div className="tr-stat ok">
          <b>{mutation?.killed ?? "–"}</b>
          <span>잡은 버그</span>
        </div>
        <div className={`tr-stat ${mutation && mutation.survived > 0 ? "bad" : ""}`}>
          <b>{mutation?.survived ?? "–"}</b>
          <span>놓친 버그 (테스트가 지나갔는데 통과)</span>
        </div>
        <div className="tr-stat">
          <b>{mutation?.uncovered ?? "–"}</b>
          <span>안 닿은 버그 (지나가는 테스트 없음)</span>
        </div>
      </div>

      {!mutation && <p className="ts-note">변경분 변이 테스트 결과 없음{mutationNote ? `: ${mutationNote}` : ""}</p>}
      {mutation && covered === 0 && <p className="ts-note">바뀐 메서드를 지나가는 테스트가 없어 심은 버그가 모두 그대로 남았습니다.</p>}

      {mutation && mutation.methods.length > 0 && (
        <ul className="tr-methods">
          {mutation.methods.map((m) => (
            <li key={m.id} className="tr-method">
              <div className="tr-method-head">
                <b className="mono">{m.id}</b>
                <span className="tr-count">
                  잡음 {m.killed} · <span className={m.survived ? "bad" : ""}>놓침 {m.survived}</span> · 안 닿음 {m.uncovered}
                </span>
              </div>
              <div className="tr-bar" role="img" aria-label={`잡음 ${m.killed}, 놓침 ${m.survived}, 안 닿음 ${m.uncovered}`}>
                <i className="k" style={{ flex: m.killed || 0.0001 }} />
                <i className="s" style={{ flex: m.survived || 0.0001 }} />
                <i className="u" style={{ flex: m.uncovered || 0.0001 }} />
              </div>
              <ul className="tr-mutants">
                {m.mutants.map((x, i) => {
                  const killed = killedStatus(x.status);
                  const survived = x.status === "SURVIVED";
                  return (
                    <li key={`${x.line}-${x.mutator}-${i}`} className={killed ? "k" : survived ? "s" : "u"}>
                      <span className="tr-icon" aria-hidden="true" />
                      <span className="tr-what">{mutantLabel(x)}</span>
                      <span className="tr-who mono">
                        {killed
                          ? `막음 ← ${x.killers[0] ? shortTest(x.killers[0]) : "테스트"}`
                          : survived
                            ? `통과해 버림 · ${x.covering[0] ? shortTest(x.covering[0]) : "지나간 테스트"}`
                            : "지나가는 테스트 없음"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {(flaky.length > 0 || staticFindings.length > 0) && (
        <ul className="tr-flags">
          {flaky.map((n) => (
            <li key={n} className="warn">
              <span className="ts-chip changed">흔들림</span> <span className="mono">{shortTest(n)}</span> 실패했다가 다시 돌리니 통과 · 회귀로 세지 않음
            </li>
          ))}
          {staticFindings
            .filter((f) => f.ruleId !== "EXEC_FLAKY_TEST")
            .map((f) => (
              <li key={f.id} className={f.severity === "MAJOR" ? "bad" : "warn"}>
                <span className={`ts-chip ${f.severity === "MAJOR" ? "bad" : "changed"}`}>{f.severity === "MAJOR" ? "약화" : "약함"}</span> {f.title}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
