"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Section = "pr" | "commit" | null;

/** 지금 주소가 어느 갈래인지: PR 이력(대기열 · PR · 리뷰) / 커밋 이력(코드 시티 · 그래프 · 에이전트 규칙) */
function sectionOf(path: string, base: string): Section {
  const rest = path.slice(base.length);
  if (/^\/(prs|reviews)(\/|$)/.test(rest)) return "pr";
  if (/^\/(commits|insights|graph|agents)(\/|$)/.test(rest)) return "commit";
  return null;
}

/** 상단 바 가운데: PR 이력 | 커밋 이력 전환과 지금 갈래의 하위 탭 */
export function ProjectNav({ id }: { id: number }) {
  const path = usePathname();
  const params = useSearchParams();
  const base = `/projects/${id}`;
  const section = sectionOf(path, base);
  const rest = path.slice(base.length);
  const tab = params.get("tab") ?? "city";

  const commitTabs = [
    { href: `${base}/commits`, label: "코드 시티", active: /^\/(commits|insights)/.test(rest) && tab === "city" },
    { href: `${base}/commits?tab=graph`, label: "커밋 그래프", active: /^\/commits/.test(rest) && tab === "graph" },
    { href: `${base}/commits?tab=hotspots`, label: "핫스팟", active: /^\/(commits|insights)/.test(rest) && tab === "hotspots" },
    { href: `${base}/commits?tab=coupling`, label: "숨은 결합", active: /^\/(commits|insights)/.test(rest) && tab === "coupling" },
    { href: `${base}/graph`, label: "코드 그래프", active: rest.startsWith("/graph") },
    { href: `${base}/agents`, label: "에이전트 규칙", active: rest.startsWith("/agents") },
  ];
  const pr = /^\/prs\/(\d+)/.exec(rest)?.[1];

  return (
    <nav className="pnav">
      <div className="pnav-switch" role="tablist">
        <Link href={`${base}/prs`} className={section === "pr" ? "active" : ""} role="tab" aria-selected={section === "pr"}>
          PR 이력
        </Link>
        <Link href={`${base}/commits`} className={section === "commit" ? "active" : ""} role="tab" aria-selected={section === "commit"}>
          커밋 이력
        </Link>
      </div>
      <Link href={`${base}/invariants`} className={rest === "/invariants" ? "active" : ""}>정합성 규칙</Link>
      {section === "commit" && (
        <div className="pnav-tabs">
          {commitTabs.map((t) => (
            <Link key={t.label} href={t.href} className={t.active ? "active" : ""}>
              {t.label}
            </Link>
          ))}
        </div>
      )}
      {section === "pr" && (
        <div className="pnav-tabs">
          <Link href={`${base}/prs`} className={rest === "/prs" ? "active" : ""}>
            대기열
          </Link>
          {pr && <span className="pnav-crumb">PR #{pr}</span>}
          {rest.startsWith("/reviews/") && <span className="pnav-crumb">리뷰</span>}
        </div>
      )}
    </nav>
  );
}
