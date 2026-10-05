const fmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatTime(iso: string | null): string {
  return iso ? fmt.format(new Date(iso)) : "-";
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
