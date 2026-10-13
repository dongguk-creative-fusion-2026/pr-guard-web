"use client";

import { GROUND, type Building } from "../CodeCity";
import { AiRobot } from "./AiRobot";
import { AttackBeam, ScanBeam, Shield } from "./effects";
import { Hacker, HACKER_HANDS } from "./Hacker";

/**
 * 캐릭터 미리보기: 도시 너머 하늘에 거대한 해커 홀로그램이 떠서 손끝의 붉은 실을 도시의 높은 건물들로 늘어뜨리고,
 * AI 로봇이 가장 높은 건물 위에서 스캔하며 방어막을 씌운다
 */
export function ActorsPreview({ size, byPath }: { size: number; byPath: Map<string, Building> }) {
  const targets = [...byPath.values()].sort((a, b) => b.h - a.h).slice(0, 3);
  const target = targets[0];
  if (!target) return null;
  // 표시된 건물은 더 솟아 있을 수 있어서 넉넉히 잡는다
  const topOf = (b: Building) => GROUND + b.h * 1.3 + 2;
  const top = topOf(target);
  const hackerScale = size * 1.0;
  const robotScale = size * 0.1;
  // 도시 한참 뒤 하늘에서 카메라(앞 · 오른쪽 위) 쪽을 내려다본다
  const hacker: [number, number, number] = [-size * 0.85, -size * 0.45, -size * 5.5];
  const facing = Math.atan2(size * 0.55 - hacker[0], size * 1.85 - hacker[2]);
  const world = ([x, y, z]: [number, number, number]): [number, number, number] => [
    hacker[0] + (Math.cos(facing) * x + Math.sin(facing) * z) * hackerScale,
    hacker[1] + y * hackerScale,
    hacker[2] + (-Math.sin(facing) * x + Math.cos(facing) * z) * hackerScale,
  ];
  // 손가락 끝: 손 위치에서 조금 더 앞 · 아래
  const hands = HACKER_HANDS.map(([x, y, z]) => world([x, y - 0.75, z + 0.4]));
  const strings = targets.map((b, i) => ({ from: hands[i === 2 ? 1 : 0], to: [b.x, topOf(b) * 0.85, b.z] as [number, number, number], key: b.file.path }));
  const robotY = top + size * 0.08;
  const reach = Math.max(target.w, target.d) * 0.78;
  return (
    <group>
      <Hacker position={hacker} rotation={facing} scale={hackerScale} />
      {strings.map((s) => (
        <AttackBeam key={s.key} from={s.from} to={s.to} lift={-(s.from[1] - s.to[1]) * 0.45} />
      ))}
      <Shield position={[target.x, GROUND, target.z]} radius={reach} height={top * 1.08} />
      <AiRobot position={[target.x, robotY, target.z]} rotation={0.7} scale={robotScale} />
      <ScanBeam from={[target.x, robotY + 0.25 * robotScale, target.z]} to={[target.x, top, target.z]} radius={reach * 0.8} />
    </group>
  );
}
