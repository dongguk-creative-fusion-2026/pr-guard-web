"use client";

import { Edges, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useState, type MutableRefObject } from "react";
import { Vector3, type Group, type Mesh } from "three";
import type { GroundLayerId, GroundMark, GroundStatus, Severity } from "@/lib/api";
import { LAYER_META, LAYER_ORDER } from "@/lib/grounding";

/** 층 사이 간격 (펼친 상태). 한 건물의 층처럼 보이도록 좁게 */
export const LAYER_GAP = 5.5;
const FOLDED_GAP = 0.5;
const SLAB_Y = 0.06;

/**
 * 파일 하나 = 네 층을 관통하는 기둥 하나. signal 은 층마다 0~1 (그 층에서 이 파일이 얼마나 두드러지는지)
 * labeled 면 기둥 위에 이름표를 단다 (지적이 있는 파일)
 */
export type LayerTile = {
  path: string;
  name: string;
  x: number;
  z: number;
  size: number;
  signal: Record<GroundLayerId, number>;
  labeled: boolean;
};

/** 지적 하나 = 핀 하나. marks 는 층별 판단 */
export type LayerPin = {
  id: number;
  path: string;
  x: number;
  z: number;
  severity: Severity;
  status: GroundStatus;
  title: string;
  marks: Record<GroundLayerId, GroundMark>;
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  BLOCKER: "#f07a7a",
  MAJOR: "#e5b84b",
  MINOR: "#a1a1aa",
  INFO: "#8b8b95",
};
const REFUTED_COLOR = "#6b6b75";
const X_COLOR = "#f07a7a";

type GapRef = MutableRefObject<number>;
const layerY = (index: number, gap: number) => index * gap;

function Animator({ gap, target }: { gap: GapRef; target: number }) {
  useFrame((_, dt) => {
    gap.current += (target - gap.current) * Math.min(1, dt * 3);
  });
  return null;
}

/** 층 하나: 얇은 판과 그 층에서 본 파일들 (같은 자리, 층 색 하나, 신호가 셀수록 진하고 높다) */
function Slab({
  id,
  index,
  span,
  gap,
  tiles,
  active,
}: {
  id: GroundLayerId;
  index: number;
  span: number;
  gap: GapRef;
  tiles: LayerTile[];
  active: string | null;
}) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (group.current) group.current.position.y = layerY(index, gap.current);
  });
  const color = LAYER_META[id].color;
  return (
    <group ref={group}>
      <mesh>
        <boxGeometry args={[span, SLAB_Y * 2, span]} />
        <meshBasicMaterial color={color} transparent opacity={0.035} depthWrite={false} />
        <Edges color={color} transparent opacity={0.35} />
      </mesh>
      {tiles.map((t) => {
        const s = t.signal[id];
        const on = active === t.path;
        const h = 0.18 + s * 1.5;
        return (
          <mesh key={t.path} position={[t.x, SLAB_Y + h / 2, t.z]}>
            <boxGeometry args={[t.size, h, t.size]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={on ? 0.6 : 0.15 + s * 0.35}
              transparent
              opacity={s > 0 ? 0.25 + s * 0.7 : on ? 0.25 : 0.07}
              depthWrite={s > 0.5}
            />
            {(s > 0 || on) && <Edges color={on ? "#ffffff" : color} transparent opacity={on ? 0.9 : 0.5} />}
          </mesh>
        );
      })}
    </group>
  );
}

/** 파일 기둥: 맨 아래 층에서 맨 위 층까지. 고른 파일은 밝게 */
function Columns({
  tiles,
  gap,
  active,
  onHover,
}: {
  tiles: LayerTile[];
  gap: GapRef;
  active: string | null;
  onHover: (path: string | null) => void;
}) {
  const refs = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    const top = layerY(LAYER_ORDER.length - 1, gap.current) + SLAB_Y;
    refs.current.forEach((m) => {
      if (!m) return;
      m.scale.y = Math.max(0.01, top);
      m.position.y = top / 2;
    });
  });
  return (
    <>
      {tiles.map((t, i) => {
        const on = active === t.path;
        return (
          <mesh
            key={t.path}
            ref={(m) => void (refs.current[i] = m)}
            position={[t.x, 0, t.z]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover(t.path);
            }}
            onPointerOut={() => onHover(null)}
          >
            <boxGeometry args={[t.size, 1, t.size]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={on ? 0.05 : 0} depthWrite={false} />
            <Edges color="#ffffff" transparent opacity={on ? 0.5 : 0.07} />
          </mesh>
        );
      })}
    </>
  );
}

