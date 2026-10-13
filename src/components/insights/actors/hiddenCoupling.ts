import { visibleCouplings, type Insights } from "../metrics";

/** 숨은 결합: 서로 부르지 않는데 늘 같이 바뀌던 짝 중, 이번 PR 이 한쪽만 바꾼 것 */
export type HiddenPartner = { changed: string; partner: string; support: number; confidence: number };

/** 강한 결합(3번 이상 · 50% 이상, 코드 파일끼리)만 본다. 확신이 큰 순으로 3개까지 */
export function hiddenPartners(changed: string[], insights: Insights): HiddenPartner[] {
  const set = new Set(changed);
  return visibleCouplings(insights, false)
    .filter((c) => !c.linked && set.has(c.a) !== set.has(c.b))
    .map((c) => (set.has(c.a) ? { changed: c.a, partner: c.b, support: c.support, confidence: c.confidence } : { changed: c.b, partner: c.a, support: c.support, confidence: c.confidence }))
    .sort((x, y) => y.confidence - x.confidence || y.support - x.support)
    .slice(0, 3);
}

const name = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** 자막 한 줄 */
export function partnerNote(partners: HiddenPartner[]): string | null {
  const top = partners[0];
  if (!top) return null;
  const more = partners.length > 1 ? ` 외 ${partners.length - 1}쌍` : "";
  return `숨은 결합: ${name(top.changed)} 와 늘 같이 바뀌던 ${name(top.partner)} 가 이번엔 안 바뀜 (${Math.round(top.confidence * 100)}%)${more}`;
}
