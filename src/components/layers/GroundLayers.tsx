"use client";

import { Edges, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState, type MutableRefObject } from "react";
import type { Group, Mesh } from "three";
import type { GroundLayerId, GroundMark, GroundStatus, Severity } from "@/lib/api";
import { LAYER_META, LAYER_ORDER } from "@/lib/grounding";

/** 층 사이 간격 (펼친 상태) */
export const LAYER_GAP = 9;
const SLAB_Y = 0.12;

export type TileLook = { color: string; height: number; opacity: number };

/** 한 파일의 자리. 네 층 모두 같은 자리에 놓여서 위아래로 이어 읽을 수 있다 */
export type LayerTile = {
  path: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  looks: Record<GroundLayerId, TileLook>;
};

/** 지적 하나 = 핀 하나. marks 는 층별 판단 */
export type LayerPin = {
  id: number;
  x: number;
  z: number;
  severity: Severity;
  status: GroundStatus;
  title: string;
  marks: Record<GroundLayerId, GroundMark>;
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  BLOCKER: "#f43f5e",
  MAJOR: "#fb923c",
  MINOR: "#a1a1aa",
  INFO: "#71717a",
};
const REFUTED_COLOR = "#64748b";
const X_COLOR = "#ef4444";

type GapRef = MutableRefObject<number>;

/** 처음엔 층이 겹쳐 있다가 위로 펼쳐진다. explode 가 바뀌면 다시 접거나 편다 */
function Animator({ gap, target }: { gap: GapRef; target: number }) {
  useFrame((_, dt) => {
    gap.current += (target - gap.current) * Math.min(1, dt * 3.2);
  });
  return null;
}

const layerY = (index: number, gap: number) => index * gap;

function Slab({
  id,
  index,
  size,
  gap,
  tiles,
  note,
  count,
  focus,
}: {
  id: GroundLayerId;
  index: number;
  size: number;
  gap: GapRef;
  tiles: LayerTile[];
  note: string | null;
  count: number;
  focus: Set<string> | null;
}) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (group.current) group.current.position.y = layerY(index, gap.current);
  });
  const meta = LAYER_META[id];
  const span = size + 6;
  return (
    <group ref={group}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[span, SLAB_Y * 2, span]} />
        <meshStandardMaterial color={meta.color} emissive={meta.color} emissiveIntensity={0.25} transparent opacity={0.07} depthWrite={false} />
        <Edges color={meta.color} />
      </mesh>
      {tiles.map((t) => {
        const look = t.looks[id];
        const dim = focus && !focus.has(t.path);
        return (
          <mesh key={t.path} position={[t.x, SLAB_Y + look.height / 2, t.z]}>
            <boxGeometry args={[t.w, look.height, t.d]} />
            <meshStandardMaterial
              color={look.color}
              emissive={look.color}
              emissiveIntensity={dim ? 0.05 : 0.35}
              transparent
              opacity={dim ? look.opacity * 0.25 : look.opacity}
              depthWrite={look.opacity >= 1}
            />
          </mesh>
        );
      })}
      <Html position={[-span / 2, SLAB_Y, span / 2]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div className="gl-slab-label" style={{ borderColor: meta.color }}>
          <b style={{ color: meta.color }}>
            {index + 1}. {meta.label}
          </b>
          <span>{count > 0 ? `확인한 지적 ${count}` : (note ?? meta.hint)}</span>
        </div>
      </Html>
    </group>
  );
}

/**
 * 핀: 확인한 층(●)은 굵은 기둥으로 잇고, 맥락만 있는 층(○)은 가는 기둥으로 이어 내려간다.
 * 반박된 층에는 ✕ 를 놓고 기둥은 회색이 된다. 머리는 가장 위 층 위에 있다.
 */
