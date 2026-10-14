import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessCookieValue, accessToken, sameString } from "@/lib/access";

/** 접속 토큰이 없으면 모든 화면 · 서버 액션 · API 중계를 /login 으로 돌린다 */
export async function proxy(request: NextRequest) {
  const token = accessToken();
  if (!token) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  if (cookie && sameString(cookie, await accessCookieValue(token))) return NextResponse.next();

  // 화면이 아닌 요청(SSE 중계 · 서버 액션)은 이동 대신 401
  if (pathname.startsWith("/api/") || request.headers.has("next-action")) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // 정적 파일 · 이미지 · 아이콘은 그대로
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