/**
 * 지적 핀: 확인한 층(●)부터 위로 굵은 선, 맥락만 있는 층(○)까지는 가는 선.
 * 어긋난 층에는 ✕. 머리는 맨 위 층 위
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
  const solid = useRef<Mesh>(null);
  const faint = useRef<Mesh>(null);
  const head = useRef<Mesh>(null);
  const markers = useRef<(Group | null)[]>([]);

  const marked = LAYER_ORDER.map((id, i) => ({ id, i, mark: pin.marks[id] })).filter((m) => m.mark !== "NONE");
  const confirmed = marked.filter((m) => m.mark === "CONFIRMED").map((m) => m.i);
  const lowest = marked.length ? Math.min(...marked.map((m) => m.i)) : LAYER_ORDER.length - 1;
  const top = LAYER_ORDER.length - 1;
  const color = pin.status === "REFUTED" ? REFUTED_COLOR : SEVERITY_COLOR[pin.severity];
  const opacity = dimmed ? 0.15 : 1;

  useFrame(() => {
    const g = gap.current;
    const stretch = (mesh: Mesh | null, from: number) => {
      if (!mesh) return;
      const y0 = layerY(from, g) + SLAB_Y;
      const y1 = layerY(top, g) + SLAB_Y + 1.2;
      mesh.scale.y = Math.max(0.01, y1 - y0);
      mesh.position.y = (y0 + y1) / 2;
    };
    if (confirmed.length) {
      stretch(solid.current, Math.min(...confirmed));
      if (solid.current) solid.current.visible = true;
    } else if (solid.current) solid.current.visible = false;
    stretch(faint.current, lowest);
    marked.forEach((m, k) => {
      const node = markers.current[k];
      if (node) node.position.y = layerY(m.i, g) + SLAB_Y + 0.25;
    });
    if (head.current) head.current.position.y = layerY(top, g) + SLAB_Y + 1.5;
  });

  const click = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect(pin.id);
  };

  return (
    <group position={[pin.x, 0, pin.z]}>
      <mesh ref={faint}>
        <cylinderGeometry args={[0.035, 0.035, 1, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.45 * opacity} />
      </mesh>
      <mesh ref={solid} onClick={click}>
        <cylinderGeometry args={[selected ? 0.12 : 0.08, selected ? 0.12 : 0.08, 1, 10]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      {marked.map((m, k) => (
        <group key={m.id} ref={(node) => void (markers.current[k] = node)} onClick={click}>
          {m.mark === "CONFIRMED" && (
            <mesh>
              <sphereGeometry args={[selected ? 0.34 : 0.26, 16, 16]} />
              <meshBasicMaterial color={color} transparent opacity={opacity} />
            </mesh>
          )}
          {m.mark === "RELATED" && (
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.32, 0.05, 8, 28]} />
              <meshBasicMaterial color={color} transparent opacity={0.8 * opacity} />
            </mesh>
          )}
          {m.mark === "REFUTED" &&
            [Math.PI / 4, -Math.PI / 4].map((r) => (
              <mesh key={r} rotation={[0, r, 0]}>
                <boxGeometry args={[0.9, 0.1, 0.1]} />
                <meshBasicMaterial color={X_COLOR} transparent opacity={opacity} />
              </mesh>
            ))}
        </group>
      ))}
      <mesh ref={head} onClick={click}>
        <octahedronGeometry args={[selected ? 0.5 : 0.38, 0]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

/** 이름표들(층 · 파일)을 매 프레임 3D 좌표에서 화면 좌표로 옮긴다. drei Html 대신 일반 DOM */
function Projector({
  layerEls,
  fileEls,
  tiles,
  span,
  gap,
}: {
  layerEls: MutableRefObject<(HTMLDivElement | null)[]>;
  fileEls: MutableRefObject<Map<string, HTMLDivElement>>;
  tiles: LayerTile[];
  span: number;
  gap: GapRef;
}) {
  const { camera, size } = useThree();
  const v = useRef(new Vector3());
  useFrame(() => {
    const place = (el: HTMLDivElement | null | undefined, x: number, y: number, z: number) => {
      if (!el) return;
      v.current.set(x, y, z).project(camera);
      el.style.transform = `translate(${Math.round(((v.current.x + 1) / 2) * size.width)}px, ${Math.round(((1 - v.current.y) / 2) * size.height)}px)`;
      el.style.visibility = v.current.z < 1 ? "visible" : "hidden";
    };
    LAYER_ORDER.forEach((_, i) => place(layerEls.current[i], -span / 2, layerY(i, gap.current) + SLAB_Y, span / 2));
    // 파일 이름표: 맨 아래 층 아래, 기둥 앞쪽 (같은 줄의 파일은 가로로 벌어져 겹치지 않는다)
    for (const t of tiles) place(fileEls.current.get(t.path), t.x, -0.6, t.z + t.size / 2);
  });
  return null;
}

