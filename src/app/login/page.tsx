import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { accessToken, safeNext } from "@/lib/access";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "인증 · PR Guard" };

/** 입구의 토큰 입력 화면. 접속 토큰은 팀에서 따로 받는다 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (!accessToken()) redirect(next);
  return (
    <main className="login">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <Logo size={22} /> PR Guard
        </div>
        <h1 id="login-title">인증</h1>
        <p className="login-help">팀에서 받은 접속 토큰을 붙여 넣으세요.</p>
        <LoginForm next={next} />
      </section>
    </main>
  );
}
