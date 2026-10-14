import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { api, ApiError } from "@/lib/api";
import { PollButton } from "./PollButton";
import { ProjectNav } from "./ProjectNav";

export const dynamic = "force-dynamic";

/**
 * 프로젝트 안 모든 화면의 틀. 상단 바 하나에 레포 이름, PR 이력 · 커밋 이력 전환, 그 갈래의 하위 탭, 지금 확인 · 설정을 둔다.
 * 3D · 그래프 전체 화면(.gx)도 이 바 아래에 들어와서 앱을 떠나지 않는다.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  let project;
  try {
    project = await api.getProject(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="shell">
      <header className="pbar">
        <Link href="/" className="pbar-brand" title="프로젝트 목록">
          <Logo />
        </Link>
        <Link href={`/projects/${id}`} className="pbar-repo" title={`${project.owner}/${project.name}`}>
          {project.name}
        </Link>
        <Suspense fallback={<nav className="pnav" />}>
          <ProjectNav id={id} />
        </Suspense>
        <div className="pbar-right">
          <PollButton projectId={id} />
          <Link href={`/projects/${id}/onboarding?step=4`} className="pbar-link">
            설정
          </Link>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
