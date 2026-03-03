# Project Plan

## What This App Does

VitalView is a health debrief app. Users' wearable data (Apple Watch, Whoop, Oura, etc.) is stored and analyzed by an AI. Every week, the app generates a personalized written health narrative — what happened, what to pay attention to, what to try next — and emails it to the user. Users can also chat with an AI that knows their health history. The MVP uses seeded/manual data; the architecture supports plugging in real wearable sources later without refactoring.

## Intentional MVP Tradeoffs + Upgrade Scaffolding

The shortcuts below are intentional for MVP speed, and each includes scaffolding that is in-scope now so we can upgrade later without a full rewrite.

| Area | Intentional MVP Shortcut (Known Tradeoff) | Scaffolding Required Now | Upgrade Path Later |
|---|---|---|---|
| Auth providers | Email/password only via NextAuth Credentials | Keep auth config modular in `frontend/lib/auth.ts`; keep NextAuth `accounts` table in schema even if unused in MVP | Add OAuth providers (Google/GitHub/etc.) and account linking without schema rewrite |
| Signup flow | Signup route writes directly to Postgres from Next.js | Keep validation + password hashing isolated in one route module; keep user creation fields aligned with shared `users` model | Move signup/user creation behind a dedicated auth service or backend endpoint |
| Backend trust boundary | FastAPI trusts proxy headers plus shared `API_SECRET_KEY` | Keep all backend auth extraction in `core/auth.py` and expose a single user-context dependency to routers | Swap to signed service-to-service JWT (or mTLS) with minimal router changes |
| Scheduler | In-process APScheduler in FastAPI app | Keep scheduler as a thin trigger layer; keep debrief generation logic in service function callable from any worker | Move to external cron + queue/worker execution model |
| Data ingestion | Manual/demo data source only | Use `DataSourceAdapter` abstraction and `data_sources` table from day 1 | Add Apple/Whoop/Oura/Fitbit adapters behind same interface |
| Chat transport | Non-streaming responses only | Keep chat API wrapper and UI state transport-agnostic | Add streaming (SSE/WebSocket) without rewriting chat persistence |
| Rate limiting | DB-count query, no Redis | Keep rate-limit check in one service boundary | Replace implementation with Redis/token bucket if throughput needs it |
| Type constraints | VARCHAR for `source_type` / `metric_type` (no DB ENUM) | Centralize validation in schemas/services | Add DB-level CHECK/ENUM constraints if needed, without contract changes |
| Seed/demo data | Seeded users/data for rapid testing | Keep seed logic isolated in `seed.py` and onboarding seed endpoint | Replace with real ingestion + backfill jobs; keep seed endpoint optional for demos |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python) |
| Database | PostgreSQL via SQLAlchemy ORM |
| Migrations | Alembic |
| Scheduling | APScheduler |
| AI | Anthropic Claude API |
| Auth | NextAuth (Auth.js) in Next.js |
| Email | Resend |
| Frontend | Next.js 14 (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Backend Hosting | Railway |
| Frontend Hosting | Vercel |

### Auth Architecture

**Provider:** NextAuth Credentials provider (email + password) for MVP. OAuth providers (Google, GitHub) can be added later with zero architecture changes.

**Database adapter:** `@auth/pg-adapter` — connects NextAuth directly to the PostgreSQL database. This adapter does NOT auto-create tables — all tables must exist before NextAuth runs.

**User table sharing:** NextAuth and the app share ONE `users` table. It contains both NextAuth's required columns (`id`, `name`, `email`, `emailVerified`, `image`) and app-specific columns (`hashed_password`, `timezone`, `notification_email`, `email_notifications_enabled`, `onboarded_at`). All columns are created by Alembic in a single migration.

**Password handling:** The Credentials provider does NOT handle password storage or hashing automatically. A `hashed_password` column exists on the `users` table. Signup: a custom `/api/auth/signup` Next.js API route hashes the password (bcrypt) and inserts the user. Login: NextAuth's `authorize()` callback queries the user by email and compares the password hash with bcrypt. The signup route is NOT proxied to FastAPI — it runs entirely in Next.js and writes directly to PostgreSQL via the `pg` driver.

**Session strategy:** Use JWT sessions (`session: { strategy: "jwt" }`), NOT database sessions. The Credentials provider does not trigger the database session flow — using `strategy: "database"` with Credentials is a known NextAuth footgun where `getServerSession()` returns null. Configure a `jwt` callback to embed `user.id` into the token, and a `session` callback to expose `session.user.id` from the token. The catch-all proxy route reads the user ID from `session.user.id` via `getServerSession()`.

**User creation flow:** When a user signs up via the custom signup route, a row is inserted into `users` with `email`, `name`, `hashed_password`, and defaults for app fields. The onboarding flow (frontend) then calls `PATCH /users/me` to set `timezone` and `onboarded_at`.

**Proxy pattern:** The FastAPI backend is **not** publicly exposed. Next.js API routes act as an authenticated proxy:

1. Client makes request to Next.js API route
2. NextAuth middleware verifies the session
3. Next.js API route forwards the request to FastAPI with `X-User-Id` and `X-User-Email` headers
4. FastAPI trusts these headers (enforced via a shared `API_SECRET_KEY` in the `X-API-Key` header — FastAPI rejects requests without a matching key)

FastAPI has zero auth logic. It receives a verified user ID on every request.

### Project Structure

```
/
├── backend/          # FastAPI Python app
├── frontend/         # Next.js app
└── docker-compose.yml
```

**Local dev setup:** `docker-compose.yml` runs PostgreSQL and FastAPI (with hot-reload via volume mount). The Next.js frontend runs separately via `npm run dev` in `/frontend`, with `BACKEND_URL=http://localhost:8000` pointing to the Dockerized FastAPI. No CORS is needed on FastAPI — all requests come server-to-server from Next.js API routes, not from the browser.

**Migrations:** Run `alembic upgrade head` after `docker-compose up` to initialize/update the schema. For Railway, configure Alembic migrations as a release command that runs before the web process starts.

### Environment Variables

```
# Backend (.env in /backend)
DATABASE_URL=postgresql://vitalview:vitalview@localhost:5432/vitalview
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
API_SECRET_KEY=shared-secret-between-nextjs-and-fastapi
FRONTEND_URL=http://localhost:3000

# Frontend (.env.local in /frontend)
NEXTAUTH_SECRET=random-32-char-secret
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://vitalview:vitalview@localhost:5432/vitalview
BACKEND_URL=http://localhost:8000
API_SECRET_KEY=shared-secret-between-nextjs-and-fastapi
```

---

## Database Schema

8 app tables + 3 NextAuth tables (accounts, sessions, verification_tokens) = 11 total. All managed by Alembic. All IDs are UUID. All tables have `created_at TIMESTAMP`. Use VARCHAR (not ENUM) for all type fields — validated at the application level.

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK — used as `X-User-Id` everywhere |
| email | VARCHAR | Unique, indexed |
| name | VARCHAR | |
| hashed_password | VARCHAR | bcrypt hash — set during signup, verified by NextAuth `authorize()` |
| emailVerified | TIMESTAMP | Managed by NextAuth |
| image | VARCHAR | Managed by NextAuth |
| timezone | VARCHAR | Default `America/New_York` — set during onboarding |
| notification_email | VARCHAR | Nullable, defaults to email if unset |
| email_notifications_enabled | BOOLEAN | Default true |
| onboarded_at | TIMESTAMP | Null until onboarding complete |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Alembic creates this table in full (both NextAuth-required and app-specific columns), plus the NextAuth `accounts`, `sessions`, and `verification_tokens` tables matching the `@auth/pg-adapter` schema.

### `data_sources`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| source_type | VARCHAR | `manual`, `apple_health`, `garmin`, `fitbit`, `whoop`, `oura` |
| config | JSONB | Source-specific config |
| last_synced_at | TIMESTAMP | |
| is_active | BOOLEAN | Default true |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

MVP only uses `manual` source type.

### `health_metrics`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| source_id | UUID | FK → data_sources, nullable |
| date | DATE | |
| metric_type | VARCHAR | `sleep_hours`, `hrv`, `resting_hr`, `steps` (MVP metric types — more can be added later with no migration) |
| value | FLOAT | |
| created_at | TIMESTAMP | |

**Constraints & Indexes:**
- `(user_id, date, metric_type)` — unique constraint; `POST /metrics` and seed scripts use upsert (ON CONFLICT UPDATE) to prevent duplicates
- `(user_id, date)` — index for range queries

### `weekly_debriefs`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| week_start | DATE | |
| week_end | DATE | |
| narrative | TEXT | AI-generated debrief |
| highlights | JSONB | Key stats array |
| status | VARCHAR | `pending`, `generating`, `generated`, `sent`, `failed` |
| email_sent_at | TIMESTAMP | Null until email sent |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Indexes:**
- `(user_id, week_start)` — unique constraint, one debrief per user per week

### `chat_sessions`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| title | VARCHAR | Default: first 50 characters of the user's first message. No AI call needed. |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `chat_messages`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| session_id | UUID | FK → chat_sessions |
| user_id | UUID | FK → users |
| role | VARCHAR | `user`, `assistant` |
| content | TEXT | |
| created_at | TIMESTAMP | |

**Indexes:**
- `(session_id, created_at)` — ordered retrieval

### `debrief_feedback`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| debrief_id | UUID | FK → weekly_debriefs |
| user_id | UUID | FK → users |
| rating | SMALLINT | 1–5 |
| comment | TEXT | Optional |
| created_at | TIMESTAMP | |

**Constraints:**
- `(debrief_id, user_id)` — unique constraint; submitting feedback for the same debrief upserts (replaces previous rating/comment)

### `user_baselines`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| metric_type | VARCHAR | Same values as health_metrics.metric_type |
| baseline_value | FLOAT | Rolling 30-day average |
| std_deviation | FLOAT | For detecting significant deviations |
| calculated_at | TIMESTAMP | |

**Indexes:**
- `(user_id, metric_type)` — fast lookup during debrief generation

---

## Backend (FastAPI)

```
backend/
├── app/
│   ├── routers/
│   │   ├── metrics.py       # GET/POST health metrics
│   │   ├── debriefs.py      # GET debriefs, POST feedback, POST trigger (manual)
│   │   ├── chat.py          # POST message, GET sessions, GET messages
│   │   ├── sources.py       # GET/POST data sources
│   │   ├── users.py         # GET/PATCH /users/me
│   │   ├── baselines.py     # GET /baselines
│   │   └── onboarding.py    # POST /onboarding/seed-demo
│   ├── services/
│   │   ├── ai_service.py        # Claude API calls, prompt construction
│   │   ├── debrief_service.py   # Data aggregation → prompt → Claude → store
│   │   ├── notification_service.py  # Resend email delivery
│   │   ├── baseline_service.py  # Rolling 30-day avg + std deviation calc
│   │   └── ingestion/
│   │       ├── base.py          # Abstract DataSourceAdapter interface
│   │       └── manual.py        # Manual/seed data adapter
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── core/
│   │   ├── config.py        # pydantic-settings: env vars, API keys
│   │   ├── database.py      # Engine, session, Base
│   │   └── auth.py          # Dependency: extract user_id from X-User-Id header, verify X-API-Key
│   ├── scheduler.py         # APScheduler: weekly debrief cron job
│   ├── seed.py              # Generate 90 days of mock data for 3 users
│   └── main.py              # App init, router registration, scheduler start
├── templates/
│   └── debrief_email.html   # Jinja2 email template for weekly debrief notification
├── alembic/
├── alembic.ini
├── requirements.txt
└── Dockerfile
```

### API Endpoints

All endpoints receive `X-User-Id` and `X-API-Key` headers from the Next.js proxy. All list endpoints accept `limit` (default 20, max 100) and `offset` (default 0) query params and return `{items: [...], total: int}`.

**Metrics:**
- `GET /metrics?start_date=&end_date=&metric_type=` — returns metrics for authenticated user
- `POST /metrics` — create metric entries (body: array of `{date, metric_type, value}`)

**Debriefs:**
- `GET /debriefs?limit=20&offset=0` — paginated list, newest first
- `GET /debriefs/current` — get this week's debrief
- `POST /debriefs/trigger` — manually trigger debrief generation (dev/testing)
- `POST /debriefs/{id}/feedback` — submit rating + optional comment

**Chat:**
- `GET /chat/sessions?limit=20&offset=0` — paginated list of user's chat sessions
- `POST /chat/sessions` — create new session
- `GET /chat/sessions/{id}/messages?limit=50&offset=0` — paginated messages in session
- `POST /chat/sessions/{id}/messages` — send message, get AI response back

**Sources:**
- `GET /sources` — list user's data sources
- `POST /sources` — register a data source

**Users:**
- `PATCH /users/me` — update user settings (accepts `{timezone, notification_email, email_notifications_enabled}`)
- `GET /users/me` — get current user profile with app-specific fields

**Baselines:**
- `GET /baselines` — returns current baselines for the authenticated user (all metric types)

**Onboarding:**
- `POST /onboarding/seed-demo` — generates 90 days of demo health data for the authenticated user, creates a `manual` data source, calculates baselines, and generates one sample debrief. Called during the onboarding flow when user selects "start with demo data."

### Debrief Generation Pipeline

Triggered weekly by APScheduler or manually via `/debriefs/trigger`. For each user:

Scheduler must only trigger `debrief_service` entrypoints; generation must be idempotent using the unique `(user_id, week_start)` constraint and status transitions.

**Week definition:** A week runs Monday through Sunday. `week_start` = that Monday. `week_end` = that Sunday. "Past 7 days" = Monday 00:00 through Sunday 23:59 in the user's timezone.

**Scheduler approach:** APScheduler runs an interval job every hour. Each tick queries for users where the current UTC time ≥ Sunday 21:00 in the user's timezone AND no `weekly_debriefs` row exists for that `(user_id, week_start)`. For each match, it calls `debrief_service.generate_weekly_debrief()`. The idempotent upsert on `(user_id, week_start)` prevents duplicates on overlap or retry.

1. Idempotently create or fetch the `weekly_debriefs` row for `(user_id, week_start)` with status `pending`, then set to `generating`
2. Query past 7 days of raw metrics from `health_metrics`
3. Query `user_baselines` for current baselines + std deviations
4. Query previous 3 weeks of weekly averages per metric for trend context
5. Build structured prompt (see Prompt Spec below)
6. Call Claude API → get narrative response
7. Parse response, store in `weekly_debriefs` with status `generated`
8. Send email via Resend with Jinja2 HTML template: 2–3 sentence summary + link to app + medical disclaimer + unsubscribe link
9. Update status to `sent`, set `email_sent_at`
10. On failure: set status to `failed`, log error

### Baseline Calculation

Runs after debrief generation (or on demand). For each user, for each metric type:
1. Query last 30 days of values from `health_metrics`
2. Calculate mean → `baseline_value`
3. Calculate standard deviation → `std_deviation`
4. Upsert into `user_baselines`

### Chat Implementation

Non-streaming for MVP. Per message:
1. Load last 10 messages from the current session
2. Build summarized health context (~2,000 tokens max):
   - Current baselines with deviation % from this week
   - This week's aggregated stats (avg, min, max per metric)
   - Most recent debrief narrative
3. Send to Claude API with system prompt + history + user message
4. Store both user message and assistant response in `chat_messages`
5. Return assistant response

Rate limit: 20 messages per user per day. Enforced via a single rate-limit service function (DB count query for MVP, swappable to Redis later).

### Prompt Spec

**Debrief system prompt must include:**
- User's name
- This week's raw daily metrics (7 days)
- Baseline values and std deviations per metric
- Previous 3 weeks aggregated (weekly averages)
- Instruction: 3–4 paragraph narrative, warm but scientific tone
- Instruction: reference user's actual numbers, compare to their baselines
- Instruction: prioritize what changed or stands out, not a summary of everything
- Instruction: end with 1–2 concrete suggestions
- Instruction: never diagnose medical conditions; recommend consulting a doctor if concerning patterns are present
- Instruction: return a JSON object with `narrative` (string) and `highlights` (array of `{label, value, delta_vs_baseline}`)

**Example `highlights` JSON the AI must return:**
```json
[
  {"label": "Avg Sleep", "value": "6.8 hrs", "delta_vs_baseline": "-8%"},
  {"label": "Avg HRV", "value": "52 ms", "delta_vs_baseline": "+12%"},
  {"label": "Avg Resting HR", "value": "61 bpm", "delta_vs_baseline": "+3%"},
  {"label": "Avg Steps", "value": "9,241", "delta_vs_baseline": "-5%"}
]
```

**Chat system prompt must include:**
- User's name
- Summarized health context (baselines, this week's stats, latest debrief)
- Instruction: answer questions about the user's health data specifically
- Instruction: never diagnose; recommend professional consultation for medical concerns
- Instruction: keep responses conversational and concise

### Seed Data Spec

`seed.py` creates 3 test users with 90 days of data each. Each user has distinct patterns. These users are inserted directly into the database for backend API testing via Swagger — they do NOT have password hashes and cannot log in via the frontend. For frontend testing, use the normal signup flow + the onboarding demo data seeder.

**User 1 (consistent):** Sleep 7–8h, HRV 55–70ms, RHR 58–64bpm, Steps 8k–12k
**User 2 (poor sleep):** Sleep 4.5–6.5h with bad stretches, HRV 35–55ms, RHR 62–72bpm, Steps 5k–9k
**User 3 (active):** Sleep 6.5–8h, HRV 60–85ms, RHR 48–58bpm, Steps 10k–18k

All 4 metric types (`sleep_hours`, `hrv`, `resting_hr`, `steps`) are generated for each user, each day. All metrics include realistic day-to-day variance and weekday/weekend patterns. Each user gets a `manual` data source entry.

---

## Frontend (Next.js)

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/route.ts  # NextAuth handler
│   │   │   └── signup/route.ts         # Custom signup: hash password (bcrypt), insert user, return session
│   │   └── [...path]/route.ts          # Catch-all proxy: forwards to FastAPI with X-User-Id + X-API-Key headers
│   ├── (app)/                  # Protected layout
│   │   ├── layout.tsx          # Nav, dark mode, disclaimer footer
│   │   ├── page.tsx            # Dashboard
│   │   ├── chat/page.tsx
│   │   ├── history/page.tsx
│   │   └── settings/page.tsx
│   ├── onboarding/page.tsx
│   ├── layout.tsx              # Root layout, NextAuth provider, theme provider
│   └── globals.css
├── components/
│   ├── debrief-card.tsx        # Narrative display + feedback widget
│   ├── sparkline-chart.tsx     # 30-day metric sparkline (Recharts)
│   ├── highlights-strip.tsx    # Key numbers with delta arrows
│   ├── chat-interface.tsx      # Message list + input
│   ├── nav.tsx                 # Sidebar/top nav with dark mode toggle
│   └── skeletons.tsx           # Loading states
├── lib/
│   ├── api.ts                  # Typed fetch wrapper for proxy routes
│   └── auth.ts                 # NextAuth config
├── next.config.js
├── tailwind.config.ts
└── package.json
```

### Screens

**Onboarding** (shown once, before `onboarded_at` is set):
- Welcome step: brief explanation of VitalView
- Timezone selection (auto-detected, user can override)
- Demo data option: seed user with sample data so app isn't empty
- Confirmation: "Your first debrief arrives Sunday" with countdown

**Dashboard** (main screen):
- This week's debrief as a typeset narrative card
- Feedback widget: thumbs up/down + optional comment
- 4 sparkline charts: sleep, HRV, steps, resting HR (30-day)
- Highlights strip: key numbers with delta arrows vs. baseline
- Empty state for new users: sample debrief + prompt to add data
- Loading skeleton while debrief generates
- Footer: "VitalView provides wellness insights, not medical advice."

**Chat:**
- Simple chat interface, non-streaming for MVP (full responses appear at once)
- Session list sidebar: new session button + past sessions
- Suggested starter questions in empty state
- Rate limit display: "X messages remaining today"

**History:**
- Scrollable list of past debriefs, newest first
- Each card: week range, highlights, expandable narrative, feedback given
- Date range filter

**Settings:**
- Timezone preference
- Email notification on/off
- Connected data sources list ("coming soon" badges for unimplemented)
- Current baseline values per metric with trend indicators
- Account management (NextAuth)

### UI Requirements
- Dark mode toggle in nav, defaults to system preference
- Mobile responsive on all screens
- Loading skeletons on every data-dependent component
- Proper empty states on every screen
- shadcn/ui components throughout for consistency

---

## 4-Week Roadmap

### Week 1 — Backend Foundation + Data Layer
- [ ] Repo setup: monorepo with `/backend` and `/frontend` directories
- [ ] `docker-compose.yml`: Postgres + FastAPI with hot-reload (frontend runs separately via `npm run dev`)
- [ ] `.env` files created per Environment Variables spec above
- [ ] SQLAlchemy models for all 11 tables with indexes (8 app tables + 3 NextAuth tables: accounts, sessions, verification_tokens)
- [ ] Alembic init + first migration (ALL tables: users with NextAuth + app columns + hashed_password, accounts, sessions, verification_tokens, data_sources, health_metrics, weekly_debriefs, chat_sessions, chat_messages, debrief_feedback, user_baselines)
- [ ] `core/config.py`: pydantic-settings loading all backend env vars
- [ ] `core/database.py`: engine, session, Base
- [ ] `core/auth.py`: dependency to extract user ID from `X-User-Id` header + verify `X-API-Key`
- [ ] Enforce auth boundary pattern: routers consume authenticated user dependency only (no direct header parsing in routers)
- [ ] `ingestion/base.py`: abstract `DataSourceAdapter` interface
- [ ] `ingestion/manual.py`: manual data adapter
- [ ] Keep signup validation/password hashing isolated in one Next.js route module as scaffolding for future auth-service migration
- [ ] `seed.py`: 90 days of data for 3 test users (see Seed Data Spec)
- [ ] `routers/metrics.py`: GET and POST endpoints
- [ ] `routers/sources.py`: GET and POST endpoints
- [ ] `routers/users.py`: GET /users/me + PATCH /users/me
- [ ] `routers/onboarding.py`: POST /onboarding/seed-demo
- [ ] `services/baseline_service.py`: rolling 30-day average + std deviation
- [ ] `routers/baselines.py`: GET /baselines
- [ ] Verify: seed data, query metrics, view baselines, update user settings all work via Swagger docs

### Week 2 — AI Layer + Notifications
- [ ] `services/ai_service.py`: Claude API wrapper, prompt construction
- [ ] `services/debrief_service.py`: full pipeline (aggregate → prompt → Claude → store)
- [ ] `routers/debriefs.py`: GET list, GET current, POST trigger, POST feedback
- [ ] `scheduler.py`: APScheduler hourly interval job — scans for users due for Sunday 9 PM debrief per their timezone
- [ ] `debrief_service` idempotency: enforce one debrief per `(user_id, week_start)` and safe status transitions for retries
- [ ] `services/notification_service.py`: Resend email integration
- [ ] `templates/debrief_email.html`: Jinja2 email template (summary + CTA link + disclaimer + unsubscribe)
- [ ] Full pipeline test: trigger → generate → email → status update
- [ ] `routers/chat.py`: sessions CRUD + POST message endpoint
- [ ] Chat service logic: summarized context (~2k tokens), DB-based rate limiting (20/day) via a replaceable rate-limit service boundary
- [ ] Verify: trigger debrief via API, receive email, chat with health-aware AI

### Week 3 — Frontend
- [ ] Next.js project init: Tailwind + shadcn/ui + dark mode + theme provider
- [ ] NextAuth config: Credentials provider (email/password), `@auth/pg-adapter`, JWT session strategy, custom `jwt`/`session` callbacks exposing `user.id`, custom `authorize()` with bcrypt verify, custom `/api/auth/signup` route with bcrypt hash, login/signup pages, protected routes
- [ ] API proxy: single catch-all route `/app/api/[...path]/route.ts` forwarding to FastAPI with `X-User-Id` + `X-API-Key` headers
- [ ] `lib/api.ts`: typed fetch wrapper
- [ ] Onboarding flow: welcome → timezone → demo data (calls `POST /onboarding/seed-demo`) → redirect to dashboard
- [ ] Dashboard: debrief card + feedback + sparklines + highlights + empty state
- [ ] Chat: session list + message interface + starters + rate limit display
- [ ] History: debrief feed + expand/collapse + date filter
- [ ] Settings: timezone, email prefs (calls `PATCH /users/me`), sources, baselines (calls `GET /baselines`), account
- [ ] Nav component with dark mode toggle
- [ ] Loading skeletons + empty states on all screens
- [ ] Mobile responsive pass
- [ ] Verify: full user flow works end-to-end against local backend

### Week 4 — Deploy + Polish
- [ ] Backend deployed to Railway (FastAPI + Postgres)
- [ ] Alembic migrations configured as Railway release command (runs before web process)
- [ ] Environment variables set in Railway per env var spec (DB URL, Claude API key, Resend key, API secret, Frontend URL)
- [ ] Frontend deployed to Vercel with env vars (NextAuth secret/URL, DB URL, Backend URL, API secret)
- [ ] Proxy configured for production URLs (BACKEND_URL points to Railway)
- [ ] End-to-end test on production: signup → onboard → demo debrief → trigger real debrief → email → chat → feedback
- [ ] Error handling: debrief generation retry on failure, API error states in UI
- [ ] README: architecture overview, local setup instructions, env var list
- [ ] Document post-MVP upgrade hooks in README (signed service auth, external scheduler/queue, streaming chat, Redis rate limits, wearable adapters)
- [ ] Stretch: Apple Health XML import adapter (proof of concept)
- [ ] Stretch: chart hover with natural language metric summaries
