# UNIGATE TOPIK II Mock Test

`topik.unigate.kr`용 TOPIK II 읽기·듣기 모의고사입니다.

- 프론트엔드: React, Vite, TypeScript, Tailwind CSS, SUIT
- 백엔드: Fastify, TypeScript, PostgreSQL
- 인증·스토리지: Supabase Auth + Supabase Storage
- 음성: Google Cloud Gemini 2.5 Flash TTS
- 운영: Vercel 프론트엔드 + Render API

## 구조와 데이터

```text
Unigate-Web/
├─ frontend/                    # 사용자·관리자 React SPA
├─ backend/
│  ├─ migrations/              # topik_app 마이그레이션
│  ├─ seed-assets/listening/   # 초기 그림·그래프 선택지 24개
│  └─ src/                     # API, TTS worker, Supabase 연결
├─ POSTGRESQL_QUESTION_BANK.md
└─ render.yaml
```

PostgreSQL은 두 스키마를 사용합니다.

- `topik_bank`: 변경하지 않는 문제은행과 문항 버전
- `topik_app`: 모의고사, 응답, 관리자, TTS 작업, 오디오·이미지 연결

고정 세트:

| 모의고사 | `set_id` | 시간 |
| --- | --- | --- |
| 읽기 1회 | `64c027ea-fa18-5cd3-8039-79ecde41916a` | 70분 |
| 읽기 2회 | `fc0a5fa7-391e-586f-ab7c-1b7b8193358a` | 70분 |
| 듣기 1회 | `3ffc10a1-db41-5718-b479-60224edec836` | 60분 |
| 듣기 2회 | `c5e3af83-93d5-5bef-a2e7-5186ee358f9c` | 60분 |

듣기 모의고사는 음원 50개와 필수 선택지 이미지가 준비된 뒤 관리자 페이지에서 공개합니다.

## 요구사항과 pnpm 설치

- Node.js 22 이상
- PostgreSQL과 기존 `topik_bank` 문제은행
- Supabase 프로젝트
- Google Cloud 프로젝트와 Cloud Text-to-Speech API

이 저장소는 pnpm 11을 사용합니다. `pnpm is not recognized` 오류가 나면 별도 전역 설치 대신 Corepack을 사용합니다.

```powershell
corepack enable
corepack pnpm --version
corepack pnpm install
```

`corepack enable` 권한 오류가 나더라도 `corepack pnpm ...` 형식은 사용할 수 있습니다. 이후 README의 `pnpm` 명령은 모두 `corepack pnpm`으로 바꿔 실행해도 됩니다.

## 로컬 개발

### 1. 설치와 환경변수

```powershell
cd C:\Users\khyun\Projects\Unigate-Web
corepack pnpm install
Copy-Item backend\.env.example backend\.env.development
Copy-Item frontend\.env.example frontend\.env
```

`backend/.env.development`에서 다음 값을 설정합니다. 백엔드는 실행 위치와 관계없이
`NODE_ENV`에 따라 `.env.development`, `.env.test`, `.env.production`을 먼저 읽고,
해당 값이 없으면 `backend/.env`를 보조 설정으로 읽습니다. Render 등의 시스템 환경변수는 파일보다 우선합니다.

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/topik
DATABASE_SSL=disable
APP_ORIGINS=http://localhost:5173,https://topik.unigate.kr
TRUST_PROXY=false

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_AUDIO_BUCKET=topik-listening-audio
SUPABASE_MEDIA_BUCKET=topik-question-media

GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_CREDENTIALS_JSON={"type":"service_account",...}
GOOGLE_TTS_MODEL=gemini-2.5-flash-tts
GOOGLE_TTS_FEMALE_VOICE=Aoede
GOOGLE_TTS_MALE_VOICE=Charon
TTS_WORKER_ENABLED=true

ADMIN_EMAIL=admin@unigate.kr
ADMIN_PASSWORD=12자-이상의-강한-임시-비밀번호
```

`GOOGLE_CLOUD_CREDENTIALS_JSON`은 줄바꿈 없는 JSON으로 설정합니다. 해당 서비스 계정에는 Cloud Text-to-Speech 합성 권한만 부여합니다. 실제 키와 서비스 역할 키는 Git에 커밋하지 않습니다.

`frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 2. DB 마이그레이션

```powershell
corepack pnpm db:migrate
```

마이그레이션은 `topik_bank`를 수정하지 않고 `topik_app`만 생성·확장합니다. advisory lock과 체크섬으로 중복 적용 및 적용된 SQL 변경을 방지합니다.

### 3. 최초 관리자 계정 1개 생성

Supabase 이메일 로그인이 활성화되어 있어야 합니다.

```powershell
corepack pnpm --filter @unigate/topik-api admin:bootstrap
```

명령은 `ADMIN_EMAIL` 기준으로 멱등 실행됩니다. Supabase Auth 사용자를 만들고 `topik_app.admin_users` 허용 목록에 등록합니다. 생성 후 `ADMIN_PASSWORD`는 `.env`나 배포 비밀값에서 제거해도 됩니다.

### 4. 초기 듣기 이미지 업로드

```powershell
corepack pnpm --filter @unigate/topik-api assets:seed
```

이 명령은 다음 작업을 수행합니다.

- 비공개 `topik-listening-audio` 버킷 생성
- 공개 `topik-question-media` 버킷 생성
- 기존 그래프 8개와 생성된 그림 선택지 16개 업로드
- 각 `(item_id, item_version, option_number)`의 URL을 PostgreSQL에 저장

재실행해도 이미 연결된 자산은 중복 생성하지 않습니다.

### 5. 실행

프론트엔드와 백엔드 동시 실행:

```powershell
corepack pnpm dev
```

개별 실행:

