# pr-guard-web

PR Guard 프론트엔드 (Next.js App Router). AI 가 만든 많은 PR 을 사람이 빠르게 판단할 수 있도록, 레포를 **코드 시티**(파일 = 건물, 구역 = 모듈 · 계층)로 깔고 그 위에 리뷰의 근거와 영향 범위를 보여 준다.

- 백엔드: [pr-guard-api](https://github.com/dongguk-creative-fusion-2026/pr-guard-api)

## 데이터 정합성 규칙과 Hypothesis 실행

### 화면에서 사용하기

1. 프로젝트를 연 뒤 상단 **정합성 규칙**에서 공통으로 사용할 규칙을 저장한다. 이 단계는 선택 사항이다.
2. **PR 이력**에서 검사할 PR을 열고 **데이터 정합성 규칙** 입력란에 규칙을 작성한다. 공통 규칙이 있다면 **프로젝트 규칙 불러오기**로 복사해 수정할 수 있다.
3. **규칙 저장**을 누른 뒤 **규칙 후보 생성**을 누른다. 예: `게시글 수정 전후 작성자 ID는 같아야 한다`.
4. 해석된 관계와 적용 조건을 확인한다. 지원하는 후보의 **위 조건으로 Hypothesis 테스트 실행**을 누른다.
5. 화면에서 대기·실행 상태와 GitHub Actions 링크를 확인한다. 완료되면 반례와 base/head 비교 결과를 볼 수 있다. 조회에 실패하면 **결과 조회 재시도**를 누른다.

프로젝트 기본 규칙은 기존 PR 초안을 자동으로 덮어쓰지 않는다. 후보 생성은 입력란의 현재 내용을 해석하며, 별도로 저장 버튼을 눌러야 PR 초안이 저장된다.

### 실행 결과 읽기

| 결과 | 의미 |
|---|---|
| 신규 위반 | 같은 반례로 base는 통과하고 head는 위반 |
| 기존 위반 | base와 head 모두 위반 |
| 재현 결과 불일치 | 같은 입력의 결과가 달라 확정할 수 없음 |
| 반례 미발견 | head에서 정해진 입력 예산 안에 반례가 없었음. base 재생은 생략 |
| 실행 실패 | 빌드·환경·워크플로 오류 등으로 검증하지 못함 |

실행은 GitHub Actions에서 수행하며 브라우저나 Next.js 서버가 PR 코드를 실행하지 않는다. 사용자 PC에 Docker·Kubernetes·Python을 설치할 필요가 없다. API가 반환하는 `QUEUED`, `RUNNING`, `DONE`, `FAILED` 상태를 조회하고 Actions 링크와 반례를 표시한다. 조회 실패는 별도로 표시하며 재시도할 수 있다.

현재 실제 실행은 `pr-guard-sandbox`의 게시글 작성자 ID 보존 규칙만 지원한다. LLM이 해석한 다른 규칙은 검토 후보이며 실행 버튼을 제공하지 않는다. 지원 규칙도 Spring 서비스와 H2 테스트 DB에서 검증하므로 전체 업무 규칙·실제 PostgreSQL·HTTP 인증의 안전성 보장은 아니다. 반례 미발견도 검증 예산 안에서 발견하지 못했다는 의미다. 결과는 머지 판정에 반영하지 않는다. OpenAI 키가 없는 백엔드는 제한된 기본 템플릿으로만 해석하며 화면에 이를 표시한다.

| 코드 | 역할 |
|---|---|
| `src/lib/invariants.ts` | 공유 타입, 활성 실행 판단, 결과 메시지 |
| `src/components/invariants/useInvariantRun.ts` | 실행 요청과 중복 없는 폴링, 오류·재시도·언마운트 정리 |
| `src/components/invariants/InvariantRunResult.tsx` | 상태·커밋·Actions 링크·반례 표시 |
| `src/app/projects/[id]/prs/[number]/InvariantSettings.tsx` | PR 규칙 편집과 후보 확인 |
| `src/app/projects/[id]/invariants/` | 프로젝트 기본 규칙 편집 |
| `src/app/actions.ts` / `src/lib/api.ts` | 서버 전용 API 호출과 저장 후 갱신 |

### 배포 순서와 확인

백엔드의 워크플로·DB 마이그레이션·Actions 토큰 권한을 먼저 준비하고 `INVARIANT_EXEC_ENABLED=true`로 활성화한 뒤 웹을 배포한다. Next.js의 `API_BASE_URL`과 필요시 `API_TOKEN`을 백엔드와 맞춘다. OpenAI 키와 Actions 실행용 GitHub 토큰은 백엔드에만 설정한다. [백엔드 상세 설정](https://github.com/dongguk-creative-fusion-2026/pr-guard-api/blob/main/invariant-poc/README.md)

웹 프로덕션 빌드와 타입 검사를 확인했다. 실제 배포 환경에서 버튼부터 Actions 완료까지의 브라우저 종단 간 확인은 별도로 필요하다. 기존 백엔드에 PR 설정 API가 없으면 PR 입력 영역은 표시하지 않으며, 프로젝트 기본 규칙 화면은 해당 API를 제공하는 백엔드가 필요하다.

## 화면

| 화면 | 주소 | 내용 |
|---|---|---|
| 홈 | `/` | 레포 등록, 프로젝트 목록(구성 · 열린 PR · 볼 PR · 자동 통과 · 판정 분포 · 마지막 확인) |
| 입구 | `/projects/{id}` | 화면 전체에 코드 시티를 깔고, 사람이 볼 PR(머지 막힘 · 확인 필요)이 바꾼 건물을 판정 색으로 세운다. 오른쪽에 PR 이력 · 커밋 이력 패널. 진행 중인 리뷰는 **리뷰 장면**으로 실시간 재생, 아니면 보안 지적이 있는 최근 리뷰를 다시 보기. "실행 검증 미리보기"(예시 데이터) |
| PR 이력 · 대기열 | `/projects/{id}/prs` | 병목 숫자, 차단 · 확인 필요 · 자동 통과 칸 |
| PR 판단 | `/projects/{id}/prs/{number}` | 판정 → 영향 시티(그 리뷰의 장면 자동 재생) → 근거가 있는 지적 → 사람이 확인할 지적, 옆에 영향 범위 · 위임 구역. 리뷰 과정(파이프라인) · 판정에서 뺀 지적 · 분석 재료 · PR 코멘트는 접어 둠 |
| 근거 층 · 영향 시티 · 영향 그래프 | `/projects/{id}/reviews/{reviewId}/layers` · `/city` · `/impact` | 전체 화면 보기 |
| 테스트 선택 | `/projects/{id}/reviews/{reviewId}/tests` | 영향 테스트 선택을 장면으로: 테스트 무더기 → 바뀐 메서드가 켜짐 → 영향 있는 테스트만 실행 열로 모이고 나머지는 꺼짐 → 선이 뻗고 실행 중인 테스트가 빛남 → 통과 · 회귀 → 바뀐 메서드에 심은 버그가 선을 타고 날아가 테스트가 막으면 방어막, 못 막으면 뚫고 "놓친 버그" 칸으로. 진행 중이면 실시간, 끝났으면 다시 보기. 아래에 테스트 신뢰도(변이 점수 · 메서드별 막은 / 놓친 버그와 그 테스트 · flaky · 테스트 약화), 실행 · 걸러진 테스트와 이유, 아낀 시간, 전체 실행 이유 · 그림자 모드 확인 |
| 커밋 이력 | `/projects/{id}/commits` | 코드 시티 + 커밋 목록(시간 여행). `?tab=graph` 커밋 그래프(모든 브랜치의 갈래 · 병합), `hotspots` 핫스팟, `coupling` 숨은 결합. `?file=` · `?t=` · `?mode=` |
| 코드 그래프 | `/projects/{id}/graph` | 함수 단위 그래프 (점 = 함수, 상자 = 파일, 색 = 코드 시티와 같은 구조 구역). `?file=` · `?fn=`, `?runtime=1` 런타임 오버레이 |
| 에이전트 규칙 | `/projects/{id}/agents` | 레포의 AGENTS.md 상태, 분석 기반 초안, 반복된 실수 → 규칙 제안, 초안을 PR 로 |
| 등록 직후 | `/projects/{id}/onboarding` | 레포 확인 → 분석 진행 → 레포 브리핑 → 리뷰 설정 → 첫 리뷰 (`?step=1~5`) |

모든 프로젝트 화면은 같은 상단 바(레포 · PR 이력 | 커밋 이력 · 하위 탭 · 지금 확인 · 설정) 아래에 있다. 테마는 어두운 톤 하나다.

## 코드 시티

- 구역 = 모듈(멀티 모듈 레포면 `src` 앞 경로), 구역 안 블록 = 계층(파일이 든 패키지 이름, 테스트 · 리소스 · 프론트엔드는 따로). 모듈이 하나면 구역 = 계층.
- 건물 바닥 = 함수 수 · 줄 수, 높이 = 줄 수. 구역 사이는 도로, 블록 사이는 골목으로 띄운다.
- 색 기준: 구조(기본) · 핫스팟 · 기능 묶음(GitNexus 커뮤니티) · 최근 변경 · 테스트 · 런타임 · AI 위임.
- 코드 그래프와 같은 구조 구역 · 색을 쓴다 (`groupStructure`).

## 리뷰 장면

리뷰 단계 기록(SSE)을 코드 시티 위 장면으로 묶는다. 진행 중이면 단계가 끝나는 대로, 끝난 리뷰는 장면마다 정해진 시간으로 다시 본다. 모든 연출은 실제 리뷰 결과에서만 나온다 (`components/insights/actors/`).

| 단계 | 연출 | 데이터 |
|---|---|---|
| 시작 · 코드 읽기 | AI 리뷰어 로봇이 바뀐 건물로 차례로 날아가 스캔 빛을 비춘다 | 수집 단계의 바뀐 파일 (끝난 리뷰는 분석 재료) |
| 영향 추적 | 바뀐 메서드를 부르는 건물이 물든다. **숨은 결합**: 늘 같이 바뀌던 짝 중 이번에 안 바뀐 건물까지 호박색 케이블과 스파크. **구조 변화**: 구조를 거스르는 새 의존을 두 건물 사이 보라 아치 다리로 | 메서드 비교의 호출부, git 동시 변경(3번 · 50% 이상, 서로 부르지 않는 코드 파일), `ARCH_*` 지적의 증거 |
| 보안 위협 | 보안 지적이 있을 때만, 도시 너머 하늘에 거대한 해커 홀로그램이 떠올라 그 건물로 붉은 실을 내린다 | 보안 분류(C) 지적, AI 지적의 kind = SECURITY |
| 근거 확인 | 도시 위로 코드 인덱스 → git 이력 → 실행 → AI 판단 네 층이 떠오르고, 지적마다 핀이 확인한 층(●) · 관련 맥락(○) · 어긋난 층(×)을 관통. 오탐 핀은 부서진다. 근거가 확인된 위협은 하늘색 방어막으로 막히고 해커는 지직거리며 사라진다. AI 만 주장하면 노란 방어막과 함께 남는다 | 근거 확인 단계의 층별 판단 |
| 판정 | 머지 가능 · 수정 후 머지 · 머지 막힘 | 판정 단계 |

PR 이 새로 만든 파일은 도시(기본 브랜치 기준)에 아직 없으므로 같은 폴더의 가장 가까운 건물로 대신 보여 준다.

**실행 검증 미리보기 (평행 도시)**: 하늘에 PR 전(base) 도시가 거꾸로 매달린 홀로그램으로 내려오고, 두 도시의 테스트가 차례로 켜진 뒤 PR 전에는 통과하고 후에는 깨진 테스트로 번개가 떨어진다. 실행 검증이 운영에서 꺼져 있어 지금은 그 레포의 테스트 파일로 만든 **예시 데이터**를 쓰고 화면에 늘 그렇게 표시한다 (`execDemo.ts`).

## 구조

```
src/
├─ lib/
│  ├─ api.ts            # 백엔드 호출 (서버 전용). 타입 정의 포함
│  ├─ grounding.ts      # 층 · 판단 · 상태 이름과 색, 근거 확인 전 리뷰의 대체 근거
│  ├─ queue.ts          # PR 대기열: 칸 나누기, 병목 숫자
│  ├─ delegation.ts     # AI 위임 지도: 파일마다 맡겨도 됨 · 리뷰 필수 · 사람이 직접 구역과 이유
│  ├─ gitGraph.ts       # 커밋 그래프 레인 배치 (git log --graph 처럼)
│  ├─ stack.ts          # 레포 구성(언어 · 프레임워크) 요약
│  └─ agentsMd.ts · format.ts
├─ app/
│  ├─ page.tsx · RegisterForm.tsx · actions.ts   # 홈, Server Actions(등록 · 지금 확인 · 다시 리뷰 · 그래프 다시 만들기 · 삭제 · 규칙 PR)
│  ├─ api/reviews/[id]/events/route.ts           # 백엔드 리뷰 단계 스트림(SSE) 중계
│  └─ projects/[id]/
│     ├─ layout.tsx · ProjectNav.tsx · PollButton.tsx
│     ├─ page.tsx · EntryCityClient.tsx          # 입구
│     ├─ prs/ · reviews/ReviewDecision.tsx · reviews/ImpactCityInlineClient.tsx
│     ├─ reviews/[reviewId]/{layers,city,impact}/
│     ├─ commits/page.tsx · insights/(예전 주소 → commits)
│     ├─ graph/ · agents/ · onboarding/
└─ components/
   ├─ insights/
   │  ├─ metrics.ts        # 파일 지표 · 핫스팟 점수 · 구조 구역 · treemap
   │  ├─ CodeCity.tsx      # three.js 도시 (구역 · 블록 이름표는 DOM 투영)
   │  ├─ EntryCity.tsx · ImpactCityInline.tsx · ImpactCityView.tsx · InsightsView.tsx · HotspotMap.tsx · CouplingWheel.tsx · InfraLayer.tsx
   │  └─ actors/           # 리뷰 장면
   │     ├─ reviewShow.ts       # 단계 기록 → 장면(시작 · 코드 읽기 · 영향 · 위협 · 근거 · 판정), 자막
   │     ├─ ReviewShowScene.tsx # 로봇 이동 · 해커 · 실 · 방어막 · 근거 층 · 케이블 · 다리
   │     ├─ AiRobot.tsx · Hacker.tsx · hologram.ts(홀로그램 셰이더) · effects.tsx · layersFx.tsx
   │     ├─ hiddenCoupling.ts · archNote.ts · ShowCaption.tsx
   │     └─ ParallelCity.tsx · execDemo.ts   # 실행 검증 미리보기 (예시 데이터)
   ├─ commits/CommitGraphView.tsx
   ├─ graph/      # GraphExplorer(sigma.js), graphModel(구조 묶음 · 배치), briefing, impact, runtime
   ├─ layers/     # 근거 층 전체 화면 (GroundLayers, GroundLayersView)
   └─ pipeline/   # 리뷰 파이프라인 그래프(React Flow), 단계 상세, 영향 그래프, 증거 테스트, 동작 diff, AST diff
```

백엔드는 Server Component 와 Server Action, 그리고 리뷰 단계 스트림을 중계하는 Route Handler 에서만 호출한다. 브라우저는 백엔드 주소를 모르고, CORS 설정도 필요 없다.

## 환경변수

| 변수 | 설명 |
|---|---|
| `API_BASE_URL` | pr-guard-api 주소 (기본 `http://localhost:8080`). 서버에서 실행할 때 읽는다 |
| `API_TOKEN` | pr-guard-api 의 `API_TOKEN` 과 같은 값. 서버에서 백엔드를 부를 때 `X-Api-Token` 으로 보낸다 (브라우저로 나가지 않음) |

## 로컬 실행

```bash
npm install
API_BASE_URL=http://localhost:8080 npm run dev
```

## GuardDog 검사 결과

PR 상세 화면은 `GET /api/reviews/{id}`의 `context.guarddog`를 표시한다. 기존 기록에 필드가 없으면
완료된 CHECK_C/VERDICT 이벤트에서 찾고, 둘 다 없으면 `검사 기록 없음`으로 표시한다.
검사 완료·일부 미완료·미완료·꺼짐·검사 대상 없음을 구분하며, 패키지를 펼치면 선언 파일,
위험도·규칙·설명과 실패·생략 원인을 볼 수 있다. 집계는 패키지 이름·버전 단위다.

지원 범위는 이번 PR에 추가·변경된 npm/PyPI 직접 의존성이다. 위험 신호가 0건이어도 검사가
미완료이면 재검사가 필요하다고 안내한다. 열린 PR의 `전체 다시 검사`는 기존 다시 리뷰 API로
새 리뷰를 요청한다. 패키지 하나만 검사하는 기능은 아니다. 실시간/다시보기의 보안·판정 단계에도
동일한 결과를 표시하며, 기존 Sonar/Semgrep 결과는 함께 유지한다.

브랜치는 로컬 실행에 제약이 없다. `feat/guarddog-ui`에서 API를 실행하고 `API_BASE_URL`을
그 주소로 지정하면 배포·Push 없이 브라우저에서 테스트할 수 있다. PowerShell 예시:

```powershell
npm ci
$env:API_BASE_URL = 'http://localhost:8080'
npm run dev -- --hostname 127.0.0.1
```

`http://localhost:3000`에서 실제 프로젝트의 PR을 열어 확인한다. API의 GuardDog 설정을 켜고 새
리뷰를 완료해야 새 검사 기록이 생긴다. 기존 리뷰를 열기만 해서는 검사를 실행하지 않는다.
API_TOKEN이 필요한 서버는 같은 값을 웹 서버 환경변수에 설정한다. `NEXT_PUBLIC_` 변수에 넣지 않는다.
기본 회귀 검증은 `npm test`, 타입·배포 빌드 검증은 `npm run build`로 실행한다.

## Vercel 배포

Vercel 에서 이 레포를 Import 하고 Environment Variables 에 `API_BASE_URL`(Railway 도메인), `API_TOKEN` 을 넣는다. 다른 설정은 기본값 그대로.
