import { API_BASE } from "@/lib/api";

// 백엔드의 리뷰 단계 스트림(SSE)을 그대로 중계한다. 브라우저는 백엔드 주소를 모른다.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return new Response("bad id", { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/api/reviews/${id}/events`, {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
    });
  } catch {
    return new Response("backend unreachable", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), { status: upstream.status });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
