"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3, type Group } from "three";
import { GROUND, type Building, type CityImpact } from "../CodeCity";
import { AiRobot } from "./AiRobot";
import { AttackBeam, ScanBeam, Shield } from "./effects";
import { Hacker, HACKER_HANDS } from "./Hacker";
import type { HiddenPartner } from "./hiddenCoupling";
import { CouplingCables, GroundStack } from "./layersFx";
import { SCAN_PER_FILE, type ShowState, type ShowThreat } from "./reviewShow";

const SHIELD_COLOR = { CONFIRMED: "#38e1ff", AI_ONLY: "#facc15" } as const;

/** 장면에 맞춰 건물을 칠한다: 바뀐 파일(0) → 영향받는 파일(1). 위협 파일에는 지적 수 */
export function showImpact(show: ShowState, known?: Map<string, unknown>, partners: HiddenPartner[] = []): CityImpact | null {
  if (!show.phase) return null;
  const levels = new Map<string, 0 | 1 | 2>();
  const at = (f: string) => (known ? (locatePath(f, known) ?? f) : f);
  // 숨은 결합의 짝(안 바뀐 쪽)은 영향 추적부터 주황으로
  if (show.phase !== "collect" && show.phase !== "scan") for (const p of partners) levels.set(p.partner, 2);
  for (const f of show.impacted) levels.set(at(f), 1);
  for (const f of show.changed) levels.set(at(f), 0);
  const findings = new Map<string, number>();
  if (show.phase !== "collect" && show.phase !== "scan" && show.phase !== "impact") {
    for (const t of show.threats) if (t.status !== "REFUTED") findings.set(at(t.file), (findings.get(at(t.file)) ?? 0) + 1);
  }
  const reveal = show.phase === "collect" ? -1 : show.phase === "scan" ? 0 : 1;
  return { levels, reveal, findings, links: [] };
}

/**
 * 파일이 서 있는 건물. PR 이 새로 만든 파일은 도시(기본 브랜치)에 아직 없으므로 같은 폴더에서 가장 가까운 건물로 대신한다
 */
export function locatePath(file: string, known: Map<string, unknown>): string | undefined {
  if (known.has(file)) return file;
  const dirs = file.split("/").slice(0, -1);
  let best: string | undefined;
  let bestDepth = 0;
  for (const path of known.keys()) {
    const parts = path.split("/");
    let depth = 0;
    while (depth < dirs.length && parts[depth] === dirs[depth]) depth++;
    if (depth > bestDepth) {
      best = path;
      bestDepth = depth;
    }
  }
  return best;
}

function locate(file: string, byPath: Map<string, Building>): Building | undefined {
  const path = locatePath(file, byPath);
  return path ? byPath.get(path) : undefined;
}

/** 목표 위치로 부드럽게 날아가는 로봇 */
export function FlyingRobot({ target, scale }: { target: [number, number, number]; scale: number }) {
  const group = useRef<Group>(null);
  const goal = useRef(new Vector3());
  useFrame((_, dt) => {
    if (!group.current) return;
    goal.current.set(...target);
    group.current.position.lerp(goal.current, Math.min(1, dt * 2.2));
  });
  return (
    <group ref={group} position={target}>
      <AiRobot position={[0, 0, 0]} rotation={0.6} scale={scale} />
    </group>
  );
}

/**
 * 리뷰 장면을 도시 위에 그린다. AI 로봇이 바뀐 건물을 차례로 훑고 영향 범위를 비춘 뒤,
 * 보안 위협이 있으면 하늘에 해커 홀로그램이 떠올라 그 건물로 실을 내린다. 근거가 확인된 위협은 방어막으로 막히고
 * 해커는 지직거리며 사라진다. AI 만 주장한 위협은 노란 방어막과 함께 해커가 희미하게 남는다
 */
