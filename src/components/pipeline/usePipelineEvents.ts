"use client";

import { useEffect, useState } from "react";
import type { ReviewEvent } from "./stages";

/**
 * 리뷰 단계 스트림을 구독한다. 저장된 이벤트가 먼저 오고, 진행 중이면 이어서 온다.
 * 재연결하면 처음부터 다시 오므로 id 로 중복을 거른다.
 */
export function usePipelineEvents(reviewId: number) {
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [ended, setEnded] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/reviews/${reviewId}/events`);
    source.onopen = () => setConnected(true);
    source.addEventListener("stage", (m) => {
      const event = JSON.parse((m as MessageEvent).data) as ReviewEvent;
      setEvents((prev) =>
        prev.some((p) => p.id === event.id) ? prev : [...prev, event].sort((a, b) => a.id - b.id),
      );
    });
    source.addEventListener("end", () => {
      setEnded(true);
      source.close();
    });
    return () => source.close();
  }, [reviewId]);

  return { events, ended, connected };
}
