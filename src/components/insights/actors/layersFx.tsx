"use client";

import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, type Group, type Mesh, type MeshBasicMaterial } from "three";
import type { GroundLayerId } from "@/lib/api";
import { LAYER_META, LAYER_ORDER } from "@/lib/grounding";
import type { Building } from "../CodeCity";
import { AttackBeam } from "./effects";
import type { HiddenPartner } from "./hiddenCoupling";
import type { ShowGrounded } from "./reviewShow";
import { textTexture } from "./textures";

const PIN_COLOR = { CONFIRMED: "#38e1ff", AI_ONLY: "#facc15", REFUTED: "#ff4d5e" } as const;
/** 층이 하나씩 솟는 간격과 핀이 꽂히기 시작하는 때 (ms) */
const SLAB_STAGGER = 450;
const PINS_AT = 2000;
/** 오탐 핀이 부서지는 때 */
const BREAK_AT = 3600;

/** 층 판 하나: 땅에서 목표 높이로 떠오른다 */
function Slab({ layer, y, span, delay, elapsed }: { layer: GroundLayerId; y: number; span: number; delay: number; elapsed: number }) {
  const group = useRef<Group>(null);
  const fill = useRef<MeshBasicMaterial>(null);
  const label = useMemo(() => textTexture(LAYER_META[layer].label, LAYER_META[layer].color), [layer]);
  const shown = elapsed >= delay;
  useFrame((_, dt) => {
    if (!group.current) return;
    const target = shown ? y : 0;
    group.current.position.y += (target - group.current.position.y) * Math.min(1, dt * 3);
    group.current.visible = group.current.position.y > 0.5;
    if (fill.current) fill.current.opacity = 0.06 + Math.sin(performance.now() / 600 + delay) * 0.015;
  });
  const color = LAYER_META[layer].color;
  return (
    <group ref={group} position={[0, 0, 0]}>
      <mesh>
        <boxGeometry args={[span, 0.12, span]} />
        <meshBasicMaterial ref={fill} color={color} transparent opacity={0.06} depthWrite={false} blending={AdditiveBlending} />
        <Edges color={color} />
      </mesh>
      <sprite position={[-span / 2 + span * 0.12, span * 0.03, span / 2]} scale={[span * 0.24, span * 0.045, 1]}>
        <spriteMaterial map={label} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

/** 지적 하나의 핀: 건물 지붕에서 위로 솟아 층마다 확인 표시를 남긴다. 오탐이면 인덱스 층에서 부서진다 */
function Pin({
  finding,
  b,
  roof,
  layerY,
  size,
  elapsed,
}: {
  finding: ShowGrounded;
  b: Building;
  roof: number;
  layerY: (layer: GroundLayerId) => number;
  size: number;
  elapsed: number;
}) {
  const shaft = useRef<Mesh>(null);
  const color = PIN_COLOR[finding.status];
  const marks = finding.layers.filter((l) => l.mark !== "NONE");
  const top = Math.max(layerY("AI"), ...marks.map((l) => layerY(l.layer))) + size * 0.02;
  const broken = finding.status === "REFUTED" && elapsed > BREAK_AT;
  useFrame((_, dt) => {
    if (!shaft.current) return;
    const target = elapsed < PINS_AT ? 0.001 : broken ? 0.001 : 1;
    shaft.current.scale.y += (target - shaft.current.scale.y) * Math.min(1, dt * 3);
    shaft.current.position.y = roof + ((top - roof) * shaft.current.scale.y) / 2;
  });
  const r = size * 0.012;
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh ref={shaft} position={[0, roof, 0]} scale={[1, 0.001, 1]}>
        <cylinderGeometry args={[r * 0.35, r * 0.35, top - roof, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      {elapsed >= PINS_AT &&
        marks.map(({ layer, mark }) => {
          const y = layerY(layer);
          const c = LAYER_META[layer].color;
          if (mark === "CONFIRMED")
            return (
              <mesh key={layer} position={[0, y, 0]}>
                <sphereGeometry args={[r * 1.6, 16, 12]} />
                <meshBasicMaterial color={c} />
              </mesh>
            );
          if (mark === "RELATED")
            return (
              <mesh key={layer} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[r * 1.4, r * 2, 24]} />
                <meshBasicMaterial color={c} transparent opacity={0.85} />
              </mesh>
            );
          // 어긋남: 붉은 X
          return (
            <group key={layer} position={[0, y, 0]}>
              {[Math.PI / 4, -Math.PI / 4].map((a) => (
                <mesh key={a} rotation={[0, a, 0]}>
                  <boxGeometry args={[r * 6, r * 0.6, r * 0.6]} />
                  <meshBasicMaterial color={PIN_COLOR.REFUTED} />
                </mesh>
              ))}
            </group>
          );
        })}
      {broken && (
        // 부서진 조각이 흩어진다
        <group position={[0, layerY("INDEX"), 0]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Shard key={i} index={i} size={size} />
          ))}
        </group>
      )}
    </group>
  );
}

