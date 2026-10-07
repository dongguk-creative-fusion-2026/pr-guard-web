"use client";

import { useState } from "react";

/** 백엔드 com.prguard.ast.MethodAstDiff */
type Action = "INSERT" | "DELETE" | "UPDATE" | "MOVE";
type Edit = { action: Action; type: string; label: string | null; newLabel: string | null; baseLine: number; headLine: number; text: string };
type Signal = { kind: string; line: number; detail: string };
export type MethodAstDiff = {
  methodId: string;
  file: string;
  shape: "COSMETIC" | "RENAME" | "MOVE" | "LOGIC";
  counts: Partial<Record<Action, number>>;
  edits: Edit[];
  signals: Signal[];
  baseSource: string;
  headSource: string;
  baseStart: number;
  headStart: number;
};

const SHAPE: Record<MethodAstDiff["shape"], { label: string; desc: string }> = {
  LOGIC: { label: "로직 변경", desc: "동작이 달라질 수 있는 구조 변경" },
  RENAME: { label: "이름만 바뀜", desc: "변수 · 호출 이름만 바뀌고 구조는 그대로" },
  MOVE: { label: "위치만 옮김", desc: "코드 덩어리의 위치만 바뀜" },
  COSMETIC: { label: "겉모양만", desc: "주석 · 공백 · 형식만 바뀜" },
};

const ACTION: Record<Action, { label: string; cls: string }> = {
  UPDATE: { label: "수정", cls: "upd" },
  INSERT: { label: "삽입", cls: "ins" },
  DELETE: { label: "삭제", cls: "del" },
  MOVE: { label: "이동", cls: "mov" },
};

const SIGNAL: Record<string, string> = {
  THROW_TO_NULL: "예외 대신 null",
  EXCEPTION_REMOVED: "예외 경로 사라짐",
  NULL_CHECK_REMOVED: "null 검사 삭제",
  AUTH_REMOVED: "권한 검사 삭제",
  EXCEPTION_SWALLOWED: "예외 삼킴",
  CONDITION_CHANGED: "조건 변경",
};

/** com.a.PostService#getPost(Long) → PostService.getPost() */
function shortName(id: string): string {
  const hash = id.indexOf("#");
  const type = id.slice(0, hash);
  const method = id.slice(hash + 1);
  return `${type.slice(type.lastIndexOf(".") + 1)}.${method.slice(0, method.indexOf("(") < 0 ? undefined : method.indexOf("("))}()`;
}

/**
 * 구조 diff (GumTree): 줄 단위가 아니라 AST 노드 단위로 무엇이 수정 · 삽입 · 삭제 · 이동됐는지.
 * 메서드마다 변경 성격(로직 / 이름만 / 위치만 / 겉모양만)과 위험 패턴을 보여 준다.
 */
