"use client";

import { Edges, Html, OrbitControls, QuadraticBezierLine } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { PCFShadowMap, type Mesh, type MeshStandardMaterial } from "three";
import type { InfraMap } from "@/lib/api";
import { InfraLayer } from "./InfraLayer";
import { heatColor, relativeDays, squarify, type FileMetric, type Insights, type TimeState } from "./metrics";

export type CityColorMode = "hotspot" | "group" | "recent" | "test";

/** PR 영향 모드: 파일별 단계(0 = 바뀜, 1 = 직접, 2 = 간접), 지금 드러난 단계, 지적 수, 영향이 전달되는 파일 쌍 */
export type CityImpact = {
  levels: Map<string, 0 | 1 | 2>;
  reveal: number;
  findings: Map<string, number>;
  links: { from: string; to: string; level: 1 | 2 }[];
};

type Building = {
  file: FileMetric;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
};

type District = { label: string; color: string; x: number; z: number; w: number; d: number };

const GROUND = 0.6;
const DIM = "#1c1d2e";
export const LEVEL_COLORS = ["#fde047", "#f43f5e", "#fb923c"] as const;
const OUT_COLOR = "#22d3ee";
const IN_COLOR = "#f472b6";

/** 기능 묶음 = 구역, 파일 = 건물. 구역과 건물 바닥은 squarified treemap 으로 나눈다 */
export function layoutCity(insights: Insights) {
  const size = Math.max(60, Math.sqrt(insights.files.length) * 14);
  const maxLines = Math.max(1, ...insights.files.map((f) => f.lines));
  const footprint = (f: FileMetric) => 1 + f.functions * 0.6 + f.lines / 120;
  const districts: District[] = [];
  const buildings: Building[] = [];
  const zones = squarify(
    insights.groups.map((g) => ({ item: g, weight: g.files.reduce((s, f) => s + footprint(f), 0) })),
    { x: -size / 2, y: -size / 2, w: size, h: size },
  );
  for (const { item: g, rect } of zones) {
    const pad = Math.min(2, rect.w * 0.08, rect.h * 0.08);
    const inner = { x: rect.x + pad, y: rect.y + pad, w: rect.w - pad * 2, h: rect.h - pad * 2 };
    districts.push({ label: g.label, color: g.color, x: inner.x + inner.w / 2, z: inner.y + inner.h / 2, w: inner.w, d: inner.h });
    for (const { item: f, rect: r } of squarify(g.files.map((f) => ({ item: f, weight: footprint(f) })), inner)) {
      const m = Math.min(r.w, r.h) * 0.16;
      buildings.push({
        file: f,
        x: r.x + r.w / 2,
        z: r.y + r.h / 2,
        w: Math.max(r.w - m * 2, 0.4),
        d: Math.max(r.h - m * 2, 0.4),
        // 줄 수에 따라 높아진다 (큰 파일이 너무 튀지 않게 0.6 제곱)
        h: 1.2 + Math.pow(f.lines / maxLines, 0.6) * size * 0.32,
      });
    }
  }
  return { size, districts, buildings, byPath: new Map(buildings.map((b) => [b.file.path, b])) };
}

function recencyColor(iso: string | undefined | null, untilIso: string | null): string {
  if (!iso || !untilIso) return "#2a2c44";
  const days = (new Date(untilIso).getTime() - new Date(iso).getTime()) / 86400000;
  return heatColor(Math.max(0, 1 - days / 90));
}

export function buildingColor(f: FileMetric, mode: CityColorMode, insights: Insights): string {
  if (mode === "group") return f.color;
  if (mode === "recent") return recencyColor(f.history?.lastAt, insights.until);
  if (mode === "test") return f.test ? "#4ade80" : "#3b3f5c";
  return heatColor(f.hotspot);
}

type Look = { color: string; height: number; glow: number; opacity: number; visible: boolean; badge: number };