function Shard({ index, size }: { index: number; size: number }) {
  const mesh = useRef<Mesh>(null);
  const born = useRef(performance.now());
  const dir = useMemo(() => [Math.cos(index * 1.3) * 0.6, 0.5 + (index % 3) * 0.3, Math.sin(index * 1.3) * 0.6], [index]);
  useFrame(() => {
    if (!mesh.current) return;
    const t = (performance.now() - born.current) / 1000;
    mesh.current.position.set(dir[0] * t * size * 0.05, dir[1] * t * size * 0.05 - t * t * size * 0.03, dir[2] * t * size * 0.05);
    mesh.current.rotation.set(t * 4, t * 3, 0);
    (mesh.current.material as MeshBasicMaterial).opacity = Math.max(0, 1 - t * 0.8);
  });
  return (
    <mesh ref={mesh}>
      <boxGeometry args={[size * 0.008, size * 0.008, size * 0.008]} />
      <meshBasicMaterial color={PIN_COLOR.REFUTED} transparent />
    </mesh>
  );
}

/**
 * 근거 층 분해: 근거 확인 장면에서 도시 위로 코드 인덱스 → git 이력 → 실행 → AI 판단 네 층이 차례로 떠오르고,
 * 지적마다 그 건물에서 핀이 솟아 확인해 준 층(●) · 관련 맥락(○) · 어긋난 층(×)을 보여 준다
 */
export function GroundStack({
  size,
  byPath,
  grounded,
  elapsed,
  locate,
  roofOf,
  base,
}: {
  size: number;
  byPath: Map<string, Building>;
  grounded: ShowGrounded[];
  elapsed: number;
  locate: (file: string, byPath: Map<string, Building>) => Building | undefined;
  roofOf: (b: Building) => number;
  /** 가장 아래 층 높이 */
  base: number;
}) {
  const gap = size * 0.075;
  const layerY = (layer: GroundLayerId) => base + LAYER_ORDER.indexOf(layer) * gap;
  const span = size * 1.08;
  const pins = grounded.map((f) => ({ f, b: locate(f.file, byPath) })).filter((x): x is { f: ShowGrounded; b: Building } => !!x.b);
  return (
    <group>
      {LAYER_ORDER.map((layer, i) => (
        <Slab key={layer} layer={layer} y={layerY(layer)} span={span} delay={i * SLAB_STAGGER} elapsed={elapsed} />
      ))}
      {pins.map(({ f, b }, i) => (
        <Pin key={`${f.file}\n${f.title}\n${i}`} finding={f} b={b} roof={roofOf(b)} layerY={layerY} size={size} elapsed={elapsed} />
      ))}
    </group>
  );
}

/** 숨은 결합 케이블: 바뀐 건물과 늘 같이 바뀌던 짝 건물 사이 땅 위를 기는 호박색 선과 스파크, 짝 건물 밑동이 깜빡인다 */
export function CouplingCables({ partners, byPath, size }: { partners: HiddenPartner[]; byPath: Map<string, Building>; size: number }) {
  return (
    <group>
      {partners.map((p) => {
        const a = byPath.get(p.changed);
        const b = byPath.get(p.partner);
        if (!a || !b) return null;
        return (
          <group key={`${p.changed}\n${p.partner}`}>
            <AttackBeam from={[a.x, 0.9, a.z]} to={[b.x, 0.9, b.z]} lift={size * 0.03} color="#fbbf24" />
            <BlinkRing x={b.x} z={b.z} radius={Math.max(b.w, b.d) * 0.85} />
          </group>
        );
      })}
    </group>
  );
}

function BlinkRing({ x, z, radius }: { x: number; z: number; radius: number }) {
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    if (mat.current) mat.current.opacity = 0.35 + Math.abs(Math.sin(performance.now() / 260)) * 0.6;
  });
  return (
    <mesh position={[x, 0.9, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.85, radius, 48]} />
      <meshBasicMaterial ref={mat} color="#fbbf24" transparent blending={AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}
