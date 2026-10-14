"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="login-form">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="token">접속 토큰</label>
      <input
        id="token"
        type="password"
        name="token"
        autoComplete="current-password"
        autoFocus
        required
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "token-error" : undefined}
      />
      {state.error && (
        <p id="token-error" className="error" role="alert">
          {state.error}
        </p>
      )}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "확인 중…" : "인증"}
      </button>
    </form>
  );
}
