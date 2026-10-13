"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { labelTexture } from "./textures";

const SHELL = "#eef1f7";
const SCREEN = "#0b1020";
const CYAN = "#38e1ff";

/**
 * AI 리뷰어 로봇: 둥근 머리 · 얼굴 화면에 빛나는 두 눈 · 안테나, 가슴판에 "AI", 다리 대신 추진기로 떠 있다.
 * 머리 둘레를 도는 고리와 손에 든 스캐너. 키 ≈ 2.3 단위 (scale 로 키운다), 앞 = +z
 */
export function AiRobot({
  position,
  rotation = 0,
  scale = 1,
}: {
  position: [number, number, number];
  rotation?: number;
  scale?: number;
}) {
  const root = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const tip = useRef<MeshBasicMaterial>(null);
  const flame = useRef<Mesh>(null);
  const arm = useRef<Group>(null);
  const chest = useMemo(() => labelTexture("AI", CYAN), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (root.current) {
      root.current.position.y = Math.sin(t * 1.8) * 0.08;
      root.current.rotation.z = Math.sin(t * 0.9) * 0.04;
    }
    // 4초마다 눈을 깜빡인다
    if (eyes.current) eyes.current.scale.y = t % 4 < 0.12 ? 0.15 : 1;
    if (ring.current) ring.current.rotation.z = t * 1.2;
    if (tip.current) tip.current.opacity = 0.6 + Math.sin(t * 6) * 0.4;
    if (flame.current) flame.current.scale.y = 1 + Math.sin(t * 30) * 0.12 + Math.sin(t * 17) * 0.08;
    if (arm.current) arm.current.rotation.x = -1.2 + Math.sin(t * 1.3) * 0.12;
  });

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <group ref={root}>
        {/* 머리 */}
        <RoundedBox args={[0.96, 0.74, 0.8]} radius={0.2} smoothness={4} position={[0, 1.72, 0]} castShadow>
          <meshStandardMaterial color={SHELL} roughness={0.3} metalness={0.25} />
        </RoundedBox>
        {/* 얼굴 화면 */}
        <RoundedBox args={[0.76, 0.5, 0.06]} radius={0.1} smoothness={4} position={[0, 1.72, 0.39]}>
          <meshStandardMaterial color={SCREEN} roughness={0.2} metalness={0.5} />
        </RoundedBox>
        {/* 빛나는 두 눈 */}
        <group ref={eyes} position={[0, 1.76, 0.43]}>
          {[-0.17, 0.17].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <capsuleGeometry args={[0.065, 0.1, 6, 12]} />
              <meshBasicMaterial color={CYAN} />
            </mesh>
          ))}
        </group>
        {/* 웃는 입 */}
        <mesh position={[0, 1.6, 0.43]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.09, 0.014, 6, 20, Math.PI]} />
          <meshBasicMaterial color={CYAN} />
        </mesh>
        {/* 귀 */}
        {[-1, 1].map((s) => (
          <group key={s} position={[0.5 * s, 1.72, 0]} rotation={[0, 0, (Math.PI / 2) * s]}>
            <mesh>
              <cylinderGeometry args={[0.16, 0.16, 0.08, 24]} />
              <meshStandardMaterial color="#c9d0dd" roughness={0.3} metalness={0.4} />
            </mesh>
            <mesh position={[0, 0.045 * s, 0]}>
              <torusGeometry args={[0.1, 0.02, 8, 24]} />
              <meshBasicMaterial color={CYAN} />
            </mesh>
          </group>
        ))}
        {/* 안테나 */}
        <mesh position={[0, 2.22, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.28, 8]} />
          <meshStandardMaterial color="#c9d0dd" metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh position={[0, 2.38, 0]}>
          <sphereGeometry args={[0.07, 16, 12]} />
          <meshBasicMaterial ref={tip} color={CYAN} transparent />
        </mesh>
        {/* 머리 둘레를 도는 고리 */}
        <mesh ref={ring} position={[0, 1.72, 0]} rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[0.78, 0.012, 6, 64, Math.PI * 1.4]} />
          <meshBasicMaterial color={CYAN} transparent opacity={0.7} blending={AdditiveBlending} depthWrite={false} />
        </mesh>

        {/* 목 */}
        <mesh position={[0, 1.28, 0]}>
          <cylinderGeometry args={[0.12, 0.14, 0.14, 16]} />
          <meshStandardMaterial color="#9aa3b5" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* 몸통과 가슴판 */}
        <RoundedBox args={[0.78, 0.7, 0.56]} radius={0.18} smoothness={4} position={[0, 0.88, 0]} castShadow>
          <meshStandardMaterial color={SHELL} roughness={0.3} metalness={0.25} />
        </RoundedBox>
        <mesh position={[0, 0.9, 0.285]}>
          <planeGeometry args={[0.42, 0.26]} />
          <meshBasicMaterial map={chest} />
        </mesh>
        {/* 왼팔은 내리고, 오른팔은 스캐너를 들어 아래를 비춘다 */}
        <group position={[-0.47, 1.05, 0]} rotation={[0.15, 0, 0.18]}>
          <mesh position={[0, -0.24, 0]}>
            <capsuleGeometry args={[0.075, 0.34, 6, 12]} />
            <meshStandardMaterial color={SHELL} roughness={0.3} metalness={0.25} />
          </mesh>
        </group>
        <group ref={arm} position={[0.47, 1.05, 0]}>
          <mesh position={[0, -0.24, 0]}>
            <capsuleGeometry args={[0.075, 0.34, 6, 12]} />
            <meshStandardMaterial color={SHELL} roughness={0.3} metalness={0.25} />
          </mesh>
          <mesh position={[0, -0.5, 0]}>
            <cylinderGeometry args={[0.07, 0.11, 0.14, 16]} />
            <meshStandardMaterial color="#9aa3b5" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, -0.58, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.09, 16]} />
            <meshBasicMaterial color={CYAN} />
          </mesh>
        </group>

        {/* 추진기와 불꽃 */}
        <mesh position={[0, 0.48, 0]}>
          <cylinderGeometry args={[0.2, 0.14, 0.14, 20]} />
          <meshStandardMaterial color="#9aa3b5" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh ref={flame} position={[0, 0.26, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.13, 0.32, 16, 1, true]} />
          <meshBasicMaterial color={CYAN} transparent opacity={0.75} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
        <pointLight position={[0, 0.2, 0]} color={CYAN} intensity={2.4} distance={3} />
        <pointLight position={[0, 1.8, 1.2]} color="#ffffff" intensity={1.2} distance={3} />
      </group>
    </group>
  );
}
