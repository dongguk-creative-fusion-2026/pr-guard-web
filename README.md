# pr-guard-web

PR Guard 프론트엔드 (Next.js App Router). public GitHub 레포 등록, PR·리뷰 결과 조회, 즉시 폴링을 제공한다.

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
      ├─ graph/page.tsx    # 의존성 그래프 전체 화면 (?file= 로 파일 선택)
      └─ reviews/[reviewId]/page.tsx
                           # 리뷰 상세: 파이프라인 시각화, 판정, 지적 사항, 분석 재료
   └─ api/reviews/[id]/events/route.ts
                           # 백엔드 리뷰 단계 스트림(SSE) 중계
src/components/pipeline/   # 리뷰 파이프라인 그래프 (React Flow + motion)
   ├─ PipelineView.tsx     # 실시간 보기 · 다시보기(1×/2×/4×) · 판정 표시
   ├─ StageNode.tsx        # 단계 노드 (대기/진행/완료/실패/건너뜀, 단계 수치)
   ├─ StageDetail.tsx      # 노드를 누르면 그 단계의 결과물
   ├─ ImpactGraph.tsx      # 바뀐 메서드 ↔ 호출부 그래프 (옛 시그니처 호출 강조)
   └─ stages.ts            # 단계 정의·배치·이벤트 → 상태 계산
src/components/graph/
   ├─ GraphExplorer.tsx    # 의존성 그래프 탐색 (sigma.js WebGL · 검색 · 묶음 숨기기 · 파일 선택 시 의존 목록)
   └─ graphModel.ts        # 묶음·색, graphology 그래프 + ForceAtlas2 배치
```

프로젝트를 등록하면 백엔드가 GitNexus 로 기본 브랜치를 인덱싱해 파일 의존성 그래프를 만든다. 프로젝트 화면에는 카드만 두고, "그래프 열기"를 누르면 전체 화면에서 같은 기능 묶음(GitNexus 커뮤니티)끼리 모아 보여 주고, 파일을 누르면 그 파일이 쓰는 파일과 그 파일을 쓰는 파일을 관계 종류(import · 호출 · 주입 · 상속 …)와 함께 보여 준다.

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
