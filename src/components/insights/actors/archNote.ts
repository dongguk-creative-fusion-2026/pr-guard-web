import type { ShowArch } from "./reviewShow";

/** 자막 한 줄: 구조를 거스르는 새 의존 */
export function archNote(arch: ShowArch[]): string | null {
  const top = arch[0];
  if (!top) return null;
  return `구조 변화: ${top.title}${arch.length > 1 ? ` 외 ${arch.length - 1}건` : ""}`;
}
