import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HomeLink, StatusScreen } from "@/components/StatusScreen";

export default function NotFound() {
  return (
    <>
      <header className="pbar">
        <Link href="/" className="pbar-brand">
          <Logo /> PR Guard
        </Link>
      </header>
      <StatusScreen title="찾을 수 없습니다" detail="삭제된 프로젝트이거나 주소가 잘못됐습니다.">
        <HomeLink />
      </StatusScreen>
    </>
  );
}
