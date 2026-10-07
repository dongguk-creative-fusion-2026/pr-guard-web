"use client";

import { Edges, Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { heatColor, relativeDays, squarify, type FileMetric, type Insights } from "./metrics";

export type CityColorMode = "hotspot" | "group" | "recent" | "test";

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

/** 기능 묶음 = 구역, 파일 = 건물. 구역과 건물 바닥은 squarified treemap 으로 나눈다 */
function layoutCity(insights: Insights) {
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
  return { size, districts, buildings };
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

function BuildingMesh({
  b,
  color,
  glow,
  selected,
  dimmed,
  onHover,
  onSelect,
}: {
  b: Building;
  color: string;
  glow: number;
  selected: boolean;
  dimmed: boolean;
  onHover: (path: string | null) => void;
  onSelect: (path: string) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <mesh
      position={[b.x, GROUND + b.h / 2, b.z]}
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
      <boxGeometry args={[b.w, b.h, b.d]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={hover || selected ? 0.9 : dimmed ? 0.02 : 0.12 + glow * 0.75}
        roughness={0.35}
        metalness={0.15}
        transparent={dimmed}
        opacity={dimmed ? 0.18 : 1}
      />
      {(hover || selected) && <Edges color="#ffffff" />}
      {hover && (
        <Html position={[0, b.h / 2 + 1.2, 0]} center distanceFactor={undefined} zIndexRange={[20, 0]}>
          <div className="city-tip">
            <b>{b.file.name}</b>
            <span>
              {b.file.lines}줄 · 함수 {b.file.functions}
              {b.file.history && ` · ${b.file.history.commits}번 변경`}
            </span>
          </div>
        </Html>
      )}
    </mesh>
  );
}

/** 3D 코드 시티. 드래그로 돌리고 휠로 확대, 건물을 누르면 그 파일을 고른다 */
export function CodeCity({
  insights,
  mode,
  selected,
  onSelect,
}: {
  insights: Insights;
  mode: CityColorMode;
  selected: string | null;
  onSelect: (path: string | null) => void;
}) {
  const { size, districts, buildings } = useMemo(() => layoutCity(insights), [insights]);
  const [, setHovered] = useState<string | null>(null);
  const [rotate, setRotate] = useState(true);
  // 고른 파일과 같이 바뀌는 파일만 밝게 남긴다
  const related = useMemo(() => {
    if (!selected) return null;
    const set = new Set([selected]);
    for (const c of insights.couplings) {
      if (c.a === selected) set.add(c.b);
      if (c.b === selected) set.add(c.a);
    }
    return set;
  }, [selected, insights.couplings]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [size * 1.05, size * 0.85, size * 1.05], fov: 42, near: 0.5, far: size * 10 }}
      onPointerMissed={() => onSelect(null)}
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
            <meshStandardMaterial color={d.color} emissive={d.color} emissiveIntensity={0.08} transparent opacity={0.35} roughness={0.8} />
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
        <BuildingMesh
          key={b.file.path}
          b={b}
          color={buildingColor(b.file, mode, insights)}
          glow={mode === "hotspot" ? b.file.hotspot ?? 0 : 0}
          selected={selected === b.file.path}
          dimmed={related !== null && !related.has(b.file.path)}
          onHover={setHovered}
          onSelect={onSelect}
        />
      ))}

      <OrbitControls
        makeDefault
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
