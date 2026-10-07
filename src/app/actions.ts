"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export type FormState = { error?: string; message?: string; reviewId?: number };

export async function registerProject(_: FormState, form: FormData): Promise<FormState> {
  const url = String(form.get("url") ?? "").trim();
  if (!url) return { error: "레포 주소를 입력하세요" };
  let id: number;
  try {
    id = (await api.registerProject(url)).id;
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "등록에 실패했습니다" };
  }
  revalidatePath("/");
  // 등록하면 바로 온보딩(레포 확인 → 분석 → 브리핑 → 설정 → 첫 리뷰)으로 간다
  redirect(`/projects/${id}/onboarding`);
}

export async function saveSettings(projectId: number, commentEnabled: boolean, majorThreshold: number | null): Promise<FormState> {
  try {
    await api.updateSettings(projectId, commentEnabled, majorThreshold);
    revalidatePath(`/projects/${projectId}`);
    return { message: "저장했습니다" };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "설정 저장에 실패했습니다" };
  }
}

export async function finishOnboarding(projectId: number) {
  await api.finishOnboarding(projectId);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function pollNow(projectId: number): Promise<FormState> {
  try {
    const r = await api.pollNow(projectId);
    revalidatePath(`/projects/${projectId}`);
    if (r.error) return { error: r.error };
    if (r.notModified) return { message: "변경 없음" };
    return { message: `열린 PR ${r.openPulls}개 · 새 리뷰 ${r.queuedReviews}건` };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "폴링에 실패했습니다" };
  }
}

export async function rerunReview(projectId: number, prNumber: number): Promise<FormState> {
  try {
    const r = await api.rerun(projectId, prNumber);
    revalidatePath(`/projects/${projectId}`);
    return { message: `PR #${prNumber} 다시 리뷰 대기 (run ${r.run})`, reviewId: r.id };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "다시 리뷰 요청에 실패했습니다" };
  }
}

export async function rebuildGraph(projectId: number): Promise<FormState> {
  try {
    await api.rebuildGraph(projectId);
    revalidatePath(`/projects/${projectId}`);
    return { message: "그래프 다시 만드는 중" };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "그래프 요청에 실패했습니다" };
  }
}

export async function deleteProject(projectId: number) {
  await api.deleteProject(projectId);
  revalidatePath("/");
  redirect("/");
}

export async function createAgentsPull(projectId: number, content: string): Promise<{ url?: string; error?: string }> {
  try {
    const r = await api.createAgentsPull(projectId, content);
    revalidatePath(`/projects/${projectId}/agents`);
    return { url: r.url };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "PR 을 만들지 못했습니다" };
  }
}
