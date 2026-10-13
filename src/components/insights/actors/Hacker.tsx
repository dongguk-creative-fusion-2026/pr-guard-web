"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, CatmullRomCurve3, DoubleSide, LatheGeometry, SphereGeometry, Vector2, Vector3, type BufferGeometry, type Group, type Material, type Mesh, type MeshBasicMaterial } from "three";
import { hologramMaterial } from "./hologram";
import { codeTexture } from "./textures";

const RED = "#ff2236";
const MASK = "#ffd6da";
const LINE = "#fff4f5";

/** 후드 앞쪽 트인 폭 (라디안) */
const HOOD_OPEN = 1.1;
/** 두 손가락 끝 (로컬). 여기서 도시로 실이 내려간다 */
export const HACKER_HANDS: [number, number, number][] = [
  [-1.25, 1.35, 1.75],
  [1.25, 1.35, 1.75],
];

/** 각진 가면: 면이 보이게 쪼갠 구를 아래로 갈수록 좁혀 턱을 뾰족하게 */
function maskGeometry(): BufferGeometry {
  const g = new SphereGeometry(0.5, 14, 12).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const narrow = y < 0 ? 1 + y * 1.25 : 1 - y * 0.25;
    p.setX(i, p.getX(i) * narrow);
    p.setZ(i, p.getZ(i) * (y < 0 ? 1 + y * 0.6 : 1));
  }
  g.computeVertexNormals();
  return g;
}

/** 후드: 아래는 어깨 폭, 위로 갈수록 좁아져 뒤로 뾰족한 두건. 앞(+z)이 세로로 트인 회전체 */
function hoodGeometry(): BufferGeometry {
  const profile = [
    [0.5, 0],
    [0.56, 0.2],
    [0.52, 0.48],
    [0.45, 0.74],
    [0.35, 0.97],
    [0.21, 1.14],
    [0.07, 1.25],
    [0.0, 1.29],
  ].map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(profile, 48, HOOD_OPEN / 2, Math.PI * 2 - HOOD_OPEN);
}

/** 몸통 옆모습: 목 → 처진 어깨 → 가슴 → 허리 */
function torsoGeometry(): BufferGeometry {
  const profile = [
    [0.0, 1.78],
    [0.34, 1.76],
    [0.6, 1.66],
    [0.92, 1.5],
    [1.08, 1.32],
    [1.06, 1.05],
    [0.96, 0.6],
    [0.9, 0.0],
  ]
    .reverse()
    .map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(profile, 48);
}

/** 소매 곡선: 어깨 → 아래로 처진 팔꿈치 → 손목 */
function sleeveCurve(side: number) {
  return new CatmullRomCurve3([
    new Vector3(1.05 * side, 1.38, 0),
    new Vector3(1.35 * side, 0.95, 0.55),
    new Vector3(1.32 * side, 1.15, 1.2),
    new Vector3(1.28 * side, 1.38, 1.48),
  ]);
}

/** 끝이 뾰족하게 말려 올라간 콧수염 한쪽 */
function mustacheCurve(side: number) {
  return new CatmullRomCurve3([
    new Vector3(0.015 * side, -0.1, 0.28),
    new Vector3(0.12 * side, -0.13, 0.26),
    new Vector3(0.22 * side, -0.1, 0.21),
    new Vector3(0.27 * side, 0.0, 0.17),
    new Vector3(0.25 * side, 0.06, 0.16),
  ]);
}

