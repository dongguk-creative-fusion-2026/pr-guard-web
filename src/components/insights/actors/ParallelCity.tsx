"use client";

import { Edges, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { AdditiveBlending, type Group, type MeshBasicMaterial } from "three";
import { GROUND, type Building } from "../CodeCity";
import { EXEC_T, testsDone, type ExecMock } from "./execDemo";
import { hologramMaterial } from "./hologram";
import { FlyingRobot } from "./ReviewShowScene";
import { textTexture } from "./textures";

const TWIN = "#9be7ff";
const PASS = "#4ade80";
const FAIL = "#ff4d5e";

/** 지그재그 번개: 0.09초마다 모양이 바뀐다 */
function Bolt({ from, to, color, jitter }: { from: [number, number, number]; to: [number, number, number]; color: string; jitter: number }) {
  const [seed, setSeed] = useState(0);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current > 0.09) {
      last.current = clock.elapsedTime;
      setSeed((s) => s + 1);
    }
  });
  const points = useMemo(() => {
    const steps = 10;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const j = i === 0 || i === steps ? 0 : jitter;
      pts.push([
        from[0] + (to[0] - from[0]) * k + (Math.random() - 0.5) * j,
        from[1] + (to[1] - from[1]) * k + (Math.random() - 0.5) * j * 0.3,
        from[2] + (to[2] - from[2]) * k + (Math.random() - 0.5) * j,
      ]);
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, from, to, jitter]);
  return (
    <group>
      <Line points={points} color={color} lineWidth={5} transparent opacity={0.35} />
      <Line points={points} color="#ffffff" lineWidth={1.6} />
    </group>
  );
}

/** 깨진 코드 위로 솟는 붉은 경보 기둥 */
function Alarm({ x, z, roof, radius, height }: { x: number; z: number; roof: number; radius: number; height: number }) {
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = 0.18 + Math.abs(Math.sin(clock.elapsedTime * 5)) * 0.22;
  });
  return (
    <mesh position={[x, roof + height / 2, z]}>
      <cylinderGeometry args={[radius * 0.6, radius, height, 24, 1, true]} />
      <meshBasicMaterial ref={mat} color={FAIL} transparent blending={AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

/** 이름표 판 */
function Tag({ text, color, position, width }: { text: string; color: string; position: [number, number, number]; width: number }) {
  const map = useMemo(() => textTexture(text, color), [text, color]);
  return (
    <sprite position={position} scale={[width, width * 0.1875, 1]}>
      <spriteMaterial map={map} transparent depthWrite={false} />
    </sprite>
  );
}

/**
 * 평행 도시 (실행 검증): 하늘에 PR 전(base) 도시가 거꾸로 매달린 홀로그램으로 내려오고, 아래 진짜 도시가 PR 후(head).
 * 두 도시의 테스트 건물이 차례로 켜지고(통과 초록), PR 전에는 통과했는데 후에는 깨진 테스트로 붉은 번개가 내리꽂힌 뒤
 * 그 테스트가 확인하는 코드 건물로 번져 경보가 솟는다. t = 장면 시작 뒤 ms
 */
export function ParallelCity({ size, byPath, mock, t }: { size: number; byPath: Map<string, Building>; mock: ExecMock; t: number }) {
  const twin = useRef<Group>(null);
  const holo = useMemo(() => hologramMaterial(TWIN, { base: 0.07, rim: 0.9, lines: 0.5 }), []);
  const buildings = useMemo(() => [...byPath.values()], [byPath]);
  const roofOf = (b: Building) => GROUND + b.h;
  const maxRoof = Math.max(...buildings.map(roofOf), size * 0.1);
  const skyY = maxRoof + size * 0.62;
  const done = testsDone(mock, t);
  const doneSet = new Set(mock.tests.slice(0, done));

  useFrame(({ clock }, dt) => {
    holo.uniforms.uTime.value = clock.elapsedTime;
    holo.uniforms.uFlicker.value = 0.9 + Math.sin(clock.elapsedTime * 31) * 0.06;
    if (twin.current) twin.current.position.y += (0 - twin.current.position.y) * Math.min(1, dt * 1.6);
  });

  const test = mock.failing ? byPath.get(mock.failing.test) : undefined;
  const target = mock.failing?.target ? byPath.get(mock.failing.target) : undefined;
  const robot: [number, number, number] =
    t >= EXEC_T.target && target
      ? [target.x, roofOf(target) + size * 0.16, target.z]
      : t >= EXEC_T.diff && test
        ? [test.x, roofOf(test) + size * 0.16, test.z]
        : [0, skyY * 0.55, size * 0.1];

  return (
    <group>
      {/* 하늘의 PR 전 도시: 위에서 내려와 거꾸로 매달린다 */}
      <group ref={twin} position={[0, size * 0.6, 0]}>
        <mesh position={[0, skyY + 0.1, 0]}>
          <boxGeometry args={[size * 1.04, 0.2, size * 1.04]} />
          <meshBasicMaterial color={TWIN} transparent opacity={0.04} depthWrite={false} />
          <Edges color={TWIN} />
        </mesh>
        {buildings.map((b) => {
          const isTest = mock.tests.includes(b.file.path);
          const lit = doneSet.has(b.file.path);
          return (
            <group key={b.file.path}>
              <mesh position={[b.x, skyY - b.h / 2, b.z]} material={holo}>
                <boxGeometry args={[b.w, b.h, b.d]} />
              </mesh>
              {isTest && lit && (
                // PR 전에는 모두 통과
                <mesh position={[b.x, skyY - b.h / 2, b.z]}>
                  <boxGeometry args={[b.w * 1.04, b.h * 1.02, b.d * 1.04]} />
                  <meshBasicMaterial color={PASS} transparent opacity={0.45} blending={AdditiveBlending} depthWrite={false} />
                </mesh>
              )}
            </group>
          );
        })}
        <Tag text="PR 전 (base)" color={TWIN} position={[-size * 0.4, skyY + size * 0.05, size * 0.52]} width={size * 0.3} />
      </group>
      <Tag text="PR 후 (head)" color="#e5e7eb" position={[size * 0.42, size * 0.06, size * 0.58]} width={size * 0.3} />

      {/* 깨진 테스트로 내리꽂는 번개, 이어서 그 테스트가 확인하는 코드로 */}
      {t >= EXEC_T.diff && test && (
        <Bolt from={[test.x, skyY - test.h, test.z]} to={[test.x, roofOf(test), test.z]} color={FAIL} jitter={size * 0.05} />
      )}
      {t >= EXEC_T.target && test && target && (
        <Bolt from={[test.x, roofOf(test), test.z]} to={[target.x, roofOf(target), target.z]} color={FAIL} jitter={size * 0.03} />
      )}
      {t >= EXEC_T.target && target && (
        <Alarm x={target.x} z={target.z} roof={roofOf(target)} radius={Math.max(target.w, target.d) * 0.7} height={size * 0.35} />
      )}
      <FlyingRobot target={robot} scale={size * 0.09} />
    </group>
  );
}
