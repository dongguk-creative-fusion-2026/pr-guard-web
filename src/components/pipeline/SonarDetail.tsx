import { metricLabel, SONAR_METRICS, type SonarData, type SonarStage } from "@/lib/sonar";
import styles from "./Sonar.module.css";

/** 지적이 SonarCloud 에서 왔음을 표시하는 배지 */
export function SonarBadge() {
  return (
    <span className={styles.badge} title="SonarCloud 가 찾은 지적">
      SonarCloud
    </span>
  );
}

/** "new_coverage 62.5 (기준 LT 80)" → "새 코드 커버리지 62.5 (기준 LT 80)" */
function conditionText(c: string): string {
  const space = c.indexOf(" ");
  return space < 0 ? metricLabel(c) : metricLabel(c.slice(0, space)) + c.slice(space);
}

function GateTag({ gate }: { gate: string | undefined }) {
  const g = gate === "OK" || gate === "ERROR" ? gate : "NONE";
  const label = g === "OK" ? "Gate 통과" : g === "ERROR" ? "Gate 실패" : "Gate 없음";
  return <span className={`${styles.gate} ${styles[`gate${g}`]}`}>{label}</span>;
}

/** SonarCloud 가 이번 PR 에서 본 것: Gate · 지표 · 실패 조건 · 화면 링크 */
export function SonarSummary({ data, compact = false }: { data: SonarData; compact?: boolean }) {
  const measures = data.measures ?? {};
  const shown = SONAR_METRICS.filter((m) => measures[m.key] != null).slice(0, compact ? 4 : undefined);
  return (
    <>
      <div>
        <GateTag gate={data.gate} /> <span className="muted">추가한 줄의 이슈 {data.findings?.filter((f) => f.title !== "SonarCloud Quality Gate 실패").length ?? 0}건 · PR 전체 이슈 {data.issues ?? 0}건</span>
      </div>
      {shown.length > 0 && (
        <div className={styles.metrics}>
          {shown.map((m) => (
            <div key={m.key}>
              <b>
                {measures[m.key]}
                {m.unit}
              </b>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
      )}
      {(data.failedConditions ?? []).length > 0 && (
        <ul className={styles.conditions}>
          {data.failedConditions!.map((c) => (
            <li key={c}>{conditionText(c)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** 리뷰 결과 화면 오른쪽 카드. SonarCloud 를 쓰지 않은 리뷰면 이유를 보여 준다 */
export function SonarCard({ stage }: { stage: SonarStage | null }) {
  if (!stage) return null;
  const done = stage.status === "DONE" && stage.data;
  return (
    <div className="dv-card">
      <h3>
        SonarCloud <SonarBadge />
      </h3>
      <p className={styles.why}>head 러너가 테스트 뒤에 스캔해 올린 PR 분석. 커버리지 · 중복률 · 복잡도 · 이슈를 이번 PR 이 추가한 줄 기준으로 봅니다.</p>
      {done ? (
        <>
          <SonarSummary data={stage.data!} compact />
          {stage.data!.url && (
            <a href={stage.data!.url} target="_blank" rel="noreferrer" className="dv-btn">
              SonarCloud 에서 보기
            </a>
          )}
        </>
      ) : (
        <p className="dv-note">
          {stage.status === "SKIPPED" ? "건너뜀" : stage.status === "FAILED" ? "실패" : "진행 중"}
          {stage.message ? `: ${stage.message}` : ""}
        </p>
      )}
    </div>
  );
}

/** 파이프라인 SonarCloud 노드 상세 */
export function SonarStageDetail({ data }: { data: SonarData }) {
  return (
    <>
      <p className="muted">
        head 러너가 빌드 · 테스트 뒤 JaCoCo 커버리지와 함께 sonar-scanner 로 PR 분석을 올리고, SonarCloud 처리가 끝나면 이슈 · 지표 · Quality Gate 를 가져옵니다.
        이슈는 이번 PR 이 추가한 줄에 걸린 것만 지적으로 남깁니다.
      </p>
      <SonarSummary data={data} />
      {(data.findings ?? []).length === 0 ? (
        <div className="empty">추가한 줄에 걸린 이슈 없음</div>
      ) : (
        <ul className="finding-list">
          {data.findings!.map((f, i) => (
            <li key={`${f.title}-${i}`}>
              <span className={`sev ${f.severity}`}>{f.severity}</span> {f.title}{" "}
              <span className="muted">
                {f.file ? f.file.slice(f.file.lastIndexOf("/") + 1) : ""}
                {f.line != null && `:${f.line}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.url && (
        <a href={data.url} target="_blank" rel="noreferrer" className="ts-detail-link">
          SonarCloud 에서 보기 →
        </a>
      )}
    </>
  );
}
