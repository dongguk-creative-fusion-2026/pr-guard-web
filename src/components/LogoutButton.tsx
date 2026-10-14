import { logout } from "@/app/login/actions";
import { accessToken } from "@/lib/access";

/** 상단 바 오른쪽 끝. 접속 토큰을 쓰지 않으면 보이지 않는다 */
export function LogoutButton() {
  if (!accessToken()) return null;
  return (
    <form action={logout} className="pbar-logout">
      <button type="submit" className="pbar-link">
        로그아웃
      </button>
    </form>
  );
}
