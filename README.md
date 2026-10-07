# pr-guard-web

PR Guard 프론트엔드 (Next.js App Router). AI 가 만든 많은 PR 을 사람이 빠르게 판단할 수 있도록, **근거와 영향 범위를 한눈에** 보여 준다.

public GitHub 레포 등록 · 온보딩, 리뷰 파이프라인(실행 검증 · 증거 테스트 포함), PR 영향 그래프, 코드 그래프와 코드 인사이트(런타임 오버레이 포함)를 제공한다.

- 백엔드: [pr-guard-api](https://github.com/dongguk-creative-fusion-2026/pr-guard-api)

## 구조

```
src/
├─ lib/api.ts              # 백엔드 호출 (서버 전용). 타입 정의 포함
├─ lib/format.ts
└─ app/
   ├─ page.tsx             # 레포 등록 + 프로젝트 목록
   ├─ RegisterForm.tsx
   ├─ actions.ts           # Server Actions: 등록, 지금 확인, 다시 리뷰, 그래프 다시 만들기, 삭제
   └─ projects/[id]/
      ├─ page.tsx          # 의존성 그래프, PR 목록(최근 판정, 다시 리뷰), 리뷰 기록
      ├─ GraphSection.tsx  # 의존성 그래프 카드 (상태 · 수치 · 그래프 열기 · 다시 만들기). 만드는 중이면 새로고침
      ├─ graph/page.tsx    # 코드 그래프 전체 화면 (?file= · ?fn= 로 선택, ?runtime=1 런타임 오버레이)
      ├─ insights/         # 코드 인사이트: 코드 시티(3D, 시간 여행 · 호출 호) · 핫스팟 트리맵 · 숨은 결합 (?tab= · ?file= · ?t= · ?mode=runtime)
      ├─ onboarding/       # 등록 직후: 레포 확인 → 분석 진행 → 레포 브리핑 → 리뷰 설정 → 첫 리뷰 (?step=1~5)
      └─ reviews/[reviewId]/page.tsx  (+ impact/: PR 영향 그래프, city/: 3D 영향 시티)
                           # 리뷰 상세: 파이프라인 시각화(?stage= 로 단계 선택), 판정, 지적 사항, 분석 재료
   └─ api/reviews/[id]/events/route.ts
                           # 백엔드 리뷰 단계 스트림(SSE) 중계
src/components/pipeline/   # 리뷰 파이프라인 그래프 (React Flow + motion)
   ├─ PipelineView.tsx     # 실시간 보기 · 다시보기(1×/2×/4×) · 판정 표시
   ├─ StageNode.tsx        # 단계 노드 (대기/진행/완료/실패/건너뜀, 단계 수치)
   ├─ StageDetail.tsx      # 노드를 누르면 그 단계의 결과물
   ├─ ImpactGraph.tsx      # 바뀐 메서드 ↔ 호출부 그래프 (옛 시그니처 호출 강조)
   ├─ Evidence.tsx         # 증거 테스트: 만든 테스트 코드, base → head 판정 카드, 바뀐 메서드를 지나간 테스트
   └─ stages.ts            # 단계 정의·배치·이벤트 → 상태 계산
src/components/insights/   # 파일 지표 · 핫스팟 점수 · treemap 배치(metrics.ts), CodeCity(three.js), HotspotMap, CouplingWheel
src/components/graph/
   ├─ GraphExplorer.tsx    # 코드 그래프 탐색 (sigma.js WebGL): 점 = 함수, 상자 = 파일. 검색 · 묶음 숨기기 · 함수/파일 선택
   ├─ graphModel.ts        # 묶음·색, 파일 배치(ForceAtlas2 + 상자 겹침 풀기), 상자 안 함수 배치
   ├─ briefing.ts          # 레포 브리핑: 기능 묶음 · 핵심 파일 · 많이 호출되는 함수 · 시작점 · 레이어 · 테스트
   ├─ impact.ts            # PR 영향 범위: 바뀐 함수 → 호출하는 함수(직접) → 그 함수를 호출하는 함수(간접)
   └─ runtime.ts           # 런타임 호출 기록 → 그래프 함수 매칭, 불린 횟수 색, 파일 단위 합계(코드 시티)
```

프로젝트를 등록하면 백엔드가 GitNexus 로 기본 브랜치를 인덱싱해 파일 의존성 그래프를 만든다. 프로젝트 화면에는 카드만 두고, "그래프 열기"를 누르면 전체 화면에서 같은 기능 묶음(GitNexus 커뮤니티)끼리 모아 보여 주고, 파일을 누르면 그 파일이 쓰는 파일과 그 파일을 쓰는 파일을 관계 종류(import · 호출 · 주입 · 상속 …)와 함께 보여 준다.

리뷰 상세의 "영향 그래프"는 같은 그래프 위에 그 PR 이 바꾼 파일(노랑)에서 그 파일을 쓰는 파일(직접, 빨강), 그 파일을 쓰는 파일(간접, 주황)로 영향이 퍼지는 모습을 보여 준다. 분석기가 확인한 호출부와 옛 시그니처로 부르는 곳, 지적 사항이 있는 파일을 함께 표시한다.

실행 검증이 돈 리뷰가 있으면 **런타임 오버레이**를 켤 수 있다. 테스트 중 많이 불린 함수일수록 밝게, 한 번도 안 불린 함수는 어둡게 보이고, 실제 호출을 따라 빛이 흐른다. 정적 분석에는 없고 실행 중에만 보인 호출(인터페이스 · 상속 · 프레임워크)은 분홍 간선으로 더한다. 코드 시티에서는 색 기준 "런타임" 으로 같은 정보를 건물과 호로 보여 준다.

리뷰 파이프라인의 **증거 테스트** 노드는 PR 이 바꾼 동작을 고정하는 테스트(base 에서 통과, head 에서 실패해야 함)를 보여 주고, 차등 비교 노드는 그 판정(동작 변화 증명 · 변화 없음 · 무효 · 실행 못 함)과 바뀐 메서드를 실제로 지나간 테스트를 보여 준다.

리뷰 상세 화면은 진행 중인 리뷰면 단계가 켜지는 모습을 실시간으로 보여 주고, 끝난 리뷰는 저장된 단계 기록을 다시보기로 재생한다.

백엔드는 Server Component 와 Server Action 에서만 호출한다. 브라우저가 백엔드를 직접 부르지 않으므로 CORS 설정이 필요 없고, 백엔드 주소도 노출되지 않는다.

## 환경변수

| 변수 | 설명 |
|---|---|
| `API_BASE_URL` | pr-guard-api 주소 (기본 `http://localhost:8080`) |

## 로컬 실행

```bash
npm install
npm run dev
```

## Vercel 배포

Vercel 에서 이 레포를 Import 하고 Environment Variables 에 `API_BASE_URL`(Railway 도메인)을 넣는다. 다른 설정은 기본값 그대로.
