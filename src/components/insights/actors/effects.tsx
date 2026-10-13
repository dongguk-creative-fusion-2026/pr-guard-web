"use client";

import { QuadraticBezierLine } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, DoubleSide, QuadraticBezierCurve3, Vector3, type Mesh, type MeshBasicMaterial } from "three";

/** 로봇 스캐너에서 건물 지붕까지 내려오는 스캔 원뿔과 위아래로 훑는 고리 */
export function ScanBeam({ from, to, radius, color = "#38e1ff" }: { from: [number, number, number]; to: [number, number, number]; radius: number; color?: string }) {
  const ring = useRef<Mesh>(null);
  const height = from[1] - to[1];
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const k = (clock.elapsedTime * 0.7) % 1;
    ring.current.position.y = to[1] + k * height;
    const s = 1 - k * 0.95;
    ring.current.scale.set(s, s, s);
  });
  return (
    <group>
      <mesh position={[to[0], to[1] + height / 2, to[2]]}>
        <coneGeometry args={[radius, height, 32, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.13} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ring} position={[to[0], to[1], to[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.92, radius, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** 해커 키보드에서 건물로 날아가는 공격선과 그 위를 달리는 붉은 패킷 */
export function AttackBeam({ from, to, color = "#ff3b4e", lift }: { from: [number, number, number]; to: [number, number, number]; color?: string; lift: number }) {
  const mid: [number, number, number] = [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + lift, (from[2] + to[2]) / 2];
  const curve = useMemo(() => new QuadraticBezierCurve3(new Vector3(...from), new Vector3(...mid), new Vector3(...to)), [from, mid, to]);
  const packets = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    packets.current.forEach((p, i) => {
      if (!p) return;
      const k = (clock.elapsedTime * 0.55 + i / 4) % 1;
      p.position.copy(curve.getPoint(k));
    });
  });
  return (
    <group>
      <QuadraticBezierLine start={from} end={to} mid={mid} color={color} lineWidth={2} dashed dashSize={0.6} gapSize={0.4} transparent opacity={0.85} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(m) => void (packets.current[i] = m)}>
          <sphereGeometry args={[0.28, 12, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

/** 공격받는 건물을 덮는 방어막: 격자 반구가 숨 쉬듯 빛난다. height 만큼 위로 늘인다 */
export function Shield({ position, radius, height = radius, color = "#38e1ff" }: { position: [number, number, number]; radius: number; height?: number; color?: string }) {
  const wire = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (wire.current) wire.current.opacity = 0.45 + Math.sin(clock.elapsedTime * 3) * 0.2;
  });
  return (
    <group position={position}>
      <mesh scale={[1, height / radius, 1]}>
        <sphereGeometry args={[radius, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial ref={wire} color={color} wireframe transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh scale={[1, height / radius, 1]}>
        <sphereGeometry args={[radius * 0.99, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color={color} transparent opacity={0.07} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[radius * 0.97, radius, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}
