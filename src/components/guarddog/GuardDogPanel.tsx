import type { ReactNode } from "react";
import { GUARDDOG_PACKAGE_STATUS, GUARDDOG_REASON, GUARDDOG_STATUS, guarddogNeedsAttention, type GuardDogProblem, type GuardDogReport } from "@/lib/guarddog";
import styles from "./GuardDogPanel.module.css";

const RISK_LABEL = { low: "낮음", medium: "중간", high: "높음" };

/** Shared by the saved review and CHECK_C live/replay details. Text is rendered without HTML. */
export function GuardDogPanel({ report, action }: { report: GuardDogReport | null; action?: ReactNode }) {
  const attention = guarddogNeedsAttention(report);
  const meta = report ? GUARDDOG_STATUS[report.status] : null;
  return (
    <section className={styles.panel} data-attention={attention || undefined} aria-label="GuardDog 의존성 검사">
      <div className={styles.header}>
        <h2>의존성 검사 <span>GuardDog</span></h2>
        <span className={styles.status} data-status={report?.status ?? "MISSING"}>{meta?.label ?? "검사 기록 없음"}</span>
      </div>
      <p className={styles.note}>{meta?.note ?? "이 리뷰에는 GuardDog 검사 기록이 없습니다. 새 리뷰를 실행하면 현재 설정으로 검사합니다."}</p>
      <p className={styles.scope}>검사 범위: 이번 PR에서 추가·변경된 npm·PyPI 직접 의존성. 전체 의존성의 안전을 보장하지 않습니다.</p>
      {report && (
        <>
          {report.status !== "DISABLED" && (
            <dl className={styles.counts} aria-label="의존성 검사 집계">
              {([
                ["대상 패키지", report.counts.total], ["완료", report.counts.completed],
                ["일부 미완료", report.counts.partial], ["실패", report.counts.failed],
                ["건너뜀", report.counts.skipped], ["위험 신호", report.counts.risks],
              ] as const).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
            </dl>
          )}
          {attention && report.counts.risks === 0 && <p className={styles.warning}>발견된 위험 신호가 0건이어도 검증이 끝난 것은 아닙니다.</p>}
          <Problems problems={report.problems} />
          {report.packages.length > 0 && (
            <div className={styles.packages}>
              <p className={styles.hint}>패키지를 펼치면 선언 파일·위험 신호·실패 원인을 볼 수 있습니다. 같은 이름·버전은 한 번 집계합니다.</p>
              {report.packages.map((pkg, i) => (
                <details key={`${pkg.ecosystem}:${pkg.name}:${pkg.version}:${i}`} className={styles.package}>
                  <summary>
                    <span className={styles.identity}><span className={styles.ecosystem}>{pkg.ecosystem === "pypi" ? "PyPI" : "npm"}</span><code>{pkg.name ?? "이름 확인 불가"}<span className={styles.version}>@{pkg.version ?? "버전 미확정"}</span></code></span>
                    <span className={styles.result}><span className={styles.status} data-status={pkg.status}>{GUARDDOG_PACKAGE_STATUS[pkg.status]}</span><span>위험 {pkg.risks.length}</span></span>
                  </summary>
                  <div className={styles.body}>
                    <h3>선언 파일</h3>
                    <ul className={styles.files}>{pkg.files.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
                    {pkg.risks.length > 0 ? (
                      <>
                        <h3>위험 신호</h3>
                        <ul className={styles.risks}>{pkg.risks.map((risk, j) => (
                          <li key={`${risk.rule}:${j}`}><span className={styles.status} data-severity={risk.severity}>위험도 {RISK_LABEL[risk.severity] ?? risk.severity}</span> <code>{risk.rule}</code><p>{risk.description}</p></li>
                        ))}</ul>
                      </>
                    ) : <p className={styles.note}>{pkg.status === "COMPLETED" ? "이 패키지에서 보고된 위험 신호가 없습니다." : "검사가 미완료되어 위험 신호 유무를 확정할 수 없습니다."}</p>}
                    <Problems problems={pkg.problems} />
                  </div>
                </details>
              ))}
            </div>
          )}
          {report.durationMs > 0 && <p className={styles.hint}>검사 소요 {(report.durationMs / 1000).toFixed(1)}초</p>}
        </>
      )}
      {(attention || !report) && action && <div className={styles.action}><span>원인을 해결한 뒤 PR 전체를 다시 검사합니다.</span>{action}</div>}
    </section>
  );
}

function Problems({ problems }: { problems: GuardDogProblem[] }) {
  if (problems.length === 0) return null;
  return <ul className={styles.problems}>{problems.map((problem, i) => (
    <li key={`${problem.code}:${problem.file}:${i}`}><strong>{GUARDDOG_REASON[problem.code] ?? problem.code}</strong>{problem.file && <code>{problem.file}</code>}<p>{problem.message}</p></li>
  ))}</ul>;
}
