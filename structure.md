# Panivo Structure Guide

This file is a fast orientation map for agents. It is meant to reduce re-reading cost by showing the project layout, the active runtime paths, and where core logic lives.

## 1) Product Snapshot

- Active runtime stack:
  - `mobile/` (Expo React Native iOS app)
  - `backend/` (FastAPI + PostgreSQL + AI pipeline)
- Legacy (kept for reference, not active product path):
  - `frontend-web-archive/` (Next.js web app)
- Placeholder:
  - `frontend/` (currently empty)

## 2) High-Level Runtime Flows

1. Auth flow:
   - Mobile login/signup/Apple Sign-In calls FastAPI `/auth/*`.
   - Backend issues JWT access + refresh tokens, stores refresh token hash in DB.
   - Mobile stores tokens in `expo-secure-store`.

2. Onboarding flow:
   - Mobile onboarding updates timezone + consent + optional survey answers.
   - Optional HealthKit sync reads local data and uploads metrics to backend.
   - Optional demo seed inserts 90 days of synthetic data.
   - User gets marked onboarded and routed to app tabs.

3. Debrief flow:
   - Metrics engine computes deterministic weekly summary.
   - PII scrubber sanitizes payload before AI.
   - AI provider (Vertex Gemini) generates narrative/highlights.
   - Safety post-filter strips diagnosis/treatment language.
   - Debrief saved; notifications (push/email) are attempted.
   - Scheduler runs hourly and triggers due weekly debriefs.

4. Chat flow:
   - Emergency phrase check first (bypasses AI if triggered).
   - Builds context from weekly summary + baselines + latest debrief.
   - PII scrub + AI response + safety post-filter.
   - Stores user and assistant messages in DB.

## 3) Repository Tree (Source Files)

Notes:
- This tree excludes generated/cache folders: `.git/`, `node_modules/`, `.next/`, `__pycache__/`.
- `.env` files are listed by name only.

