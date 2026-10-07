"use client";

import { Html, QuadraticBezierLine } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { Group } from "three";
import type { InfraConfidence, InfraKind, InfraMap } from "@/lib/api";

export const INFRA_STYLE: Record<InfraKind, { color: string; label: string }> = {
  client: { color: "#e2e8f0", label: "사용자" },
  dns: { color: "#f6821f", label: "DNS" },
  tunnel: { color: "#f6821f", label: "터널" },
  proxy: { color: "#22d3ee", label: "프록시" },
  app: { color: "#818cf8", label: "앱" },
  database: { color: "#34d399", label: "DB" },
  cache: { color: "#f87171", label: "캐시" },
  queue: { color: "#fbbf24", label: "큐" },
  storage: { color: "#2dd4bf", label: "스토리지" },
  monitoring: { color: "#a3e635", label: "모니터링" },
  external: { color: "#c084fc", label: "외부 API" },
  platform: { color: "#94a3b8", label: "배포 플랫폼" },
  ci: { color: "#94a3b8", label: "CI" },
};

const CODE_LINK_COLOR = { entry: "#22d3ee", data: "#34d399", external: "#c084fc" } as const;
const ENTRY_KINDS: InfraKind[] = ["client", "dns", "tunnel", "proxy"];
const DATA_KINDS: InfraKind[] = ["database", "cache", "queue", "storage", "monitoring"];

type Pos = { x: number; y: number; z: number };
type Roof = { x: number; z: number; top: number };

/**
 * 인프라 노드를 도시 둘레에 놓는다.
 * 앞 = 요청이 들어오는 길(사용자 → DNS → 터널 → 프록시 → 앱 게이트), 오른쪽 = 저장소, 하늘 = 외부 API, 왼쪽 뒤 = 배포 · CI
 */
export function layoutInfra(infra: InfraMap, size: number) {
  const pos = new Map<string, Pos>();
  // 사용자에서 몇 단계 떨어졌는지 (요청 경로 순서)
  const depth = new Map<string, number>([["client", 0]]);
  const queue = ["client"];
  while (queue.length) {
    const id = queue.shift()!;
    for (const l of infra.links) {
      if (l.from === id && !depth.has(l.to)) {
        depth.set(l.to, depth.get(id)! + 1);
        queue.push(l.to);
      }
    }
  }
  const byKind = (kinds: InfraKind[]) => infra.nodes.filter((n) => kinds.includes(n.kind));
  const spread = (count: number, i: number, width: number) => (count <= 1 ? 0 : -width / 2 + (width * i) / (count - 1));

  // 입구: 도시 앞 가장자리에 앱 게이트를 두고, 요청 경로를 앞 가장자리를 따라 왼쪽으로 늘어세운다
  const entry = byKind(ENTRY_KINDS);
  const apps = byKind(["app"]);
  const appDepth = Math.max(1, ...apps.map((a) => depth.get(a.id) ?? 1));
  const gap = size * 0.2;
  const gateZ = size * 0.64;
  const gateX = -size * 0.02;
  const columns = new Map<number, string[]>();
  for (const n of entry) {
    const d = Math.min(depth.get(n.id) ?? 0, appDepth - 1);
    columns.set(d, [...(columns.get(d) ?? []), n.id]);
  }
  for (const [d, ids] of columns) {
    const k = appDepth - d;
    ids.forEach((id, i) => pos.set(id, { x: gateX - k * gap, y: 0, z: gateZ + k * gap * 0.3 + spread(ids.length, i, size * 0.3) }));
  }
  apps.forEach((a, i) => pos.set(a.id, { x: gateX + spread(apps.length, i, size * 0.6), y: 0, z: gateZ }));

  const data = byKind(DATA_KINDS);
  // 저장소: 도시 오른쪽 뒤편에 두 줄로
  data.forEach((n, i) => pos.set(n.id, { x: size * 0.62 + (i % 2) * size * 0.14, y: 0, z: -size * 0.1 + spread(data.length, i, size * 0.7) }));

  const externals = byKind(["external"]);
  externals.forEach((n, i) => pos.set(n.id, { x: spread(externals.length, i, size * 0.9), y: size * 0.55, z: -size * 0.62 }));

  const ops = byKind(["platform", "ci"]);
  ops.forEach((n, i) => pos.set(n.id, { x: -size * 0.85, y: 0, z: -size * 0.3 + i * gap * 0.7 }));
  return pos;
}