```powershell
corepack pnpm --filter @unigate/topik-api dev
corepack pnpm --filter @unigate/topik-web dev
```

| 서비스 | 주소 |
| --- | --- |
| 사용자 페이지 | `http://localhost:5173` |
| 관리자 페이지 | `http://localhost:5173/admin` |
| API | `http://localhost:4000` |
| 상태 확인 | `http://localhost:4000/health` |

### 6. 듣기 음원 생성과 공개

1. `/admin`에서 `ADMIN_EMAIL` 계정으로 로그인합니다.
2. 듣기 회차의 `누락 음원 일괄 생성`을 누릅니다.
3. DB 작업 큐가 Google Cloud TTS를 순차 호출합니다. 한 회차는 1~20번 단일 음원 20개와 21~50번 공통 음원 15개, 총 35개 그룹 작업입니다.
4. 여자 `Aoede`, 남자 `Charon` 음성이 적용되고 MP3가 Supabase에 저장됩니다.
5. 음원 `50/50`, 이미지 준비 수가 요구 수와 같으면 `시험 공개`를 누릅니다.

작업은 DB에 남으므로 서버가 재시작되어도 재개됩니다. 동일 대화·모델·음성 해시는 재사용하며 21~50번 묶음 문제는 같은 음원을 공유합니다.

관리자 페이지는 `요약`, `듣기 문항`, `읽기 문항`, `사용자 응답` 탭으로 나뉩니다.

- 듣기: 생성 전 말하기 속도(0.75~1.25배)와 추가 스타일 지시를 설정할 수 있습니다. 재생성하면 새 설정이 작업과 음원에 함께 기록됩니다.
- 음원 삭제: 공통 대본 그룹의 모든 문항 연결을 함께 해제하며, 다른 문항이 공유하지 않는 파일은 Supabase Storage에서도 삭제합니다. 재생 이력이 있는 SQL 행은 분석 참조를 위해 삭제 표시만 남깁니다.
- TTS 오류: 실패 작업이 있을 때만 요약 화면과 해당 문항의 접힌 상세 영역에 표시됩니다. 이후 생성이 성공하면 문항에서는 이전 오류를 표시하지 않습니다.
- 읽기: 세트·검색 필터로 본문, 보기, 정답, 해설, 목표 급수와 난이도를 검수할 수 있습니다.
- 사용자 응답: 제출 세션을 펼쳐 문항별 선택 답안, 정답 여부, 활성 응답 시간과 답 변경 여부를 확인합니다. 체크한 세션만 삭제하거나 `전체 응답 삭제` 문구를 입력해 제출 완료 세션을 모두 삭제할 수 있습니다. 진행 중 시험과 이메일 수신 동의는 보존되며 삭제 수량과 관리자는 감사 로그에 기록됩니다.

관리자 기능을 업데이트한 기존 환경에서는 배포 전에 새 마이그레이션을 적용합니다.

```powershell
corepack pnpm db:migrate
```

## 검사와 로컬 프로덕션 실행

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

백엔드 프로덕션 방식:

```powershell
corepack pnpm --filter @unigate/topik-api build
corepack pnpm --filter @unigate/topik-api start
```

프론트엔드 프로덕션 미리보기:

```powershell
corepack pnpm --filter @unigate/topik-web build
corepack pnpm --filter @unigate/topik-web preview
```

## 운영 배포

### Render 백엔드

루트의 `render.yaml`을 Blueprint로 연결합니다.

- 도메인: `https://topik-api.unigate.kr`
- Root Directory: `backend`
- 배포 전: `node dist/migrate.js`
- 상태 확인: `/health`

Render 비밀값:

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_CLOUD_PROJECT_ID=...
GOOGLE_CLOUD_CREDENTIALS_JSON={...}
```

일반 환경변수는 `render.yaml`에 정의되어 있습니다. 최초 배포 후 Render Shell에서 한 번 실행합니다.

```bash
ADMIN_EMAIL=admin@unigate.kr ADMIN_PASSWORD='strong-temporary-password' node dist/bootstrap-admin.js
ADMIN_EMAIL=admin@unigate.kr node dist/seed-listening-assets.js
```

Docker 빌드에는 `seed-assets`와 위 스크립트가 포함됩니다. 초기화 후 `ADMIN_PASSWORD` 비밀값을 제거합니다.

### Vercel 프론트엔드

| 설정 | 값 |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Install Command | `cd .. && corepack pnpm install --frozen-lockfile` |
| Build Command | `corepack pnpm --filter @unigate/topik-web build` |
| Output Directory | `dist` |
| Domain | `topik.unigate.kr` |

Vercel 환경변수:

```env
VITE_API_BASE_URL=https://topik-api.unigate.kr
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

`SUPABASE_SERVICE_ROLE_KEY`, Google 서비스 계정, 관리자 비밀번호는 프론트엔드에 절대 넣지 않습니다.

## 배포 후 확인

```powershell
Invoke-RestMethod https://topik-api.unigate.kr/health
Invoke-RestMethod https://topik-api.unigate.kr/v1/exams
```

확인 항목:

1. `/admin`에서 관리자 로그인 및 통계 표시
2. 비관리자 Supabase 계정의 관리자 API 접근 거부
3. 듣기 음원 단일·일괄 생성, 남녀 음성, 미리 듣기
4. Supabase 객체와 PostgreSQL URL 연결
5. 준비되지 않은 듣기 시험 공개 거부
6. 실전 모드 자동 재생·횟수 제한과 연습 모드 자유 재생
7. 묶음 듣기 두 문항 동시 표시 및 문항별 답안 저장
8. 제출 시 50개 최종 응답 생성과 별점 후 결과·대본 공개

Google Cloud 요청 형식은 [Gemini TTS 공식 문서](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)를 기준으로 합니다.