```text
.
├── README.md
├── color-palette.md
├── docker-compose.yml
├── structure.md
├── backend/
│   ├── .env
│   ├── .env.local
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── alembic/
│   │   ├── README
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 06962bf933de_initial_schema.py
│   │       ├── a1b2c3d4e5f6_add_surveys_and_anonymous_data_lake.py
│   │       ├── b2c3d4e5f6a7_add_refresh_tokens_and_apple_user_id.py
│   │       ├── c3d4e5f6a7b8_add_apns_push_notification_columns.py
│   │       └── d4e5f6a7b8c9_drop_nextauth_tables.py
│   ├── templates/
│   │   └── debrief_email.html
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       ├── seed.py
│       ├── core/
│       │   ├── __init__.py
│       │   ├── auth.py
│       │   ├── config.py
│       │   ├── database.py
│       │   └── jwt.py
│       ├── models/
│       │   ├── __init__.py
│       │   └── models.py
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── auth.py
│       │   ├── baselines.py
│       │   ├── chat.py
│       │   ├── debriefs.py
│       │   ├── metrics.py
│       │   ├── onboarding.py
│       │   ├── sources.py
│       │   ├── surveys.py
│       │   ├── sync.py
│       │   └── users.py
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── auth.py
│       │   ├── baselines.py
│       │   ├── chat.py
│       │   ├── common.py
│       │   ├── debriefs.py
│       │   ├── metrics.py
│       │   ├── sources.py
│       │   ├── surveys.py
│       │   └── users.py
│       └── services/
│           ├── __init__.py
│           ├── anonymous_data_service.py
│           ├── baseline_service.py
│           ├── chat_service.py
│           ├── debrief_service.py
│           ├── metrics_engine.py
│           ├── notification_service.py
│           ├── pii_scrubber.py
│           ├── push_service.py
│           ├── safety_guardrails.py
│           ├── scheduler.py
│           ├── ai/
│           │   ├── __init__.py
│           │   ├── base.py
│           │   ├── factory.py
│           │   └── gemini_service.py
│           └── ingestion/
│               ├── __init__.py
│               ├── base.py
│               └── manual.py
├── mobile/
│   ├── .gitignore
│   ├── App.tsx
│   ├── app.config.ts
│   ├── app.json
│   ├── index.ts
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── assets/
│   │   ├── android-icon-background.png
│   │   ├── android-icon-foreground.png
│   │   ├── android-icon-monochrome.png
│   │   ├── favicon.png
│   │   ├── icon.png
│   │   └── splash-icon.png
│   ├── constants/
│   │   ├── colors.ts
│   │   └── config.ts
│   ├── hooks/
│   │   ├── useHealthKit.ts
│   │   └── useThemeColors.ts
│   ├── services/
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   ├── healthkit-background.ts
│   │   ├── healthkit-sync.ts
│   │   ├── healthkit.ts
│   │   └── push-notifications.ts
│   ├── components/
│   │   ├── auth-provider.tsx
│   │   ├── debrief-card.tsx
│   │   ├── feedback-widget.tsx
│   │   ├── highlights-strip.tsx
│   │   ├── sparkline-chart.tsx
│   │   └── ui/
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── loading.tsx
│   │       ├── progress-bar.tsx
│   │       ├── separator.tsx
│   │       └── switch-row.tsx
│   └── app/
│       ├── _layout.tsx
│       ├── index.tsx
│       ├── (auth)/
│       │   ├── _layout.tsx
│       │   ├── login.tsx
│       │   └── signup.tsx
│       ├── onboarding/
│       │   ├── _layout.tsx
│       │   └── index.tsx
│       └── (app)/
│           ├── _layout.tsx
│           └── (tabs)/
│               ├── _layout.tsx
│               ├── chat.tsx
│               ├── history.tsx
│               ├── index.tsx
│               └── settings.tsx
├── frontend/                           (empty placeholder dir)
└── frontend-web-archive/
    ├── .env.local
    ├── .gitignore
    ├── README.md
    ├── components.json
    ├── eslint.config.mjs
    ├── middleware.ts
    ├── next-env.d.ts
    ├── next.config.ts
    ├── package.json
    ├── package-lock.json
    ├── postcss.config.mjs
    ├── tsconfig.json
    ├── tsconfig.tsbuildinfo
    ├── public/
    │   ├── file.svg
    │   ├── globe.svg
    │   ├── next.svg
    │   ├── vercel.svg
    │   └── window.svg
    ├── types/
    │   └── next-auth.d.ts
    ├── lib/
    │   ├── api.ts
    │   ├── auth.ts
    │   └── utils.ts
    ├── components/
    │   ├── auth-provider.tsx
    │   ├── debrief-card.tsx
    │   ├── feedback-widget.tsx
    │   ├── highlights-strip.tsx
    │   ├── nav.tsx
    │   ├── sparkline-chart.tsx
    │   ├── theme-provider.tsx
    │   ├── theme-toggle.tsx
    │   └── ui/
    │       ├── avatar.tsx
    │       ├── badge.tsx
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── dialog.tsx
    │       ├── dropdown-menu.tsx
    │       ├── input.tsx
    │       ├── label.tsx
    │       ├── progress.tsx
    │       ├── scroll-area.tsx
    │       ├── select.tsx
    │       ├── separator.tsx
    │       ├── sheet.tsx
    │       ├── skeleton.tsx
    │       ├── slider.tsx
    │       ├── sonner.tsx
    │       ├── switch.tsx
    │       ├── tabs.tsx
    │       ├── textarea.tsx
    │       └── tooltip.tsx
    └── app/
        ├── favicon.ico
        ├── globals.css
        ├── layout.tsx
        ├── page.tsx
        ├── (auth)/
        │   ├── login/page.tsx
        │   └── signup/page.tsx
        ├── onboarding/
        │   ├── _onboarding-wizard.tsx
        │   └── page.tsx
        ├── (app)/
        │   ├── error.tsx
        │   ├── layout.tsx
        │   ├── chat/
        │   │   ├── _chat-client.tsx
        │   │   ├── loading.tsx
        │   │   └── page.tsx
        │   ├── dashboard/
        │   │   ├── _dashboard-client.tsx
        │   │   ├── loading.tsx
        │   │   └── page.tsx
        │   ├── history/
        │   │   ├── _history-client.tsx
        │   │   ├── loading.tsx
        │   │   └── page.tsx
        │   └── settings/
        │       ├── _settings-client.tsx
        │       ├── loading.tsx
        │       └── page.tsx
        └── api/
            ├── [...path]/route.ts
            └── auth/
                ├── [...nextauth]/route.ts
                └── signup/route.ts
```