function NodeShape({ kind, color, missing }: { kind: InfraKind; color: string; missing: boolean }) {
  const mat = (
    <meshStandardMaterial
      color={missing ? "#475569" : color}
      emissive={missing ? "#000000" : color}
      emissiveIntensity={missing ? 0 : 0.45}
      roughness={0.35}
      metalness={0.2}
      wireframe={missing}
      transparent
      opacity={missing ? 0.45 : 1}
    />
  );
  switch (kind) {
    case "client":
      return (
        <mesh position={[0, 2.2, 0]}>
          <sphereGeometry args={[1.6, 24, 24]} />
          {mat}
        </mesh>
      );
    case "dns":
      return (
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[2.6, 2.6, 0.6, 40]} />
          {mat}
        </mesh>
      );
    case "tunnel":
      return (
        <mesh position={[0, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[2.4, 0.6, 16, 48]} />
          {mat}
        </mesh>
      );
    case "proxy":
      return (
        <group>
          {[-1.6, 1.6].map((z) => (
            <mesh key={z} position={[0, 2.5, z]}>
              <boxGeometry args={[0.9, 5, 0.9]} />
              {mat}
            </mesh>
          ))}
          <mesh position={[0, 5.2, 0]}>
            <boxGeometry args={[1.1, 0.7, 4.4]} />
            {mat}
          </mesh>
        </group>
      );
    case "app":
      return (
        <mesh position={[0, 3.5, 0]}>
          <cylinderGeometry args={[2.2, 2.2, 7, 6]} />
          {mat}
        </mesh>
      );
    case "database":
    case "cache":
      return (
        <group>
          {[0, 1.6, 3.2].map((y) => (
            <mesh key={y} position={[0, 0.8 + y, 0]}>
              <cylinderGeometry args={[2.2, 2.2, kind === "cache" ? 1 : 1.4, 32]} />
              {mat}
            </mesh>
          ))}
        </group>
      );
    case "queue":
      return (
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[5, 2.2, 2.2]} />
          {mat}
        </mesh>
      );
    case "external":
      return (
        <mesh>
          <icosahedronGeometry args={[2, 0]} />
          {mat}
        </mesh>
      );
    case "monitoring":
      return (
        <mesh position={[0, 2, 0]}>
          <octahedronGeometry args={[1.8, 0]} />
          {mat}
        </mesh>
      );
    default:
      return (
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[4, 1.2, 3]} />
          {mat}
        </mesh>
      );
  }
}

