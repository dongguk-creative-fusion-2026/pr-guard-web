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
   ├─ actions.ts           # Server Actions: 등록, 지금 확인, 삭제
   └─ projects/[id]/       # PR 목록, 리뷰 기록
```

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