## 4) Backend Deep Map

### App Entry + Middleware

- `backend/app/main.py`
  - Creates FastAPI app and lifespan hooks.
  - Starts/stops `services/scheduler.py`.
  - Adds CORS + GZip middleware.
  - Adds rate limiting (`slowapi`).
  - Registers routers for auth/users/metrics/sources/baselines/onboarding/debriefs/chat/surveys/sync.

### Core Layer

- `core/config.py`: environment-driven settings (DB, JWT, AI, APNs, Resend, anonymous ID secret).
- `core/database.py`: SQLAlchemy engine/session/base.
- `core/jwt.py`: JWT create/verify + refresh token hashing.
- `core/auth.py`: `get_current_user_id` dependency from Bearer token.

### API Routers (HTTP Surface)

- `routers/auth.py`: signup, login, refresh, me, Apple Sign-In.
- `routers/users.py`: me profile, profile patch, APNs token update.
- `routers/metrics.py`: list metrics + upsert metrics batch.
- `routers/sources.py`: list/create sources, mark source synced.
- `routers/baselines.py`: list user baselines.
- `routers/onboarding.py`: seed demo data + mark onboarding complete.
- `routers/debriefs.py`: list/current/weekly-summary/trigger/feedback.
- `routers/chat.py`: sessions + messages.
- `routers/surveys.py`: survey questions/responses/consent update.
- `routers/sync.py`: max timestamps for client refresh decisions.

### Service Layer (Business Logic)

- `services/metrics_engine.py`: deterministic weekly analytics, composite scores, trends, notable day detection.
- `services/baseline_service.py`: 30-day rolling baseline upsert.
- `services/debrief_service.py`: debrief orchestration (summary -> scrub -> AI -> guardrails -> persist -> notify).
- `services/chat_service.py`: emergency check, context building, AI chat call, storage, daily rate limit.
- `services/safety_guardrails.py`: emergency detector + diagnosis/treatment filter + disclaimer constant.
- `services/pii_scrubber.py`: recursive PII key stripping/redaction and context truncation.
- `services/scheduler.py`: hourly APScheduler scan for due debrief generation.
- `services/anonymous_data_service.py`: consent-gated de-identified lake writes.
- `services/notification_service.py`: debrief email via Resend + Jinja template.
- `services/push_service.py`: APNs JWT auth + HTTP/2 push send.
- `services/ai/factory.py`: provider selection (`AI_PROVIDER`).
- `services/ai/gemini_service.py`: Vertex Gemini implementation.
- `services/ingestion/*`: deprecated adapter scaffolding (manual adapter still used for seeded/manual data model).

### Data Layer

- `models/models.py` defines all ORM tables:
  - `users`
  - `refresh_tokens`
  - `data_sources`
  - `health_metrics`
  - `weekly_debriefs`
  - `chat_sessions`
  - `chat_messages`
  - `debrief_feedback`
  - `user_baselines`
  - `survey_questions`
  - `survey_responses`
  - `anonymous_profiles`
  - `anonymous_survey_data`
  - `anonymous_health_data`

### Schema Layer

- `schemas/*.py`: request/response models grouped by feature (`auth`, `users`, `metrics`, `chat`, etc.).
- `schemas/common.py`: shared generic paginated response.

### Migrations

- Alembic sequence:
  1. Initial schema with legacy NextAuth tables.
  2. Added surveys + anonymous data lake.
  3. Added refresh tokens + Apple user ID.
  4. Added APNs push columns.
  5. Dropped legacy NextAuth tables/columns.

## 5) Mobile Deep Map

### Navigation Layout

- `app/_layout.tsx`: app root (AuthProvider + background sync registration + notification listeners).
- `app/index.tsx`: initial loading shell (AuthProvider handles redirects).
- `app/(auth)/*`: login/signup stack.
- `app/onboarding/index.tsx`: 5-step onboarding wizard.
- `app/(app)/(tabs)/*`: authenticated tab UI.

### Core Client State + API

- `components/auth-provider.tsx`: auth context + route guarding:
  - Unauthenticated -> `/(auth)/login`
  - Authenticated but not onboarded -> `/onboarding`
  - Onboarded -> `/(app)/(tabs)`
- `services/auth.ts`: token storage and auth endpoints.
- `services/api.ts`: typed API client with Bearer token and 401 refresh retry.