function Pin({
  pin,
  gap,
  selected,
  dimmed,
  onSelect,
}: {
  pin: LayerPin;
  gap: GapRef;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const solid = useRef<Mesh>(null);
  const faint = useRef<Mesh>(null);
  const head = useRef<Group>(null);
  const markers = useRef<(Group | null)[]>([]);

  const marked = LAYER_ORDER.map((id, i) => ({ id, i, mark: pin.marks[id] })).filter((m) => m.mark !== "NONE");
  const confirmed = marked.filter((m) => m.mark === "CONFIRMED").map((m) => m.i);
  const all = marked.map((m) => m.i);
  const top = all.length ? Math.max(...all) : LAYER_ORDER.length - 1;
  const bottom = all.length ? Math.min(...all) : top;
  const refuted = pin.status === "REFUTED";
  const color = refuted ? REFUTED_COLOR : SEVERITY_COLOR[pin.severity];
  const opacity = dimmed ? 0.18 : 1;

  useFrame(() => {
    const g = gap.current;
    const place = (mesh: Mesh | null, from: number, to: number) => {
      if (!mesh) return;
      const y0 = layerY(from, g) + SLAB_Y;
      const y1 = layerY(to, g) + SLAB_Y;
      const len = Math.max(0.001, y1 - y0);
      mesh.visible = to > from;
      mesh.scale.y = len;
      mesh.position.y = (y0 + y1) / 2;
    };
    if (confirmed.length) place(solid.current, Math.min(...confirmed), Math.max(...confirmed, top));
    else if (solid.current) solid.current.visible = false;
    place(faint.current, bottom, top);
    marked.forEach((m, k) => {
      const node = markers.current[k];
      if (node) node.position.y = layerY(m.i, g) + SLAB_Y + 0.35;
    });
    if (head.current) head.current.position.y = layerY(top, g) + SLAB_Y + 2.2;
  });

  const events = {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setHover(true);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHover(false);
      document.body.style.cursor = "";
    },
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(pin.id);
    },
  };

  return (
    <group position={[pin.x, 0, pin.z]}>
      <mesh ref={faint}>
        <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.35 * opacity} />
      </mesh>
      <mesh ref={solid} {...events}>
        <cylinderGeometry args={[selected ? 0.22 : 0.15, selected ? 0.22 : 0.15, 1, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected || hover ? 1.4 : 0.8} transparent opacity={opacity} />
      </mesh>
      {marked.map((m, k) => (
        <group key={m.id} ref={(node) => void (markers.current[k] = node)}>
          {m.mark === "CONFIRMED" && (
            <mesh {...events}>
              <sphereGeometry args={[selected ? 0.6 : 0.45, 20, 20]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} transparent opacity={opacity} />
            </mesh>
          )}
          {m.mark === "RELATED" && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} {...events}>
              <torusGeometry args={[0.55, 0.08, 10, 32]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.8 * opacity} />
            </mesh>
          )}
          {m.mark === "REFUTED" && (
            <group {...events}>
              {[Math.PI / 4, -Math.PI / 4].map((r) => (
                <mesh key={r} rotation={[0, r, 0]}>
                  <boxGeometry args={[1.6, 0.18, 0.18]} />
                  <meshStandardMaterial color={X_COLOR} emissive={X_COLOR} emissiveIntensity={1.4} transparent opacity={opacity} />
                </mesh>
              ))}
            </group>
          )}
        </group>
      ))}
      <group ref={head} {...events}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[selected ? 0.75 : 0.55, 1.4, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected || hover ? 1.5 : 0.9} transparent opacity={opacity} />
        </mesh>
        {(hover || selected) && (
          <Html position={[0, 1.1, 0]} center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
            <div className="gl-pin-tip">
              <i style={{ background: color }} />
              {pin.title}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

/**
 * 근거 층 분해도. 아래에서 위로 코드 인덱스 · git 이력 · 실행 · AI 판단 층을 띄우고,
 * 이 PR 이 닿는 파일을 네 층의 같은 자리에 놓는다. 지적은 핀으로 꽂혀 확인한 층까지 내려간다.
 */
export function GroundLayers({
  size,
  tiles,
  pins,
  notes,
  counts,
  selected,
  onSelect,
  exploded,
}: {
  size: number;
  tiles: LayerTile[];
  pins: LayerPin[];
  /** 층 이름표 아래 한 줄 (확인한 지적이 없을 때) */
  notes: Partial<Record<GroundLayerId, string>>;
  /** 층별로 확인(●)한 지적 수 */
  counts: Record<GroundLayerId, number>;
  selected: number | null;
  onSelect: (id: number | null) => void;
  exploded: boolean;
}) {
  const gap = useRef(0.6);
  const focusPin = pins.find((p) => p.id === selected) ?? null;
  const focus = focusPin ? new Set(tiles.filter((t) => Math.hypot(t.x - focusPin.x, t.z - focusPin.z) < Math.max(t.w, t.d)).map((t) => t.path)) : null;
  const height = LAYER_GAP * (LAYER_ORDER.length - 1);
  // 네 층과 이름표가 한 화면에 들어오도록 장면 크기에 맞춰 물러선다
  const reach = Math.max(size * 1.3, height * 1.5) * 1.55;
  const dir = [0.62, 0.5, 0.78];
  const len = Math.hypot(...dir);
  const camera: [number, number, number] = [
    (dir[0] / len) * reach,
    height * 0.45 + (dir[1] / len) * reach,
    (dir[2] / len) * reach,
  ];
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: camera, fov: 40, near: 0.5, far: reach * 6 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#07070d"]} />
      <fog attach="fog" args={["#07070d", size * 2.2, size * 5]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#a5b4fc", "#0b0b14", 0.5]} />
      <directionalLight position={[size, size * 2, size * 0.6]} intensity={1.1} />
      <Animator gap={gap} target={exploded ? LAYER_GAP : 0.6} />
      {LAYER_ORDER.map((id, i) => (
        <Slab key={id} id={id} index={i} size={size} gap={gap} tiles={tiles} note={notes[id] ?? null} count={counts[id]} focus={focus} />
      ))}
      {pins.map((p) => (
        <Pin key={p.id} pin={p} gap={gap} selected={selected === p.id} dimmed={selected != null && selected !== p.id} onSelect={onSelect} />
      ))}
      <OrbitControls makeDefault enableDamping target={[0, height * 0.45, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={size * 0.4} maxDistance={size * 4} />
    </Canvas>
  );
}
