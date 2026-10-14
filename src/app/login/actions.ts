"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, accessCookieValue, accessToken, safeNext, sameString } from "@/lib/access";

export type LoginState = { error?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const expected = accessToken();
  const next = safeNext(String(form.get("next") ?? ""));
  if (!expected) redirect(next);

  const given = String(form.get("token") ?? "").trim();
  if (!given) return { error: "토큰을 입력하세요" };
  // 길이가 드러나지 않게 해시끼리 비교한다
  const [a, b] = await Promise.all([accessCookieValue(given), accessCookieValue(expected)]);
  if (!sameString(a, b)) return { error: "토큰이 맞지 않습니다" };

  (await cookies()).set(ACCESS_COOKIE, b, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(ACCESS_COOKIE);
  redirect("/login");
}