### HealthKit + Sync

- `services/healthkit.ts`: reads sleep/HRV/resting HR/steps via `react-native-health`.
- `services/healthkit-sync.ts`: source creation + metrics upload batching + sync state persistence.
- `services/healthkit-background.ts`: Expo background fetch task registration.
- `hooks/useHealthKit.ts`: UI-facing state/actions for authorization + manual sync.

### Push Notifications

- `services/push-notifications.ts`:
  - Requests permission.
  - Retrieves APNs device token.
  - Sends token to backend.
  - Handles tap deep links (debrief-ready -> dashboard tab).

### UI Building Blocks

- Feature components:
  - `debrief-card.tsx`
  - `feedback-widget.tsx`
  - `highlights-strip.tsx`
  - `sparkline-chart.tsx`
- Primitive UI kit under `components/ui/*`.
- Theme system:
  - `constants/colors.ts`
  - `hooks/useThemeColors.ts`

## 6) Archived Web App (`frontend-web-archive/`)

Purpose: historical reference from prior Next.js implementation.

- `app/(app)/*`: dashboard/chat/history/settings pages.
- `app/onboarding/*`: web onboarding wizard.
- `app/api/[...path]/route.ts`: proxy to backend using session headers.
- `lib/auth.ts`: NextAuth credentials setup with Postgres adapter.
- `middleware.ts`: route protection for authenticated paths.
- `components/*`: web component library and UI primitives.

Current product path does not depend on this folder at runtime.

## 7) Infra and Ops Files

- `docker-compose.yml`:
  - Postgres 16 (`db`) on host `5433`.
  - Backend on `8000`.
  - Backend container runs `alembic upgrade head` then `uvicorn`.
- `backend/Dockerfile`: Python 3.12 slim image, installs requirements, runs migrations + server.
- `README.md`: setup instructions and architecture overview.
- `color-palette.md`: palette exploration docs used by UI/theme work.

## 8) Endpoint Cheat Sheet (FastAPI)

- Auth:
  - `POST /auth/signup`
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `GET /auth/me`
  - `POST /auth/apple`
- Users:
  - `GET /users/me`
  - `PATCH /users/me`
  - `PUT /users/me/push-token`
- Metrics/Sources/Baselines:
  - `GET/POST /metrics`
  - `GET/POST /sources`
  - `PATCH /sources/{source_id}/synced`
  - `GET /baselines`
- Debriefs:
  - `GET /debriefs`
  - `GET /debriefs/current`
  - `GET /debriefs/weekly-summary`
  - `POST /debriefs/trigger`
  - `POST /debriefs/{debrief_id}/feedback`
- Chat:
  - `GET/POST /chat/sessions`
  - `GET/POST /chat/sessions/{session_id}/messages`
- Onboarding/Surveys/Sync:
  - `POST /onboarding/seed-demo`
  - `POST /onboarding/complete`
  - `GET /surveys/questions`
  - `POST /surveys/responses`
  - `GET /surveys/responses`
  - `PATCH /surveys/consent`
  - `GET /sync/status`
- Health:
  - `GET /health`

## 9) Where to Edit by Task

- Add/modify API endpoint:
  - `backend/app/routers/<feature>.py`
  - matching `backend/app/schemas/<feature>.py`
  - business logic in `backend/app/services/<feature>_service.py` (or equivalent)
- Change DB model:
  - `backend/app/models/models.py`
  - add Alembic migration in `backend/alembic/versions/`
- Change debrief math:
  - `backend/app/services/metrics_engine.py`
- Change AI prompt/provider:
  - `backend/app/services/ai/gemini_service.py`
  - or `backend/app/services/ai/factory.py`
- Change onboarding/chat/history/settings mobile UI:
  - `mobile/app/...`
- Change mobile networking/auth:
  - `mobile/services/api.ts`
  - `mobile/services/auth.ts`
- Change HealthKit behavior:
  - `mobile/services/healthkit.ts`
  - `mobile/services/healthkit-sync.ts`
- Change push behavior:
  - mobile registration/listeners: `mobile/services/push-notifications.ts`
  - backend send pipeline: `backend/app/services/push_service.py`

---

If you only need the active product path, focus on `backend/` + `mobile/` and ignore `frontend-web-archive/`.
