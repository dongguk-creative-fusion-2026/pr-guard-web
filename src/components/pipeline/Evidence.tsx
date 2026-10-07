"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

/** 백엔드 EvidenceVerdict.view() */
export type EvidenceView = {
  className: string;
  target: string;
  intent: string;
  code: string;
  kind: "PROVEN" | "NO_CHANGE" | "INVALID" | "NOT_RUN";
  base: "PASSED" | "FAILED" | "NOT_RUN";
  head: "PASSED" | "FAILED" | "NOT_RUN";
  baseMessage: string | null;
  headMessage: string | null;
};

type GeneratedTest = { className: string; path: string; target: string; intent: string; code: string };

type Coverage = { id: string; kind: string; file: string; calls: number; tests: string[]; testCount: number };

const KIND: Record<EvidenceView["kind"], { label: string; desc: string }> = {
  PROVEN: { label: "동작 변화 증명", desc: "base 에서 통과하고 head 에서 실패 — 이 PR 이 동작을 바꿨습니다" },
  NO_CHANGE: { label: "변화 없음", desc: "양쪽 모두 통과 — 겨냥한 동작은 그대로입니다" },
  INVALID: { label: "테스트 무효", desc: "base 에서부터 실패 — 원래 동작을 잘못 짚은 테스트라 증거로 쓰지 않습니다" },
  NOT_RUN: { label: "실행 못 함", desc: "컴파일되지 않았거나 한쪽에서 결과가 없습니다" },
};

const OUTCOME: Record<EvidenceView["base"], string> = { PASSED: "통과", FAILED: "실패", NOT_RUN: "—" };

/** com.a.Foo#bar(Long) → Foo#bar(Long) */
function shortMethod(id: string): string {
  const hash = id.indexOf("#");
  const type = hash < 0 ? id : id.slice(0, hash);
  return type.slice(type.lastIndexOf(".") + 1) + (hash < 0 ? "" : id.slice(hash));
}

function simpleName(className: string): string {
  return className.slice(className.lastIndexOf(".") + 1);
}

/** 접었다 펴는 소스. 주석 · 어노테이션 · 키워드에 옅게 색을 입힌다 */
function Code({ code, open: initial = false }: { code: string; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="ev-code">
      <button className="ev-code-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "▾ 테스트 코드 접기" : `▸ 테스트 코드 보기 (${code.split("\n").length}줄)`}
      </button>
      {open && (
        <pre>
          {code.split("\n").map((line, i) => (
            <div key={i} className="ev-line">
              <span className="ev-ln">{i + 1}</span>
              <span className={lineClass(line)}>{line || " "}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

function lineClass(line: string): string {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "ev-c";
  if (t.startsWith("@")) return "ev-a";
  if (/\bassert\w*\(/.test(t)) return "ev-k";
  return "";
}

/** EXEC_EVIDENCE 상세: 만든 증거 테스트 */
export function GeneratedTests({ data }: { data: { generator?: string; targets?: string[]; tests?: GeneratedTest[] } }) {
  const tests = data.tests ?? [];
  return (
    <>
      <p className="muted">
        바뀐 메서드마다 <b>base 에서 통과하고 head 에서 실패해야 하는</b> 테스트를 만들어 레포 테스트와 함께 돌립니다 (Meta ACH 방식).
        {data.generator && ` 생성: ${data.generator}`}
      </p>
      {tests.length === 0 ? (
        <div className="empty">동작이 바뀌었다고 볼 메서드가 없어 테스트를 만들지 않았습니다</div>
      ) : (
        <div className="ev-list">
          {tests.map((t, i) => (
            <motion.div
              key={t.className}
              className="ev-card"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="ev-head">
                <code>{simpleName(t.className)}</code>
                <span className="muted">→ {shortMethod(t.target)}</span>
              </div>
              {t.intent && <p className="ev-intent">{t.intent}</p>}
              <Code code={t.code} />
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}

/** EXEC_DIFF 의 증거 테스트 판정 + 바뀐 메서드를 지나간 테스트 */
export function EvidenceVerdicts({
  evidence,
  coverage,
  traced,
  projectId,
}: {
  evidence: EvidenceView[];
  coverage: Coverage[];
  traced: boolean;
  projectId?: number;
}) {
  return (
    <>
      {evidence.length > 0 && (
        <>
          <h3>증거 테스트</h3>
          <div className="ev-list">
            {evidence.map((e, i) => (
              <motion.div
                key={e.className}
                className={`ev-card ev-${e.kind}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="ev-head">
                  <span className={`ev-kind ev-kind-${e.kind}`}>{KIND[e.kind].label}</span>
                  <code>{shortMethod(e.target)}</code>
                </div>
                {e.intent && <p className="ev-intent">{e.intent}</p>}
                <div className="ev-sides">
                  <div className={`ev-side ${e.base}`}>
                    <span>base</span>
                    <b>{OUTCOME[e.base]}</b>
                  </div>
                  <div className="ev-arrow">→</div>
                  <div className={`ev-side ${e.head}`}>
                    <span>head</span>
                    <b>{OUTCOME[e.head]}</b>
                  </div>
                </div>
                <p className="muted ev-desc">{KIND[e.kind].desc}</p>
                {e.kind === "PROVEN" && e.headMessage && <pre className="ev-failure">{e.headMessage}</pre>}
                {e.kind === "INVALID" && e.baseMessage && <pre className="ev-failure">{e.baseMessage}</pre>}
                <Code code={e.code} />
              </motion.div>
            ))}
          </div>
        </>
      )}

      {coverage.length > 0 && (
        <>
          <h3>바뀐 메서드를 실제로 지나간 테스트</h3>
          {!traced ? (
            <p className="muted">호출 기록이 없어 확인하지 못했습니다</p>
          ) : (
            <ul className="cov-list">
              {coverage.map((c) => (
                <li key={c.id} className={c.testCount === 0 ? "cov-none" : ""}>
                  <div className="cov-head">
                    <code>{shortMethod(c.id)}</code>
                    {c.testCount === 0 ? (
                      <span className="sev MINOR">테스트 없음</span>
                    ) : (
                      <span className="muted">
                        테스트 {c.testCount}개 · {c.calls}번 실행
                      </span>
                    )}
                  </div>
                  {c.tests.length > 0 && (
                    <div className="cov-tests">
                      {c.tests.map((t) => (
                        <span key={t} title={t}>
                          🧪 {shortMethod(t)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {traced && projectId !== undefined && (
            <p className="ev-links">
              <Link href={`/projects/${projectId}/graph?runtime=1`}>⚡ 코드 그래프에서 런타임 보기</Link>
              <Link href={`/projects/${projectId}/insights?tab=city&mode=runtime`}>🏙️ 코드 시티에서 런타임 보기</Link>
            </p>
          )}
        </>
      )}
    </>
  );
}