/** 건물 하나. 높이 · 빛은 목표값을 향해 매 프레임 조금씩 움직여 자라거나 줄어드는 것처럼 보인다 */
function BuildingMesh({
  b,
  look,
  selected,
  onHover,
  onSelect,
}: {
  b: Building;
  look: Look;
  selected: boolean;
  onHover: (path: string | null) => void;
  onSelect: (path: string) => void;
}) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const [hover, setHover] = useState(false);
  const height = useRef(look.visible ? look.height : 0.01);

  useFrame((_, dt) => {
    if (!mesh.current || !material.current) return;
    const target = look.visible ? look.height : 0.01;
    height.current += (target - height.current) * Math.min(1, dt * 5);
    const h = Math.max(height.current, 0.01);
    mesh.current.scale.y = h;
    mesh.current.position.y = GROUND + h / 2;
    mesh.current.visible = h > 0.05;
    const glow = hover || selected ? 0.9 : look.glow;
    material.current.emissiveIntensity += (glow - material.current.emissiveIntensity) * Math.min(1, dt * 6);
  });

  return (
    <mesh
      ref={mesh}
      position={[b.x, GROUND + height.current / 2, b.z]}
      scale={[1, height.current, 1]}
      castShadow
      receiveShadow
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        onHover(b.file.path);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        onHover(null);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(b.file.path);
      }}
    >
      <boxGeometry args={[b.w, 1, b.d]} />
      <meshStandardMaterial
        ref={material}
        color={look.color}
        emissive={look.color}
        emissiveIntensity={look.glow}
        roughness={0.35}
        metalness={0.15}
        transparent={look.opacity < 1}
        opacity={look.opacity}
      />
      {(hover || selected) && <Edges color="#ffffff" />}
      {(hover || look.badge > 0) && look.visible && (
        <Html position={[0, 0.5, 0]} center zIndexRange={[20, 0]} style={{ transform: "translateY(-18px)" }}>
          {hover ? (
            <div className="city-tip">
              <b>{b.file.name}</b>
              <span>
                {b.file.lines}줄 · 함수 {b.file.functions}
                {b.file.history && ` · ${b.file.history.commits}번 변경`}
              </span>
            </div>
          ) : (
            <div className="city-badge">⚠ {look.badge}</div>
          )}
        </Html>
      )}
    </mesh>
  );
}

/** 바뀐 건물 바닥에서 퍼지는 파동 고리 */
function Ripple({ x, z, radius, delay }: { x: number; z: number; radius: number; delay: number }) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!mesh.current || !material.current) return;
    const t = ((clock.elapsedTime + delay) % 2.4) / 2.4;
    const s = 0.5 + t * radius;
    mesh.current.scale.set(s, s, s);
    material.current.opacity = (1 - t) * 0.7;
  });
  return (
    <mesh ref={mesh} position={[x, GROUND + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.85, 1, 64]} />
      <meshStandardMaterial ref={material} color={LEVEL_COLORS[0]} emissive={LEVEL_COLORS[0]} emissiveIntensity={1.2} transparent opacity={0.6} />
    </mesh>
  );
}

/** 건물 지붕에서 지붕으로 휘는 빛나는 호. flow 면 점선이 흘러간다 */
function Arc({
  from,
  to,
  color,
  width,
  flow,
}: {
  from: Building;
  to: Building;
  color: string;
  width: number;
  flow: boolean;
}) {
  // drei 선 객체 (dashOffset 을 움직인다)
  const line = useRef<{ material: { dashOffset: number } } | null>(null);
  useFrame((_, dt) => {
    if (flow && line.current) line.current.material.dashOffset -= dt * 1.6;
  });
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  const top = Math.max(from.h, to.h);
  return (
    <QuadraticBezierLine
      ref={line as never}
      start={[from.x, GROUND + from.h + 0.3, from.z]}
      end={[to.x, GROUND + to.h + 0.3, to.z]}
      mid={[(from.x + to.x) / 2, GROUND + top + dist * 0.45 + 2, (from.z + to.z) / 2]}
      color={color}
      lineWidth={width}
      dashed={flow}
      dashSize={1.2}
      gapSize={0.8}
      transparent
      opacity={0.9}
    />
  );
}

