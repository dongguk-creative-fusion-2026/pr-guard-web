import { redirect } from "next/navigation";

/** 예전 주소: 코드 인사이트는 커밋 이력으로 옮겼다 (?tab · ?mode · ?file · ?t 는 그대로) */
export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const id = (await params).id;
  const query = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => !!e[1]));
  redirect(`/projects/${id}/commits${query.size ? `?${query}` : ""}`);
}
