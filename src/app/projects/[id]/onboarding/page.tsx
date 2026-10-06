import { notFound } from "next/navigation";
import { api, ApiError, type RepoInfo } from "@/lib/api";
import { Onboarding } from "./Onboarding";

export const dynamic = "force-dynamic";

/** 등록 직후 화면: 레포 확인 → 분석 → 브리핑 → 리뷰 설정 → 첫 리뷰 */
export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const id = Number((await params).id);
  // ?step=1~5 로 특정 단계부터 연다 (프로젝트 화면의 설정 · 브리핑 링크)
  const step = Math.min(Math.max(Number((await searchParams).step ?? 1) - 1, 0), 4) || 0;
  if (!Number.isInteger(id)) notFound();

  let data;
  try {
    data = await Promise.all([api.getProject(id), api.getGraph(id), api.listPulls(id), api.listReviews(id, 20)]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [project, graph, pulls, reviews] = data;
  // GitHub 정보는 못 가져와도 온보딩은 계속한다 (rate limit 등)
  let repo: RepoInfo | null = null;
  try {
    repo = await api.getRepoInfo(id);
  } catch {
    repo = null;
  }
  return <Onboarding project={project} graph={graph} repo={repo} pulls={pulls} reviews={reviews} initialStep={step} />;
}
