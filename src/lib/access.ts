// 접속 토큰: ACCESS_TOKEN 이 있으면 화면 전체를 토큰 입력 뒤로 둔다 (proxy.ts). 없으면 누구나 본다 (로컬 개발).
// 쿠키에는 토큰 대신 그 해시를 담는다. 토큰을 바꾸면 기존 쿠키는 모두 무효가 된다.

export const ACCESS_COOKIE = "prguard_access";
/** 로그인 유지 기간 (초) */
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

export function accessToken(): string | null {
  const token = process.env.ACCESS_TOKEN?.trim();
  return token ? token : null;
}

/** 쿠키에 담는 값: sha256("pr-guard-access:" + 토큰) */
export async function accessCookieValue(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pr-guard-access:${token}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 길이가 같을 때 앞에서 틀려도 끝까지 비교한다 */
export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 로그인 뒤 돌아갈 주소. 같은 사이트 경로만 받는다 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/login")) {
    return "/";
  }
  return next;
}
