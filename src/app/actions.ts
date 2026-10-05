"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export type FormState = { error?: string; message?: string };

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
  redirect(`/projects/${id}`);
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

export async function deleteProject(projectId: number) {
  await api.deleteProject(projectId);
  revalidatePath("/");
  redirect("/");
}