export function AstDiffView({ methods }: { methods: MethodAstDiff[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => (methods[0] ? { [methods[0].methodId]: true } : {}));
  if (methods.length === 0) return null;
  const byShape = (s: MethodAstDiff["shape"]) => methods.filter((m) => m.shape === s).length;
  return (
    <section className="ast">
      <h3>구조 diff</h3>
      <p className="muted">
        GumTree 로 바뀐 메서드의 구문 트리를 맞대어, 줄이 아니라 <b>코드 구조 단위</b>로 무엇이 바뀌었는지 봅니다. 이름 · 위치만 바뀐 메서드는 가볍게
        넘기고 로직 변경에 집중하세요.
      </p>
      <div className="ast-summary">
        {(["LOGIC", "RENAME", "MOVE", "COSMETIC"] as const).map((s) =>
          byShape(s) > 0 ? (
            <span key={s} className={`ast-shape ${s}`} title={SHAPE[s].desc}>
              {SHAPE[s].label} {byShape(s)}
            </span>
          ) : null,
        )}
      </div>
      {methods.map((m) => (
        <article key={m.methodId} className={`ast-card ${m.shape}`}>
          <button className="ast-head" onClick={() => setOpen((o) => ({ ...o, [m.methodId]: !o[m.methodId] }))}>
            <span className="ast-caret">{open[m.methodId] ? "▾" : "▸"}</span>
            <code>{shortName(m.methodId)}</code>
            <span className={`ast-shape ${m.shape}`}>{SHAPE[m.shape].label}</span>
            {(Object.keys(ACTION) as Action[]).map((a) =>
              m.counts[a] ? (
                <span key={a} className={`ast-count ${ACTION[a].cls}`}>
                  {ACTION[a].label} {m.counts[a]}
                </span>
              ) : null,
            )}
            {m.signals
              .filter((s) => s.kind !== "CONDITION_CHANGED")
              .map((s, i) => (
                <span key={i} className={`ast-signal ${s.kind}`}>
                  ⚠ {SIGNAL[s.kind] ?? s.kind}
                </span>
              ))}
          </button>
          {open[m.methodId] && <MethodDiff m={m} />}
        </article>
      ))}
      <p className="ast-legend">
        <span className="upd">수정</span>
        <span className="ins">삽입</span>
        <span className="del">삭제</span>
        <span className="mov">이동</span>
      </p>
    </section>
  );
}

function MethodDiff({ m }: { m: MethodAstDiff }) {
  // 라인 → 그 라인에 걸린 편집 (같은 라인에 여럿이면 삭제 · 삽입 > 수정 > 이동 순으로 색을 정한다)
  const rank: Action[] = ["DELETE", "INSERT", "UPDATE", "MOVE"];
  const mark = (side: "base" | "head") => {
    const map = new Map<number, Edit[]>();
    for (const e of m.edits) {
      const line = side === "base" ? e.baseLine : e.headLine;
      if (line <= 0) continue;
      if (side === "base" && e.action === "INSERT") continue;
      if (side === "head" && e.action === "DELETE") continue;
      map.set(line, [...(map.get(line) ?? []), e]);
    }
    return map;
  };
  const signalsAt = (side: "base" | "head") => {
    const map = new Map<number, Signal[]>();
    for (const s of m.signals) {
      const line = side === "head" ? s.line : -s.line;
      if (line > 0) map.set(line, [...(map.get(line) ?? []), s]);
    }
    return map;
  };
  const pane = (side: "base" | "head") => {
    const source = side === "base" ? m.baseSource : m.headSource;
    const start = side === "base" ? m.baseStart : m.headStart;
    const edits = mark(side);
    const signals = signalsAt(side);
    return (
      <div className="ast-pane">
        <div className="ast-pane-title">{side === "base" ? "base (바뀌기 전)" : "head (바뀐 뒤)"}</div>
        <pre>
          {source.split("\n").map((text, i) => {
            const line = start + i;
            const es = edits.get(line) ?? [];
            const top = rank.find((a) => es.some((e) => e.action === a));
            const sig = signals.get(line);
            return (
              <div
                key={i}
                className={`ast-line ${top ? ACTION[top].cls : ""} ${sig ? "sig" : ""}`}
                title={[...es.map((e) => describe(e)), ...(sig ?? []).map((s) => `⚠ ${SIGNAL[s.kind] ?? s.kind}: ${s.detail}`)].join("\n") || undefined}
              >
                <span className="ast-ln">{line}</span>
                <span className="ast-gutter">{sig ? "⚠" : top ? ACTION[top].label[0] : ""}</span>
                <span className="ast-code">{text || " "}</span>
              </div>
            );
          })}
        </pre>
      </div>
    );
  };
  const conditions = m.signals.filter((s) => s.kind === "CONDITION_CHANGED");
  return (
    <div className="ast-body">
      <div className="ast-panes">
        {pane("base")}
        {pane("head")}
      </div>
      {m.signals.some((s) => s.kind !== "CONDITION_CHANGED") && (
        <ul className="ast-signals">
          {m.signals
            .filter((s) => s.kind !== "CONDITION_CHANGED")
            .map((s, i) => (
              <li key={i}>
                <b>⚠ {SIGNAL[s.kind] ?? s.kind}</b> {s.detail}
                <span className="muted"> ({s.line > 0 ? `head ${s.line}행` : `base ${-s.line}행`})</span>
              </li>
            ))}
        </ul>
      )}
      {conditions.length > 0 && (
        <ul className="ast-conditions">
          {conditions.map((s, i) => (
            <li key={i}>
              조건 변경 <code>{s.detail}</code> <span className="muted">(head {s.line}행)</span>
            </li>
          ))}
        </ul>
      )}
      <ol className="ast-edits">
        {m.edits.slice(0, 20).map((e, i) => (
          <li key={i} className={ACTION[e.action].cls}>
            <b>{ACTION[e.action].label}</b> {describe(e)}
          </li>
        ))}
        {m.edits.length > 20 && <li className="muted">외 {m.edits.length - 20}개</li>}
      </ol>
    </div>
  );
}

function describe(e: Edit): string {
  const where = e.action === "INSERT" ? `head ${e.headLine}행` : e.action === "DELETE" ? `base ${e.baseLine}행` : `${e.baseLine}→${e.headLine}행`;
  if (e.action === "UPDATE" && e.label != null && e.newLabel != null) return `${e.type} ${e.label} → ${e.newLabel} (${where})`;
  return `${e.type} ${e.text} (${where})`;
}