/**
 * 근거 층 분해도. 아래에서 위로 코드 인덱스 · git 이력 · 실행 · AI 판단 층을 한 건물처럼 쌓고,
 * 이 PR 이 닿는 파일을 네 층을 관통하는 기둥으로 세운다. 지적은 핀으로 꽂혀 확인한 층까지 내려간다.
 */
export function GroundLayers({
  span,
  tiles,
  pins,
  notes,
  counts,
  selected,
  onSelect,
  exploded,
}: {
  span: number;
  tiles: LayerTile[];
  pins: LayerPin[];
  notes: Partial<Record<GroundLayerId, string>>;
  counts: Record<GroundLayerId, number>;
  selected: number | null;
  onSelect: (id: number | null) => void;
  exploded: boolean;
}) {
  const gap = useRef(FOLDED_GAP);
  const layerEls = useRef<(HTMLDivElement | null)[]>([]);
  const fileEls = useRef(new Map<string, HTMLDivElement>());
  const [hover, setHover] = useState<string | null>(null);
  const selectedPin = pins.find((p) => p.id === selected) ?? null;
  const active = hover ?? selectedPin?.path ?? null;

  const height = LAYER_GAP * (LAYER_ORDER.length - 1);
  const reach = Math.max(span * 1.3, height * 1.7) * 1.75;
  const dir = [0.66, 0.52, 0.8];
  const len = Math.hypot(...dir);
  const camera: [number, number, number] = [(dir[0] / len) * reach, height * 0.4 + (dir[1] / len) * reach, (dir[2] / len) * reach];

  return (
    <div className="gl-canvas">
      <Canvas dpr={[1, 2]} camera={{ position: camera, fov: 38, near: 0.5, far: reach * 6 }} onPointerMissed={() => onSelect(null)}>
        <color attach="background" args={["#0e0e11"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[span, span * 2, span * 0.6]} intensity={0.8} />
        <Animator gap={gap} target={exploded ? LAYER_GAP : FOLDED_GAP} />
        {LAYER_ORDER.map((id, i) => (
          <Slab key={id} id={id} index={i} span={span} gap={gap} tiles={tiles} active={active} />
        ))}
        <Columns tiles={tiles} gap={gap} active={active} onHover={setHover} />
        {pins.map((p) => (
          <Pin key={p.id} pin={p} gap={gap} selected={selected === p.id} dimmed={selected != null && selected !== p.id} onSelect={onSelect} />
        ))}
        <Projector layerEls={layerEls} fileEls={fileEls} tiles={tiles} span={span} gap={gap} />
        <OrbitControls makeDefault enableDamping target={[0, height * 0.4, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={span * 0.5} maxDistance={reach * 2.5} />
      </Canvas>
      {LAYER_ORDER.map((id, i) => (
        <div key={id} ref={(el) => void (layerEls.current[i] = el)} className="gl-slab-label">
          <b style={{ color: LAYER_META[id].color }}>{LAYER_META[id].label}</b>
          <span>{counts[id] > 0 ? `확인 ${counts[id]}` : (notes[id] ?? "")}</span>
        </div>
      ))}
      {tiles.map((t) => (
        <div
          key={t.path}
          ref={(el) => {
            if (el) fileEls.current.set(t.path, el);
            else fileEls.current.delete(t.path);
          }}
          className={`gl-file-label${t.labeled || active === t.path ? " on" : ""}${active === t.path ? " active" : ""}`}
        >
          {t.name}
        </div>
      ))}
    </div>
  );
}