/**
 * 3D 코드 시티. 드래그로 돌리고 휠로 확대, 건물을 누르면 그 파일을 고른다.
 * - 고른 파일: 그 파일 함수가 부르는 파일(청록) · 그 파일을 부르는 파일(분홍)로 호가 떠오른다
 * - time: 그 커밋 시점의 도시 (없는 파일은 땅속, 크기는 그때까지 쌓인 줄 수 비율, 방금 바뀐 건물은 번쩍)
 * - impact: PR 이 바꾼 건물이 솟고 빛나며, 호출하는 건물로 단계별로 번진다
 */
export function CodeCity({
  insights,
  mode,
  selected,
  onSelect,
  time,
  impact,
  infra,
  selectedInfra = null,
  onSelectInfra,
}: {
  insights: Insights;
  mode: CityColorMode;
  selected: string | null;
  onSelect: (path: string | null) => void;
  time?: TimeState | null;
  impact?: CityImpact | null;
  /** 있으면 도시 둘레에 인프라 층을 그린다 */
  infra?: InfraMap | null;
  selectedInfra?: string | null;
  onSelectInfra?: (id: string | null) => void;
}) {
  const { size, districts, buildings, byPath } = useMemo(() => layoutCity(insights), [insights]);
  const roofs = useMemo(() => new Map(buildings.map((b) => [b.file.path, { x: b.x, z: b.z, top: GROUND + b.h }])), [buildings]);
  const [, setHovered] = useState<string | null>(null);
  const [rotate, setRotate] = useState(true);

  // 고른 파일의 호출 상대
  const calls = useMemo(() => {
    if (!selected) return null;
    const c = insights.fileCalls.get(selected);
    return { out: c?.out ?? new Map<string, number>(), in: c?.in ?? new Map<string, number>() };
  }, [selected, insights.fileCalls]);
  const related = useMemo(() => {
    if (!selected || !calls) return null;
    return new Set([selected, ...calls.out.keys(), ...calls.in.keys()]);
  }, [selected, calls]);

  const lookOf = (b: Building): Look => {
    const base = buildingColor(b.file, mode, insights);
    let look: Look = {
      color: base,
      height: b.h,
      glow: 0.12 + (mode === "hotspot" ? (b.file.hotspot ?? 0) * 0.75 : 0),
      opacity: 1,
      visible: true,
      badge: 0,
    };
    if (impact) {
      const level = impact.levels.get(b.file.path);
      const lit = level !== undefined && level <= impact.reveal;
      look = lit
        ? {
            color: LEVEL_COLORS[level],
            height: b.h * (level === 0 ? 1.35 : 1.1) + (level === 0 ? 2 : 0),
            glow: level === 0 ? 1.1 : 0.7,
            opacity: 1,
            visible: true,
            badge: impact.findings.get(b.file.path) ?? 0,
          }
        : { color: DIM, height: b.h * 0.7, glow: 0.02, opacity: 0.35, visible: true, badge: 0 };
    }
    if (time) {
      const s = time.files.get(b.file.path);
      if (s) {
        look = {
          ...look,
          visible: s.visible,
          height: b.h * s.grow,
          color: s.flash > 0 ? "#fde047" : look.color,
          glow: s.flash > 0 ? 0.6 + s.flash : look.glow,
        };
      }
    }
    if (related && !related.has(b.file.path)) look = { ...look, opacity: 0.16, glow: 0.02 };
    return look;
  };

  const arcs: { key: string; from: Building; to: Building; color: string; width: number; flow: boolean }[] = [];
  if (selected && calls) {
    const me = byPath.get(selected);
    const max = Math.max(1, ...calls.out.values(), ...calls.in.values());
    if (me) {
      for (const [path, n] of calls.out) {
        const to = byPath.get(path);
        if (to) arcs.push({ key: `o${path}`, from: me, to, color: OUT_COLOR, width: 1.5 + (n / max) * 3, flow: true });
      }
      for (const [path, n] of calls.in) {
        const from = byPath.get(path);
        if (from) arcs.push({ key: `i${path}`, from, to: me, color: IN_COLOR, width: 1.5 + (n / max) * 3, flow: true });
      }
    }
  } else if (impact) {
    for (const l of impact.links) {
      if (l.level > impact.reveal) continue;
      const from = byPath.get(l.from);
      const to = byPath.get(l.to);
      if (from && to) arcs.push({ key: `${l.from}>${l.to}`, from, to, color: LEVEL_COLORS[l.level], width: 2.2, flow: true });
    }
  }

  const changed = impact && impact.reveal >= 0 ? buildings.filter((b) => impact.levels.get(b.file.path) === 0) : [];

  return (
    <Canvas
      // three 최신판에서 PCFSoftShadowMap 이 빠져서 PCF 를 직접 고른다
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 2]}
      // 인프라 층이 있으면 도시 둘레까지 보이게 조금 더 멀리서 시작한다
      camera={{ position: infra ? [size * 0.95, size * 1.15, size * 1.75] : [size * 1.05, size * 0.85, size * 1.05], fov: 42, near: 0.5, far: size * 10 }}
      onPointerMissed={() => {
        onSelect(null);
        onSelectInfra?.(null);
      }}
    >
      <color attach="background" args={["#07070d"]} />
      <fog attach="fog" args={["#07070d", size * 1.3, size * 3.2]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#8b9cff", "#0b0b14", 0.45]} />
      <directionalLight
        position={[size * 0.6, size * 1.2, size * 0.3]}
        intensity={1.25}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
      />
      <pointLight position={[-size * 0.5, size * 0.4, -size * 0.5]} intensity={size * 3} color="#6366f1" distance={size * 2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#0a0a14" roughness={1} />
      </mesh>
      <gridHelper args={[size * 4, 80, "#1b1b2e", "#12121f"]} position={[0, 0.01, 0]} />

      {districts.map((d) => (
        <group key={d.label}>
          <mesh position={[d.x, GROUND / 2, d.z]} receiveShadow>
            <boxGeometry args={[d.w, GROUND, d.d]} />
            <meshStandardMaterial color={d.color} emissive={d.color} emissiveIntensity={0.08} transparent opacity={impact ? 0.15 : 0.35} roughness={0.8} />
            <Edges color={d.color} />
          </mesh>
          <Html position={[d.x - d.w / 2, GROUND + 0.2, d.z - d.d / 2]} zIndexRange={[10, 0]}>
            <div className="city-district" style={{ borderColor: d.color, color: d.color }}>
              {d.label}
            </div>
          </Html>
        </group>
      ))}

      {buildings.map((b) => (
        <BuildingMesh key={b.file.path} b={b} look={lookOf(b)} selected={selected === b.file.path} onHover={setHovered} onSelect={onSelect} />
      ))}

      {changed.map((b, i) => (
        <Ripple key={b.file.path} x={b.x} z={b.z} radius={size * 0.35} delay={i * 0.4} />
      ))}

      {arcs.map((a) => (
        <Arc key={a.key} from={a.from} to={a.to} color={a.color} width={a.width} flow={a.flow} />
      ))}

      {infra && (
        <InfraLayer
          infra={infra}
          size={size}
          roofs={roofs}
          selected={selectedInfra}
          selectedFile={selected}
          onSelect={(id) => {
            onSelect(null);
            onSelectInfra?.(id);
          }}
        />
      )}

      <OrbitControls
        makeDefault
        // 인프라 층(앞 · 왼쪽 입구)까지 화면 가운데에 오게 중심을 옮긴다
        target={infra ? [-size * 0.16, 0, size * 0.12] : [0, 0, 0]}
        enableDamping
        autoRotate={rotate}
        autoRotateSpeed={0.35}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={size * 0.15}
        maxDistance={size * 3}
        onStart={() => setRotate(false)}
      />
    </Canvas>
  );
}

export function cityLegend(mode: CityColorMode): { label: string; stops: string[]; left: string; right: string } {
  if (mode === "recent") return { label: "마지막 변경", stops: [heatColor(0), heatColor(0.5), heatColor(1)], left: "90일+ 전", right: "최근" };
  if (mode === "test") return { label: "테스트 파일", stops: ["#3b3f5c", "#4ade80"], left: "코드", right: "테스트" };
  if (mode === "group") return { label: "기능 묶음", stops: [], left: "", right: "" };
  return { label: "핫스팟 (변경 빈도 × 크기)", stops: [heatColor(0), heatColor(0.25), heatColor(0.5), heatColor(0.75), heatColor(1)], left: "안정", right: "위험" };
}

export { relativeDays };