/** 손가락 하나: 세 마디가 아래로 굽는다 */
function Finger({ length, curl, material }: { length: number; curl: number; material: Material }) {
  const seg = length / 3;
  return (
    <group rotation={[curl * 0.6, 0, 0]}>
      <mesh position={[0, 0, seg / 2]} rotation={[Math.PI / 2, 0, 0]} material={material}>
        <capsuleGeometry args={[0.05, seg, 4, 8]} />
      </mesh>
      <group position={[0, 0, seg]} rotation={[curl, 0, 0]}>
        <mesh position={[0, 0, seg / 2]} rotation={[Math.PI / 2, 0, 0]} material={material}>
          <capsuleGeometry args={[0.044, seg, 4, 8]} />
        </mesh>
        <group position={[0, 0, seg]} rotation={[curl * 0.8, 0, 0]}>
          <mesh position={[0, 0, seg / 2]} rotation={[Math.PI / 2, 0, 0]} material={material}>
            <capsuleGeometry args={[0.038, seg * 0.85, 4, 8]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** 거대한 손: 손등이 위, 길고 마른 손가락들이 인형사처럼 아래로 굽어 늘어진다 */
function Hand({ position, side, material }: { position: [number, number, number]; side: number; material: Material }) {
  const fingers = [
    { x: -0.15, len: 0.5, curl: 0.42 },
    { x: -0.05, len: 0.58, curl: 0.36 },
    { x: 0.05, len: 0.56, curl: 0.4 },
    { x: 0.15, len: 0.46, curl: 0.5 },
  ];
  return (
    <group position={position} rotation={[1.0, -0.15 * side, 0.12 * side]}>
      {/* 손등: 납작한 타원체 */}
      <mesh scale={[0.22, 0.07, 0.26]} material={material}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      {/* 손목 */}
      <mesh position={[0, 0.02, -0.32]} rotation={[Math.PI / 2, 0, 0]} material={material}>
        <cylinderGeometry args={[0.12, 0.14, 0.3, 16, 1, true]} />
      </mesh>
      {fingers.map((f) => (
        <group key={f.x} position={[f.x * side, 0, 0.22]} rotation={[0, f.x * side * 1.4, 0]}>
          <Finger length={f.len} curl={f.curl} material={material} />
        </group>
      ))}
      {/* 엄지 */}
      <group position={[-0.2 * side, -0.02, 0.02]} rotation={[0.2, -0.9 * side, 0]}>
        <Finger length={0.36} curl={0.3} material={material} />
      </group>
    </group>
  );
}

/**
 * 도시 너머 하늘에 떠오른 거대한 해커 홀로그램. 앞으로 깊게 눌러쓴 후드 그늘 속 각진 흰 가면
 * (가운데로 찌푸린 눈썹 · 붉게 타는 눈 틈 · 끝이 뾰족한 콧수염 · 날카로운 턱수염 · 비웃는 입),
 * 꼭두각시 인형사처럼 도시 위로 두 손을 늘어뜨린다. 붉은 홀로그램 재질에 주사선이 흐르고
 * 가끔 가로 띠가 어긋나며 끊긴다. 로컬 높이 ≈ 3 (scale 로 키운다), 앞 = +z
 */
export function Hacker({
  position,
  rotation = 0,
  scale = 1,
  presence = 1,
}: {
  position: [number, number, number];
  rotation?: number;
  scale?: number;
  /** 얼마나 또렷한가 (0 = 사라짐). 바뀌면 서서히 따라가고, 사라질 때는 크게 지직거린다 */
  presence?: number;
}) {
  const root = useRef<Group>(null);
  const sway = useRef<Group>(null);
  const shown = useRef(0);
  const basics = useRef<{ material: MeshBasicMaterial; base: number }[] | null>(null);
  const cloak = useMemo(() => hologramMaterial(RED, { base: 0.035, rim: 1.15, lines: 0.06 }), []);
  const hand = useMemo(() => hologramMaterial(RED, { base: 0.08, rim: 1.2, lines: 0.06 }), []);
  const mask = useMemo(() => hologramMaterial(MASK, { base: 0.38, rim: 1.0, lines: 0.09 }), []);
  const maskShape = useMemo(maskGeometry, []);
  const hoodShape = useMemo(hoodGeometry, []);
  const torsoShape = useMemo(torsoGeometry, []);
  const sleeves = useMemo(() => [sleeveCurve(-1), sleeveCurve(1)], []);
  const curves = useMemo(() => [mustacheCurve(-1), mustacheCurve(1)], []);
  const codes = useMemo(() => [codeTexture(RED), codeTexture("#ff5a3d"), codeTexture(RED)], []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const fading = presence < shown.current - 0.02;
    shown.current += (presence - shown.current) * Math.min(1, dt * (fading ? 1.4 : 2.2));
    const p = shown.current;
    if (root.current) root.current.visible = p > 0.02;
    // 선 · 코드 같은 일반 재질은 처음 불투명도를 기억해 두고 p 만큼 줄인다
    if (!basics.current && root.current) {
      basics.current = [];
      root.current.traverse((o) => {
        const material = (o as Mesh).material as MeshBasicMaterial | undefined;
        if (material && "isMeshBasicMaterial" in material && material.transparent) basics.current!.push({ material, base: material.opacity });
      });
    }
    basics.current?.forEach(({ material, base }) => (material.opacity = base * p));
    // 대체로 은은히 떨리다가 2.7초에 한 번 크게 지직거린다. 사라지는 중에는 계속 지직거린다
    const cut = fading || t % 2.7 < 0.16;
    const flicker = (cut ? 0.55 : 0.9 + Math.sin(t * 47) * 0.05 + Math.sin(t * 13) * 0.05) * p;
    for (const m of [cloak, hand, mask]) {
      m.uniforms.uTime.value = t;
      m.uniforms.uFlicker.value = flicker;
      m.uniforms.uGlitch.value = cut ? scale * (fading ? 0.5 : 0.18) : 0;
    }
    if (sway.current) {
      sway.current.rotation.y = Math.sin(t * 0.25) * 0.04;
      sway.current.position.y = Math.sin(t * 0.5) * 0.02;
    }
    codes.forEach((c, i) => (c.offset.y = (t * (0.06 + i * 0.025)) % 1));
  });

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]} scale={scale}>
      <group ref={sway}>
        {/* 몸통: 처진 어깨에서 가슴으로 내려오는 망토 (앞뒤로 납작) */}
        <mesh geometry={torsoShape} scale={[1.2, 1, 0.55]} material={cloak} />
        {/* 소매: 어깨에서 팔꿈치를 거쳐 손목까지 */}
        {sleeves.map((curve, i) => (
          <mesh key={i} material={cloak}>
            <tubeGeometry args={[curve, 32, 0.17, 16, false]} />
          </mesh>
        ))}

        {/* 후드에서 어깨로 흘러내리는 두건 자락 */}
        <mesh position={[0, 1.62, 0]} scale={[1, 1, 0.85]} material={cloak}>
          <cylinderGeometry args={[0.5, 0.95, 0.5, 40, 1, true]} />
        </mesh>

        {/* 후드 그늘: 가면 뒤와 이마 위를 덮는 어둠 */}
        <mesh position={[0, 2.22, -0.06]} scale={[1, 1.25, 1]}>
          <sphereGeometry args={[0.4, 32, 20]} />
          <meshBasicMaterial color="#030003" />
        </mesh>
        {/* 후드: 끝이 뾰족한 수도사 두건. 앞이 세로로 트이고 살짝 앞으로 숙여 이마를 덮는다 */}
        <mesh geometry={hoodShape} position={[0, 1.55, -0.04]} rotation={[0.14, 0, 0]} scale={[1, 1, 1.15]} material={cloak} />

        {/* 가면 */}
        <group position={[0, 2.15, 0.22]} scale={0.68}>
          <mesh geometry={maskShape} scale={[0.86, 1.18, 0.56]} material={mask} />
          {[-1, 1].map((s) => (
            <group key={s}>
              {/* 가운데로 처진 날카로운 눈 틈 */}
              <mesh position={[0.15 * s, 0.1, 0.25]} rotation={[0, 0, 0.32 * s]} scale={[1.9, 0.32, 0.4]}>
                <sphereGeometry args={[0.07, 16, 8]} />
                <meshBasicMaterial color="#000000" />
              </mesh>
              {/* 눈 속 타는 붉은 빛과 번짐 */}
              <mesh position={[0.15 * s, 0.1, 0.275]}>
                <sphereGeometry args={[0.022, 12, 8]} />
                <meshBasicMaterial color="#ffe1e4" />
              </mesh>
              <mesh position={[0.15 * s, 0.1, 0.27]} scale={[2.4, 1, 1]}>
                <sphereGeometry args={[0.05, 16, 8]} />
                <meshBasicMaterial color={RED} transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
              </mesh>
              {/* 가운데로 꺾여 내려온 눈썹 */}
              <mesh position={[0.15 * s, 0.22, 0.25]} rotation={[0, 0, -0.38 * s]}>
                <boxGeometry args={[0.24, 0.018, 0.02]} />
                <meshBasicMaterial color={LINE} transparent opacity={0.95} blending={AdditiveBlending} />
              </mesh>
              {/* 끝이 뾰족하게 말려 올라간 콧수염 */}
              <mesh>
                <tubeGeometry args={[curves[s < 0 ? 0 : 1], 24, 0.011, 6, false]} />
                <meshBasicMaterial color={LINE} transparent opacity={0.95} blending={AdditiveBlending} />
              </mesh>
            </group>
          ))}
          {/* 비웃는 입: 한쪽만 살짝 올라간 가는 선 */}
          <mesh position={[0.01, -0.2, 0.22]} rotation={[0, 0, 0.08]}>
            <boxGeometry args={[0.2, 0.01, 0.02]} />
            <meshBasicMaterial color={LINE} transparent opacity={0.8} blending={AdditiveBlending} />
          </mesh>
          {/* 날카로운 턱수염 */}
          <mesh position={[0, -0.36, 0.15]} rotation={[Math.PI + 0.3, 0, 0]}>
            <coneGeometry args={[0.035, 0.2, 4]} />
            <meshBasicMaterial color={LINE} transparent opacity={0.9} blending={AdditiveBlending} />
          </mesh>
        </group>

        {/* 도시 위로 늘어뜨린 두 손 */}
        <Hand position={HACKER_HANDS[0]} side={-1} material={hand} />
        <Hand position={HACKER_HANDS[1]} side={1} material={hand} />

        {/* 어깨 뒤로 흘러내리는 공격 코드 기둥 */}
        {[
          { x: -2.6, z: -0.6, ry: 0.4, h: 3.4, i: 0 },
          { x: 2.6, z: -0.6, ry: -0.4, h: 3.2, i: 1 },
          { x: -3.4, z: -1.2, ry: 0.6, h: 2.6, i: 2 },
          { x: 3.4, z: -1.2, ry: -0.6, h: 2.8, i: 0 },
        ].map(({ x, z, ry, h, i }, k) => (
          <mesh key={k} position={[x, h / 2, z]} rotation={[0, ry, 0]}>
            <planeGeometry args={[0.8, h]} />
            <meshBasicMaterial map={codes[i]} transparent opacity={0.4} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
