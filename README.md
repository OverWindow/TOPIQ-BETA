# UNIGATE TOPIK II Mock Test

`topik.unigate.kr`에서 제공할 TOPIK II 읽기 모의테스트입니다.

- 프론트엔드: React, Vite, TypeScript, Tailwind CSS
- 백엔드: Fastify, TypeScript, PostgreSQL
- 프로덕션: Vercel 프론트엔드 + Render API

## 프로젝트 구조

```text
Unigate-Web/
├─ frontend/                 # React/Vite SPA
├─ backend/
│  ├─ migrations/           # topik_app PostgreSQL 마이그레이션
│  └─ src/                  # Fastify API 및 응답 수집 로직
├─ POSTGRESQL_QUESTION_BANK.md
├─ pnpm-workspace.yaml
└─ render.yaml
```

백엔드는 기존 `topik_bank` 스키마의 문제은행을 읽고, 서비스에서 수집한
세션·답안·이벤트·별점·이메일 정보는 별도 `topik_app` 스키마에 저장합니다.

## 사전 요구사항

- Node.js 22 이상
- pnpm 11 이상
- PostgreSQL
- 기존 `topik_bank` 스키마와 문제 세트 2개

사용되는 고정 문제 세트는 다음과 같습니다.

| 모의고사 | `set_id` | 버전 |
| --- | --- | --- |
| TOPIK II 읽기 1회 | `64c027ea-fa18-5cd3-8039-79ecde41916a` | 1 |
| TOPIK II 읽기 2회 | `fc0a5fa7-391e-586f-ab7c-1b7b8193358a` | 1 |

## 로컬 개발

### 1. 의존성 설치

프로젝트 루트에서 실행합니다.

```powershell
cd C:\Users\khyun\Projects\Unigate-Web
pnpm install
```

### 2. 환경변수 생성

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

`backend/.env` 예시:

```env
NODE_ENV=development
PORT=4000

DATABASE_URL=postgresql://user:password@localhost:5432/topik
DATABASE_SSL=disable

APP_ORIGINS=http://localhost:5173,https://topik.unigate.kr
TRUST_PROXY=false

# v1 읽기 문제는 텍스트 기반이므로 로컬에서는 비워도 됩니다.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=topik-assets
```

`frontend/.env` 예시:

```env
VITE_API_BASE_URL=http://localhost:4000
```

### 3. 로컬 데이터베이스 마이그레이션

마이그레이션은 기존 `topik_bank`를 변경하지 않고 `topik_app` 스키마를
생성합니다.

```powershell
pnpm db:migrate
```

다음 조건을 만족하지 않으면 마이그레이션이 실패합니다.

- `DATABASE_URL`로 PostgreSQL에 접속할 수 있어야 합니다.
- 기존 `topik_bank.question_set_versions`, `question_set_items`,
  `item_versions` 테이블이 있어야 합니다.
- 위의 고정 문제 세트와 버전이 문제은행에 있어야 합니다.

### 4. 프론트엔드와 백엔드 동시 실행

```powershell
pnpm dev
```

| 서비스 | 로컬 주소 |
| --- | --- |
| 프론트엔드 | `http://localhost:5173` |
| 백엔드 API | `http://localhost:4000` |
| 상태 확인 | `http://localhost:4000/health` |

상태 확인:

```powershell
Invoke-RestMethod http://localhost:4000/health
```

정상 응답:

```json
{
  "ok": true,
  "service": "unigate-topik-api"
}
```

### 백엔드만 실행

```powershell
pnpm --filter @unigate/topik-api dev
```

### 프론트엔드만 실행

```powershell
pnpm --filter @unigate/topik-web dev
```

Vite 개발 서버는 `/v1`과 `/health` 요청을 로컬 백엔드의 4000번 포트로
프록시합니다.

## 로컬 프로덕션 빌드 확인

### 전체 검사

```powershell
pnpm typecheck
pnpm test
pnpm build
```

### 백엔드 프로덕션 방식 실행

```powershell
pnpm --filter @unigate/topik-api build
pnpm --filter @unigate/topik-api start
```

백엔드는 `backend/dist/server.js`를 실행하며 기본 포트는 `4000`입니다.

### 프론트엔드 프로덕션 미리보기

```powershell
pnpm --filter @unigate/topik-web build
pnpm --filter @unigate/topik-web preview
```

Vite 미리보기 주소는 기본적으로 `http://localhost:4173`입니다.

## 프로덕션 배포

### 백엔드: Render

저장소 루트의 `render.yaml`을 Render Blueprint로 연결합니다.

- 서비스 도메인: `https://topik-api.unigate.kr`
- 런타임: Docker
- 서비스 루트: `backend`
- 상태 확인 경로: `/health`
- 배포 전 마이그레이션: `node dist/migrate.js`

Render에 다음 환경변수를 설정합니다.

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://...
DATABASE_SSL=require
APP_ORIGINS=https://topik.unigate.kr
TRUST_PROXY=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=topik-assets
```

`SUPABASE_SERVICE_ROLE_KEY`는 백엔드에만 설정하고 프론트엔드 환경변수로
노출하지 않습니다.

#### 운영 마이그레이션 주의사항

Render는 새 버전을 서비스하기 전에 `node dist/migrate.js`를 실행합니다.
첫 배포 전에는 반드시 다음 작업을 수행합니다.

1. 운영 PostgreSQL 백업
2. `backend/migrations/001_topik_app.sql` 검토
3. 고정 문제 세트 2개의 존재 여부 확인
4. Render의 `DATABASE_URL` 대상 확인
5. 배포 후 `/health`와 `/v1/exams` 응답 확인

마이그레이션은 advisory lock과 체크섬을 사용해 동시에 중복 실행되거나
적용된 SQL이 조용히 변경되는 것을 방지합니다.

### 프론트엔드: Vercel

Vercel 프로젝트 설정:

| 설정 | 값 |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Install Command | `cd .. && pnpm install --frozen-lockfile` |
| Build Command | `pnpm build` |
| Output Directory | `dist` |
| Production Domain | `topik.unigate.kr` |

Vercel 환경변수:

```env
VITE_API_BASE_URL=https://topik-api.unigate.kr
```

`frontend/vercel.json`에는 React Router를 위한 SPA fallback과 기본 보안
헤더가 포함되어 있습니다.

## 배포 후 확인

```powershell
Invoke-RestMethod https://topik-api.unigate.kr/health
Invoke-RestMethod https://topik-api.unigate.kr/v1/exams
```

브라우저에서 다음 항목을 확인합니다.

1. `https://topik.unigate.kr` 랜딩 페이지 접속
2. 모의고사 1회·2회 목록 표시
3. 실전 또는 연습 세션 생성
4. 답안 저장 후 새로고침 복구
5. 수동 제출과 실전 모드 시간 만료 처리
6. 별점 제출 전 결과 잠금
7. 별점 제출 후 점수·오답·정답·해설 표시
8. 이메일 동의 여부에 따른 구독 저장

## 주요 명령어

| 명령어 | 설명 |
| --- | --- |
| `pnpm dev` | 프론트엔드와 백엔드 동시 개발 실행 |
| `pnpm db:migrate` | `topik_app` PostgreSQL 마이그레이션 적용 |
| `pnpm typecheck` | 전체 TypeScript 검사 |
| `pnpm test` | 전체 테스트 실행 |
| `pnpm build` | 전체 프로덕션 빌드 |
| `pnpm --filter @unigate/topik-api dev` | 백엔드만 개발 실행 |
| `pnpm --filter @unigate/topik-web dev` | 프론트엔드만 개발 실행 |
