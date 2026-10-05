"use client";

import { useActionState } from "react";
import { registerProject, type FormState } from "./actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(registerProject, {});
  return (
    <form action={action}>
      <div className="row">
        <input type="text" name="url" placeholder="https://github.com/owner/repo" required />
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "확인 중…" : "등록"}
        </button>
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
