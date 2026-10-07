/** 백엔드 BehaviorDiff.Row: 관측 테스트가 같은 입력으로 base · head 에서 남긴 결과 */
export type BehaviorRow = {
  target: string;
  probe: string;
  label: string;
  base: string | null;
  head: string | null;
  changed: boolean;
};

/** com.a.Foo#bar(Long) → Foo#bar(Long) */
function shortMethod(id: string): string {
  const hash = id.indexOf("#");
  const type = hash < 0 ? id : id.slice(0, hash);
  return type.slice(type.lastIndexOf(".") + 1) + (hash < 0 ? "" : id.slice(hash));
}

function Out({ value }: { value: string | null }) {
  if (value === null) return <span className="bd-none">실행 안 됨</span>;
  const thrown = value.startsWith("throws ");
  return (
    <code className={`bd-out ${thrown ? "thrown" : value === "null" ? "null" : ""}`} title={value}>
      {thrown ? `⚡ ${value.slice(7)}` : value}
    </code>
  );
}

/**
 * 동작 diff: 코드 diff 대신 "같은 입력에 대해 결과가 어떻게 달라졌는지" 를 표로 보여 준다.
 * 바뀐 메서드마다 묶고, 결과가 달라진 입력을 위로 올린다.
 */
export function BehaviorDiffTable({ rows, compact = false }: { rows: BehaviorRow[]; compact?: boolean }) {
  if (rows.length === 0) return null;
  const groups = new Map<string, BehaviorRow[]>();
  for (const r of rows) groups.set(r.target, [...(groups.get(r.target) ?? []), r]);
  return (
    <div className={`bd ${compact ? "compact" : ""}`}>
      {[...groups.entries()].map(([target, list]) => {
        const changed = list.filter((r) => r.changed).length;
        const sorted = [...list].sort((a, b) => Number(b.changed) - Number(a.changed));
        return (
          <section key={target} className="bd-group">
            <div className="bd-head">
              <code>{shortMethod(target)}</code>
              <span className={`bd-count ${changed > 0 ? "on" : ""}`}>
                같은 입력 {list.length}개 중 <b>{changed}</b>개 결과가 달라짐
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>입력</th>
                  <th>base (바뀌기 전)</th>
                  <th />
                  <th>head (이 PR)</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.probe + r.label} className={r.changed ? "changed" : ""}>
                    <td className="bd-label">{r.label}</td>
                    <td>
                      <Out value={r.base} />
                    </td>
                    <td className="bd-arrow">{r.changed ? "≠" : "="}</td>
                    <td>
                      <Out value={r.head} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