export function ReviewShowScene({
  show,
  size,
  byPath,
  hackerX = -0.85,
  partners = [],
}: {
  show: ShowState;
  partners?: HiddenPartner[];
  size: number;
  byPath: Map<string, Building>;
  /** 해커가 뜰 가로 위치 (도시 크기 비율). 오른쪽 패널이 있으면 왼쪽으로 */
  hackerX?: number;
}) {
  const phase = show.phase;
  if (!phase) return null;
  const topOf = (b: Building) => GROUND + b.h * 1.35 + 2;
  const robotScale = size * 0.1;
  const hover = size * 0.09;
  const buildingsOf = (files: string[]) => files.map((f) => locate(f, byPath)).filter((b): b is Building => !!b);
  const centroid = (list: Building[]): [number, number, number] => {
    if (list.length === 0) return [0, size * 0.32, 0];
    const x = list.reduce((s, b) => s + b.x, 0) / list.length;
    const z = list.reduce((s, b) => s + b.z, 0) / list.length;
    return [x, Math.max(...list.map(topOf)) + hover * 1.6, z];
  };

  const changed = buildingsOf(show.changed);
  const threats = show.threats
    .map((t) => ({ threat: t, b: locate(t.file, byPath) }))
    .filter((x): x is { threat: ShowThreat; b: Building } => !!x.b);
  const live = threats.filter((x) => x.threat.status !== "REFUTED");

  // 근거 층: 가장 높은 건물 위에서 네 층이 떠오른다
  const maxRoof = Math.max(...[...byPath.values()].map(topOf), size * 0.1);
  const stackBase = maxRoof + size * 0.08;
  const stackTop = stackBase + size * 0.075 * 3;

  // 로봇이 갈 곳과 비출 건물
  let robot: [number, number, number] = [0, size * 0.32, 0];
  let beam: { b: Building; radius: number } | null = null;
  if (phase === "scan" && changed.length > 0) {
    const b = changed[Math.min(Math.floor(show.elapsed / SCAN_PER_FILE), Math.min(changed.length, 5) - 1)];
    robot = [b.x, topOf(b) + hover, b.z];
    beam = { b, radius: Math.max(b.w, b.d) * 0.75 };
  } else if (phase === "impact") {
    const all = [...changed, ...buildingsOf(show.impacted)];
    robot = centroid(all);
  } else if (phase === "ground") {
    // 층 맨 위에서 내려다본다
    const focus = (live[0] ?? threats[0])?.b;
    robot = focus ? [focus.x, stackTop + size * 0.1, focus.z] : [0, stackTop + size * 0.1, 0];
  } else if ((phase === "threat" || phase === "verdict") && (live[0] ?? threats[0])) {
    const b = (live[0] ?? threats[0]).b;
    robot = [b.x, topOf(b) + hover, b.z];
    if (phase === "threat") beam = { b, radius: Math.max(b.w, b.d) * 0.8 };
  } else if (changed.length > 0) {
    robot = centroid(changed);
  }

  // 해커: 위협 장면에서 나타나 근거 확인으로 막히면 사라진다
  const unresolved = live.some((x) => x.threat.status !== "CONFIRMED");
  const presence =
    threats.length === 0
      ? 0
      : phase === "threat"
        ? 1
        : phase === "ground"
          ? live.length > 0
            ? unresolved
              ? 0.9
              : 0.7
            : 0.25
          : phase === "verdict"
            ? unresolved
              ? 0.55
              : 0
            : 0;
  const hackerScale = size;
  const hacker: [number, number, number] = [size * hackerX, -size * 0.45, -size * 5.5];
  const facing = Math.atan2(size * 0.55 - hacker[0], size * 1.85 - hacker[2]);
  const world = ([x, y, z]: [number, number, number]): [number, number, number] => [
    hacker[0] + (Math.cos(facing) * x + Math.sin(facing) * z) * hackerScale,
    hacker[1] + y * hackerScale,
    hacker[2] + (-Math.sin(facing) * x + Math.cos(facing) * z) * hackerScale,
  ];
  const hands = HACKER_HANDS.map(([x, y, z]) => world([x, y - 0.75, z + 0.4]));
  const strings =
    phase === "threat" ? threats : phase === "ground" ? live : phase === "verdict" ? live.filter((x) => x.threat.status !== "CONFIRMED") : [];
  const shields = phase === "ground" || phase === "verdict" ? live : [];

  return (
    <group>
      {threats.length > 0 && <Hacker position={hacker} rotation={facing} scale={hackerScale} presence={presence} />}
      {strings.map(({ threat, b }, i) => (
        <AttackBeam
          key={`${threat.file}\n${threat.title}`}
          from={hands[i % 2]}
          to={[b.x, topOf(b) * 0.85, b.z]}
          lift={-(hands[i % 2][1] - topOf(b)) * 0.45}
        />
      ))}
      {shields.map(({ threat, b }) => (
        <Shield
          key={`${threat.file}\n${threat.title}`}
          position={[b.x, GROUND, b.z]}
          radius={Math.max(b.w, b.d) * 0.8}
          height={topOf(b) * 1.08}
          color={SHIELD_COLOR[threat.status === "CONFIRMED" ? "CONFIRMED" : "AI_ONLY"]}
        />
      ))}
      {(phase === "impact" || phase === "threat" || phase === "ground") && <CouplingCables partners={partners} byPath={byPath} size={size} />}
      {phase === "ground" && (
        <GroundStack size={size} byPath={byPath} grounded={show.grounded} elapsed={show.elapsed} locate={locate} roofOf={topOf} base={stackBase} />
      )}
      <FlyingRobot target={robot} scale={robotScale} />
      {beam && (
        <ScanBeam
          key={beam.b.file.path}
          from={[beam.b.x, topOf(beam.b) + hover + 0.25 * robotScale, beam.b.z]}
          to={[beam.b.x, topOf(beam.b), beam.b.z]}
          radius={beam.radius}
        />
      )}
    </group>
  );
}
