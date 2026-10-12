import type { InfraMap, RepoInfo } from "./api";

/** GitHub 언어 색 (자주 나오는 것만, 나머지는 회색) */
const LANGUAGE_COLOR: Record<string, string> = {
  Java: "#b07219",
  Kotlin: "#a97bff",
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572a5",
  Go: "#00add8",
  Rust: "#dea584",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Swift: "#f05138",
  Scala: "#c22d40",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Dockerfile: "#384d54",
  Vue: "#41b883",
};

/** 화면에 내세우지 않는 언어 (스타일 · 마크업 · 스크립트 조각) */
const MINOR_LANGUAGES = new Set(["CSS", "SCSS", "HTML", "Dockerfile", "Shell", "Batchfile", "Makefile"]);

export type StackLanguage = { name: string; pct: number; color: string };
/** 구성 요소 하나: kind 는 점 색을 고르는 데만 쓴다 */
export type StackPart = { kind: "db" | "service" | "platform" | "monitor" | "external" | "ci"; label: string };

/** 이미지 · 이름으로 알려진 제품 이름을 붙인다 */
const PRODUCTS: [RegExp, string][] = [
  [/postgres/i, "PostgreSQL"],
  [/mysql/i, "MySQL"],
  [/mariadb/i, "MariaDB"],
  [/mongo/i, "MongoDB"],
  [/redis/i, "Redis"],
  [/kafka/i, "Kafka"],
  [/rabbit/i, "RabbitMQ"],
  [/elastic/i, "Elasticsearch"],
  [/zipkin/i, "Zipkin"],
  [/grafana/i, "Grafana"],
  [/prometheus/i, "Prometheus"],
  [/openai/i, "OpenAI"],
  [/anthropic|claude/i, "Anthropic"],
  [/config-server/i, "Config Server"],
  [/discovery|eureka/i, "Eureka"],
  [/admin-server/i, "Spring Boot Admin"],
  [/gateway/i, "API Gateway"],
  [/nginx/i, "Nginx"],
];

function product(text: string): string | null {
  return PRODUCTS.find(([re]) => re.test(text))?.[1] ?? null;
}

/**
 * 레포 구성 요약: 주 언어(비율)와 인프라 지도에서 찾은 DB · 서비스 · 플랫폼 · 모니터링 · 외부 API · CI.
 * 인프라 지도가 없는 예전 그래프면 언어만 나온다.
 */
export function summarizeStack(repo: RepoInfo | null, infra: InfraMap | null | undefined) {
  const entries = Object.entries(repo?.languages ?? {});
  const total = entries.reduce((n, [, v]) => n + v, 0);
  const major = entries.filter(([name]) => !MINOR_LANGUAGES.has(name));
  const languages: StackLanguage[] = (major.length ? major : entries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, bytes]) => ({ name, pct: total ? Math.round((bytes / total) * 100) : 0, color: LANGUAGE_COLOR[name] ?? "#8b8b95" }));

  const parts: StackPart[] = [];
  const add = (kind: StackPart["kind"], label: string) => {
    if (!parts.some((p) => p.label === label)) parts.push({ kind, label });
  };
  const nodes = infra?.nodes ?? [];
  for (const n of nodes.filter((n) => n.kind === "database" || n.kind === "cache" || n.kind === "queue" || n.kind === "storage")) {
    add("db", product(`${n.label} ${n.detail ?? ""}`) ?? n.label);
  }
  const apps = nodes.filter((n) => n.kind === "app");
  if (apps.length > 1) add("service", `서비스 ${apps.length}개`);
  for (const n of nodes.filter((n) => n.kind === "registry" || n.kind === "proxy" || n.kind === "platform")) {
    add("platform", product(`${n.label} ${n.detail ?? ""}`) ?? n.label);
  }
  for (const n of nodes.filter((n) => n.kind === "monitoring")) {
    add("monitor", product(`${n.label} ${n.detail ?? ""}`) ?? n.label);
  }
  for (const n of nodes.filter((n) => n.kind === "external")) {
    const name = product(`${n.label} ${n.detail ?? ""}`);
    if (name) add("external", name);
  }
  for (const n of nodes.filter((n) => n.kind === "ci")) add("ci", n.label);
  return { languages, parts };
}
