import Link from "next/link";

/**
 * 화면을 그리지 못했을 때 (오류 · 없음 · 불러오는 중) 본문 자리에 두는 안내.
 * tone: danger = 실패, muted = 없음 · 대기
 */
export function StatusScreen({
  tone = "muted",
  title,
  detail,
  children,
}: {
  tone?: "danger" | "muted";
  title: string;
  detail?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main className={`status-screen ${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <h1>{title}</h1>
      {detail && <p className="status-detail">{detail}</p>}
      {children && <div className="status-actions">{children}</div>}
    </main>
  );
}

/** 불러오는 중: 화면이 비어 보이지 않게 스피너와 한 줄 */
export function LoadingScreen({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <main className="status-screen muted loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </main>
  );
}

export function HomeLink() {
  return (
    <Link href="/" className="status-link">
      프로젝트 목록으로
    </Link>
  );
}