function InfraNode({
  node,
  p,
  selected,
  dimmed,
  onSelect,
}: {
  node: InfraMap["nodes"][number];
  p: Pos;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}) {
  const group = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  const style = INFRA_STYLE[node.kind];
  // 외부 API 위성은 천천히 돌며 떠 있다
  useFrame(({ clock }) => {
    if (!group.current) return;
    if (node.kind === "external") {
      group.current.rotation.y = clock.elapsedTime * 0.5;
      group.current.position.y = p.y + Math.sin(clock.elapsedTime + p.x) * 0.8;
    }
    const s = hover || selected ? 1.18 : 1;
    group.current.scale.setScalar(group.current.scale.x + (s - group.current.scale.x) * 0.2);
  });
  return (
    <group
      ref={group}
      position={[p.x, p.y, p.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      <group visible={!dimmed || selected}>
        <NodeShape kind={node.kind} color={style.color} missing={node.confidence === "missing"} />
      </group>
      <Html position={[0, node.kind === "external" ? 3.2 : 8, 0]} center zIndexRange={[15, 0]}>
        <div
          className={`infra-tag ${node.confidence}${selected ? " selected" : ""}${dimmed ? " dim" : ""}`}
          style={{ borderColor: node.confidence === "missing" ? "#64748b" : style.color }}
          onClick={() => onSelect(node.id)}
        >
          <i style={{ background: style.color }} />
          <span>{node.label}</span>
          <em>{node.confidence === "missing" ? "레포에 없음" : style.label}</em>
        </div>
      </Html>
    </group>
  );
}

function Link3D({
  from,
  to,
  color,
  confidence,
  width,
  lift,
}: {
  from: Pos;
  to: Pos;
  color: string;
  confidence: InfraConfidence;
  width: number;
  lift: number;
}) {
  const line = useRef<{ material: { dashOffset: number } } | null>(null);
  const flowing = confidence === "file";
  useFrame((_, dt) => {
    if (flowing && line.current) line.current.material.dashOffset -= dt * 2;
  });
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  return (
    <QuadraticBezierLine
      ref={line as never}
      start={[from.x, from.y, from.z]}
      end={[to.x, to.y, to.z]}
      mid={[(from.x + to.x) / 2, Math.max(from.y, to.y) + lift + dist * 0.12, (from.z + to.z) / 2]}
      color={confidence === "missing" ? "#64748b" : color}
      lineWidth={width}
      dashed
      dashSize={flowing ? 1.4 : 0.6}
      gapSize={flowing ? 0.9 : 0.8}
      transparent
      opacity={confidence === "inferred" ? 0.55 : 0.95}
    />
  );
}

/**
 * 코드 시티 둘레의 인프라 층. 노드끼리 요청 · 데이터 흐름 방향으로 잇고,
 * 앱 게이트 → 진입점 건물, DB 를 쓰는 건물 → 저장소, 외부 API 를 부르는 건물 → 위성으로 선을 긋는다.
 */
export function InfraLayer({
  infra,
  size,
  roofs,
  selected,
  selectedFile,
  onSelect,
}: {
  infra: InfraMap;
  size: number;
  roofs: Map<string, Roof>;
  selected: string | null;
  selectedFile: string | null;
  onSelect: (id: string) => void;
}) {
  const pos = useMemo(() => layoutInfra(infra, size), [infra, size]);
  const anchor = (id: string): Pos | null => {
    const p = pos.get(id);
    if (!p) return null;
    const node = infra.nodes.find((n) => n.id === id)!;
    const h = { client: 2.2, dns: 0.8, tunnel: 3, proxy: 5.2, app: 7, database: 4.2, cache: 4, queue: 2.4, external: 0, monitoring: 2, platform: 1.2, ci: 1.2, storage: 1.2 }[node.kind];
    return { x: p.x, y: p.y + h, z: p.z };
  };
  // 고른 노드와 직접 이어진 노드 · 파일만 밝게
  const focus = useMemo(() => {
    if (selected) {
      const ids = new Set([selected]);
      for (const l of infra.links) {
        if (l.from === selected) ids.add(l.to);
        if (l.to === selected) ids.add(l.from);
      }
      return { ids, files: new Set(infra.codeLinks.filter((c) => c.node === selected).map((c) => c.file)) };
    }
    if (selectedFile) {
      const ids = new Set(infra.codeLinks.filter((c) => c.file === selectedFile).map((c) => c.node));
      return { ids, files: new Set([selectedFile]) };
    }
    return null;
  }, [selected, selectedFile, infra]);

  // 진입점 선은 앱 게이트가 하나면 거기서, 여러 개면 코드가 가리키는 노드에서
  // 같은 노드 · 파일 연결은 한 번만 그린다 (키가 겹치면 장면 전체가 깨진다)
  const seen = new Set<string>();
  const codeLines = infra.codeLinks.filter((c) => {
    const key = `${c.node}|${c.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !focus || focus.files.has(c.file) || focus.ids.has(c.node);
  });

  return (
    <group>
      {infra.nodes.map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        return <InfraNode key={n.id} node={n} p={p} selected={selected === n.id} dimmed={focus !== null && !focus.ids.has(n.id)} onSelect={onSelect} />;
      })}
      {infra.links.map((l) => {
        const a = anchor(l.from);
        const b = anchor(l.to);
        if (!a || !b) return null;
        const on = !focus || (focus.ids.has(l.from) && focus.ids.has(l.to));
        if (!on) return null;
        const target = infra.nodes.find((n) => n.id === l.to)!;
        return <Link3D key={`${l.from}>${l.to}`} from={a} to={b} color={INFRA_STYLE[target.kind].color} confidence={l.confidence} width={2.6} lift={4} />;
      })}
      {codeLines.map((c) => {
        const node = anchor(c.node);
        const roof = roofs.get(c.file);
        if (!node || !roof) return null;
        const building = { x: roof.x, y: roof.top + 0.3, z: roof.z };
        // 요청은 게이트 → 건물, 데이터 · 외부 호출은 건물 → 저장소 · 위성
        const [from, to] = c.kind === "entry" ? [node, building] : [building, node];
        return (
          <Link3D
            key={`${c.node}|${c.file}`}
            from={from}
            to={to}
            color={CODE_LINK_COLOR[c.kind]}
            confidence={c.detail ? "inferred" : "file"}
            width={focus ? 2.2 : 1.2}
            lift={c.kind === "external" ? 2 : 6}
          />
        );
      })}
    </group>
  );
}
