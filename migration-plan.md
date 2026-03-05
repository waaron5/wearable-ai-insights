# iOS Migration Plan — VitalView → React Native + HealthKit

## Overview

This plan converts VitalView from a Next.js web app to an iOS mobile app using React Native (via Expo). The backend (FastAPI + PostgreSQL) remains largely intact. The major changes are:

1. **Frontend:** Next.js → React Native (Expo) with iOS-native navigation, UI, and storage
2. **Auth:** NextAuth (server-side) → JWT-based auth issued directly by FastAPI
3. **Health Data:** Custom `DataSourceAdapter` with manual data → Apple HealthKit as the primary data source, read natively on-device
4. **Notifications:** Resend email → Apple Push Notifications (APNs) as primary, email as optional
5. **Proxy removal:** The Next.js API proxy layer is eliminated; the React Native app communicates directly with FastAPI

### What Stays the Same

- FastAPI backend (routers, services, models, schemas) — ~90% unchanged
- PostgreSQL schema and Alembic migrations
- AI pipeline (metrics engine → PII scrubber → Vertex AI → safety guardrails)
- Anonymous data lake architecture
- Survey system
- Chat service logic
- Debrief generation pipeline
- Docker Compose for local development

### What Gets Simplified

- **No more Next.js proxy layer** — the mobile app talks directly to FastAPI
- **No more NextAuth** — FastAPI issues JWTs itself (one auth system instead of two)
- **No more `API_SECRET_KEY` header trust** — replaced with proper signed JWT verification
- **No more 3 NextAuth DB tables** (`accounts`, `sessions`, `verification_tokens`) — can be dropped
- **No more custom data normalizer per wearable** — HealthKit already normalizes data from Apple Watch, Oura, Whoop, Garmin (if synced to Apple Health). One adapter replaces many.
- **No more server-side rendering concerns** — everything is client-rendered in React Native

---

## Architecture Changes

### Before (Web)

```
Browser
  → Next.js (SSR + API proxy + NextAuth)
    → FastAPI (trusts X-User-Id header)
      → PostgreSQL
      → Vertex AI
      → Resend (email)
```

### After (iOS)

```
React Native iOS App
  → FastAPI (validates JWT directly)
    → PostgreSQL
    → Vertex AI
    → APNs (push notifications)
    → Resend (email, optional)

React Native iOS App
  → Apple HealthKit (on-device, native bridge)
    → Syncs normalized data to FastAPI
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Expo (managed workflow)** | Faster development, OTA updates, EAS Build for CI/CD. Eject to bare workflow later if needed |
| **React Native (not SwiftUI)** | Maximize code reuse from existing TypeScript/React codebase. Business logic, API types, and component structure carry over |
| **FastAPI issues JWTs** | Eliminates the dual-auth complexity of NextAuth + API proxy. One auth system, simpler trust boundary |
| **HealthKit as primary data source** | iOS users get automatic wearable data from Apple Watch + any app that writes to HealthKit (Whoop, Oura, Garmin Connect). This replaces the need for individual wearable API adapters |
| **Keep FastAPI backend** | Proven, working backend. Only auth changes needed. All AI/data/safety logic untouched |
| **APNs for push notifications** | Native iOS push for debrief alerts. Email becomes secondary/optional |

---

## What the Developer Must Do (Non-Automatable Setup)

These are steps that require developer accounts, physical devices, or Apple portal actions that an AI agent cannot perform.

### 1. Apple Developer Account

- [ ] Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year) — required to distribute on the App Store and access HealthKit entitlements
- [ ] Set up your Apple ID in Xcode → Preferences → Accounts

### 2. Xcode & Development Environment

- [ ] Install Xcode (latest stable) from the Mac App Store
- [ ] Install Xcode Command Line Tools: `xcode-select --install`
- [ ] Install CocoaPods: `sudo gem install cocoapods` (needed for native iOS dependencies)
- [ ] Ensure you have Node.js 18+ and the Expo CLI: `npx expo --version`

### 3. Apple Developer Portal Configuration

- [ ] Create an App ID in the Apple Developer Portal with the following capabilities enabled:
  - **HealthKit** (required for reading wearable data)
  - **Push Notifications** (required for APNs debrief alerts)
  - **Sign in with Apple** (optional, but recommended for iOS apps — Apple may reject apps without it if they offer third-party login)
- [ ] Create a provisioning profile (Development + Distribution) tied to this App ID
- [ ] Generate an APNs authentication key (`.p8` file) in the Apple Developer Portal → Keys → Create a Key with "Apple Push Notifications service (APNs)" enabled. Save the Key ID, Team ID, and `.p8` file — these are needed for the backend to send push notifications

### 4. HealthKit Entitlements & Privacy

- [ ] In the Xcode project (after Expo prebuild), verify the HealthKit entitlement is present in the `.entitlements` file
- [ ] Write the required `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription` privacy strings for `Info.plist` (Expo config handles this, but review the wording — Apple rejects vague descriptions)
- [ ] HealthKit data types to request read access for:
  - `HKQuantityTypeIdentifierStepCount`
  - `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`
  - `HKQuantityTypeIdentifierRestingHeartRate`
  - `HKCategoryTypeIdentifierSleepAnalysis`
- [ ] **Test on a physical device** — HealthKit does not work in the iOS Simulator. You need an iPhone (ideally paired with an Apple Watch) for integration testing

### 5. App Store Preparation (When Ready to Ship)

- [ ] Create the app listing in [App Store Connect](https://appstoreconnect.apple.com/)
- [ ] Prepare App Store screenshots (6.7", 6.1", iPad if applicable)
- [ ] Write App Store description, keywords, privacy policy URL, support URL
- [ ] Complete the App Privacy questionnaire in App Store Connect (declare HealthKit data collection, health data usage)
- [ ] Submit for App Review — expect scrutiny on:
  - HealthKit usage justification (must demonstrate clear user benefit)
  - Medical disclaimer language (already implemented server-side)
  - Data privacy practices (HIPAA compliance documentation helps)

### 6. Expo / EAS Setup

- [ ] Create an Expo account at [expo.dev](https://expo.dev) if you don't have one
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Run `eas login` and `eas build:configure` in the project
- [ ] Link your Apple Developer account in EAS for automated code signing
- [ ] Configure EAS Build profiles (development, preview, production) in `eas.json`

### 7. Physical Device Testing

- [ ] Register your test iPhone's UDID in the Apple Developer Portal (or use EAS to manage ad-hoc provisioning)
- [ ] For HealthKit testing: wear an Apple Watch for at least a week before testing to have real data, or manually enter sample data in the iOS Health app
- [ ] Test push notifications on a physical device (simulator does not support APNs)

---

## Migration Tasks

### Phase 1: Backend Auth Migration (FastAPI Issues JWTs)

**Goal:** Replace the NextAuth + proxy trust model with FastAPI-native JWT authentication. The mobile app will authenticate directly with FastAPI.

#### Task 1.1 — Add JWT Auth to FastAPI

**Files to create/modify:**
- `backend/app/core/jwt.py` (new) — JWT creation and verification utilities
- `backend/app/core/auth.py` (modify) — add JWT-based `get_current_user` dependency alongside existing header-based auth
- `backend/app/routers/auth.py` (new) — `/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/me` endpoints
- `backend/app/core/config.py` (modify) — add `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`

**Details:**
- Use `python-jose[cryptography]` or `PyJWT` for JWT encoding/decoding
- Access tokens: short-lived (15-30 min), contain `user_id`, `email`, `exp`
- Refresh tokens: long-lived (30 days), stored in DB or as opaque tokens. Used to issue new access tokens without re-login
- `POST /auth/signup`: accepts `{email, name, password}`, hashes password with bcrypt, creates user, returns `{access_token, refresh_token, user}`
- `POST /auth/login`: accepts `{email, password}`, verifies bcrypt hash, returns `{access_token, refresh_token, user}`
- `POST /auth/refresh`: accepts `{refresh_token}`, validates, returns new `{access_token}`
- Password hashing: use `passlib[bcrypt]` (same algorithm as the current Next.js signup route)
- Add `passlib[bcrypt]` and `python-jose[cryptography]` to `requirements.txt`

**Migration note:** Keep the existing `X-User-Id` + `X-Api-Key` header auth working in parallel during migration. The `get_current_user_id` dependency should check for a JWT `Authorization: Bearer <token>` header first, then fall back to the header-based approach. This allows the web frontend (if maintained) to continue working.

#### Task 1.2 — Update `core/auth.py` Dependency

Modify the `get_current_user_id()` dependency to support both auth modes:

```python
async def get_current_user_id(request: Request) -> uuid.UUID:
    # 1. Check for Bearer token (mobile app)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        return verify_jwt_and_extract_user_id(token)
    
    # 2. Fall back to X-User-Id + X-Api-Key (legacy web proxy)
    api_key = request.headers.get("X-Api-Key")
    if api_key and secrets.compare_digest(api_key, settings.API_SECRET_KEY):
        return uuid.UUID(request.headers.get("X-User-Id"))
    
    raise HTTPException(status_code=401, detail="Not authenticated")
```

#### Task 1.3 — Add Refresh Token Table (Optional)

Add a `refresh_tokens` table to track issued refresh tokens, enabling revocation:

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| token_hash | VARCHAR | SHA-256 hash of the refresh token |
| expires_at | TIMESTAMP | |
| revoked_at | TIMESTAMP | Null until revoked |
| created_at | TIMESTAMP | |

Create an Alembic migration for this table. This also makes the NextAuth tables (`accounts`, `sessions`, `verification_tokens`) obsolete — create a migration to drop them once the web frontend is fully retired.

#### Task 1.4 — Add Apple Sign-In Support (Recommended)

Apple requires apps that offer third-party sign-in to also offer "Sign in with Apple." Add an endpoint:
- `POST /auth/apple`: accepts Apple's identity token (JWT from the iOS Sign in with Apple SDK), verifies it against Apple's public keys, extracts `email` and `sub` (Apple user ID), creates or links user account, returns `{access_token, refresh_token, user}`
- Store the Apple `sub` in a new column on users (or in a generic `oauth_accounts` table) for account linking

---

### Phase 2: HealthKit Integration (Replace Data Normalizers)

**Goal:** Use Apple HealthKit as the primary source of health data, replacing the custom `DataSourceAdapter` interface for wearable-specific adapters.

#### Why HealthKit Simplifies Everything

The current architecture planned for individual adapters per wearable (Apple Health, Whoop, Oura, Garmin, Fitbit). HealthKit eliminates this:

- **Apple Watch** writes directly to HealthKit
- **Whoop** syncs to HealthKit via the Whoop app
- **Oura** syncs to HealthKit via the Oura app
- **Garmin** syncs to HealthKit via Garmin Connect
- **Fitbit** syncs to HealthKit via third-party bridges (less reliable, but possible)

One HealthKit adapter replaces 5+ planned wearable adapters.

#### Task 2.1 — Create HealthKit Native Module

**Package:** `react-native-health` (Expo-compatible) or `expo-health` (if available)

**Implementation:**
- Request authorization for specific HealthKit data types on first app launch (after onboarding)
- Read the following data types:
  | HealthKit Type | Maps To | Normalization |
  |---------------|---------|---------------|
  | `HKCategoryTypeIdentifierSleepAnalysis` | `sleep_hours` | Sum `asleep` intervals per night, convert to hours |
  | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | `hrv` | Daily average SDNN in ms |
  | `HKQuantityTypeIdentifierRestingHeartRate` | `resting_hr` | Lowest daily reading in BPM |
  | `HKQuantityTypeIdentifierStepCount` | `steps` | Sum all step samples per day |
- Date handling: assign sleep sessions to the start date (matching current normalizer spec)
- Return normalized `{date, metric_type, value}[]` arrays

#### Task 2.2 — Build HealthKit Sync Service (Client-Side)

**New file:** `mobile/services/healthkit-sync.ts`

**Sync strategy:**
1. On app launch (foreground): query HealthKit for last 7 days of data
2. On periodic background fetch: push latest data to backend
3. On initial setup (onboarding): query HealthKit for last 90 days to build baseline
4. Track `last_synced_date` in on-device AsyncStorage
5. Deduplicate: HealthKit data is idempotently synced — the backend's `ON CONFLICT DO UPDATE` handles duplicates

**Sync flow:**
```
HealthKit (on-device)
  → healthkit-sync.ts reads + normalizes
    → POST /metrics (batch upsert to backend)
      → Backend stores in health_metrics
        → Baselines recalculated
```

#### Task 2.3 — Update Backend Data Source Handling

- Add `source_type: "apple_healthkit"` as a recognized source type
- The `POST /metrics` endpoint already handles batch upserts — no changes needed
- The `POST /onboarding/seed-demo` endpoint should check: if the user has HealthKit data, skip seeding demo data and instead sync from HealthKit. If no HealthKit data, offer demo data as before
- Update `data_sources` to auto-create an `apple_healthkit` source on first HealthKit sync

#### Task 2.4 — Background HealthKit Sync

**iOS Background Modes:**
- Enable "Background fetch" in Expo config
- Use `expo-background-fetch` to periodically sync HealthKit data to the backend
- HealthKit also supports **observer queries** — register for real-time notifications when new health data is written by any app (e.g., after a workout). Use `HKObserverQuery` via the native bridge to trigger syncs

**Frequency:** Sync at minimum once daily. More frequent syncs (every 1-4 hours) if battery allows, using iOS background fetch scheduling.

#### Task 2.5 — Remove/Archive Unused Ingestion Code

The following become unnecessary for the iOS app:
- `backend/app/services/ingestion/manual.py` — keep for testing/seeding but no longer primary
- Planned adapters for Whoop, Oura, Garmin, Fitbit API integrations — HealthKit covers all of these
- The `DataSourceAdapter` abstract interface can stay as scaffolding but is much less critical now

---

### Phase 3: React Native Frontend (Expo)

**Goal:** Rebuild the frontend in React Native, preserving all existing functionality.

#### Task 3.1 — Project Scaffolding

```bash
npx create-expo-app@latest mobile --template expo-template-blank-typescript
cd mobile
npx expo install expo-router expo-secure-store expo-font
npx expo install react-native-reanimated react-native-gesture-handler
npx expo install react-native-safe-area-context react-native-screens
npx expo install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack
```

**Project structure:**
```
mobile/
├── app/                          # Expo Router (file-based routing)
│   ├── _layout.tsx               # Root layout: auth provider, theme, fonts
│   ├── (auth)/
│   │   ├── _layout.tsx           # Auth stack layout
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── welcome.tsx           # Optional splash/welcome screen
│   ├── (app)/
│   │   ├── _layout.tsx           # Tab navigator layout
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx       # Bottom tab bar config
│   │   │   ├── index.tsx         # Dashboard (home tab)
│   │   │   ├── chat.tsx          # Chat tab
│   │   │   ├── history.tsx       # History tab
│   │   │   └── settings.tsx      # Settings tab
│   │   └── chat/
│   │       └── [sessionId].tsx   # Individual chat session
│   └── onboarding/
│       └── index.tsx             # Onboarding wizard
├── components/
│   ├── auth-provider.tsx         # Auth context + secure token storage
│   ├── debrief-card.tsx          # Debrief display (port from web)
│   ├── sparkline-chart.tsx       # Health charts (new library)
│   ├── highlights-strip.tsx      # Metric highlights (port from web)
│   ├── feedback-widget.tsx       # Thumbs up/down (port from web)
│   ├── chat-bubble.tsx           # Chat message bubble
│   ├── health-score-ring.tsx     # Circular progress for composite scores
│   └── ui/                       # Shared UI primitives
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── text.tsx
│       └── loading.tsx
├── services/
│   ├── api.ts                    # API client (port from web, change base URL + auth)
│   ├── auth.ts                   # Login/signup/refresh/token management
│   └── healthkit-sync.ts         # HealthKit read + sync
├── hooks/
│   ├── useAuth.ts
│   ├── useHealthKit.ts
│   └── useApi.ts
├── constants/
│   ├── colors.ts                 # Theme colors (port from CSS vars)
│   └── config.ts                 # API_URL, etc.
├── app.json                      # Expo config
├── eas.json                      # EAS Build config
├── package.json
└── tsconfig.json
```

#### Task 3.2 — Auth Context & Secure Storage

**Replace:** NextAuth `SessionProvider` + server-side `auth()` calls
**With:** Custom `AuthProvider` using React Context + `expo-secure-store`

```
Login/Signup → POST /auth/login or /auth/signup
  → Receive {access_token, refresh_token, user}
  → Store tokens in SecureStore (iOS Keychain-backed)
  → Set auth state in React Context
  → All subsequent API calls include Authorization: Bearer <access_token>
  → On 401: auto-refresh using refresh_token, retry request
  → On refresh failure: redirect to login
```

**Key implementation details:**
- `expo-secure-store` uses the iOS Keychain — encrypted at rest, survives app reinstall (configurable)
- Auth state persists across app launches (check SecureStore on mount)
- Token refresh happens transparently in the API client interceptor

#### Task 3.3 — API Client Migration

**Port:** `frontend/lib/api.ts` → `mobile/services/api.ts`

**Changes:**
- Base URL: `/api/` → `https://your-api.railway.app/` (or env variable `API_URL`)
- Auth: remove implicit cookie auth → add `Authorization: Bearer <token>` header
- Add token refresh interceptor (on 401, refresh and retry)
- All TypeScript interfaces (`Metric`, `Debrief`, `ChatSession`, etc.) carry over unchanged
- All API method signatures carry over unchanged (they already return typed `Promise<T>`)

This is the highest-reuse file — most of it copies directly.

#### Task 3.4 — Navigation Structure

**Replace:** Next.js App Router route groups → Expo Router / React Navigation

| Web Route | Mobile Screen | Navigator |
|-----------|---------------|-----------|
| `(auth)/login` | `(auth)/login` | Auth Stack |
| `(auth)/signup` | `(auth)/signup` | Auth Stack |
| `onboarding/` | `onboarding/` | Modal Stack |
| `(app)/dashboard` | `(tabs)/index` (Home) | Bottom Tabs |
| `(app)/chat` | `(tabs)/chat` | Bottom Tabs |
| `(app)/chat/[session]` | `chat/[sessionId]` | Stack (pushed from chat tab) |
| `(app)/history` | `(tabs)/history` | Bottom Tabs |
| `(app)/settings` | `(tabs)/settings` | Bottom Tabs |

**Navigation guards:**
- Root layout checks auth state: if no token → show auth stack; if token + not onboarded → show onboarding; else → show app tabs
- This replaces the current `middleware.ts` + server-side `auth()` redirect logic

#### Task 3.5 — UI Component Mapping

Every web component has a React Native equivalent:

| Web (shadcn/ui + Tailwind) | React Native Equivalent | Library |
|---------------------------|------------------------|---------|
| `<Button>` | Custom `<Button>` or `react-native-paper` | Built-in / Paper |
| `<Card>` | `<View>` with shadow styles | Built-in |
| `<Input>` | `<TextInput>` | Built-in |
| `<Dialog>` | `<Modal>` or `react-native-modal` | Built-in |
| `<Sheet>` (bottom drawer) | `@gorhom/bottom-sheet` | Third-party |
| `<ScrollArea>` | `<ScrollView>` / `<FlatList>` | Built-in |
| `<Select>` | `@react-native-picker/picker` or action sheet | Third-party |
| `<Switch>` | `<Switch>` | Built-in |
| `<Tabs>` | Bottom Tab Navigator | React Navigation |
| `<Skeleton>` | `react-native-skeleton-placeholder` | Third-party |
| `<Badge>` | Custom `<View>` + `<Text>` | Built-in |
| `<Separator>` | `<View style={{height: 1, backgroundColor: '#eee'}} />` | Built-in |
| `<Tooltip>` | Long-press popup or skip (less common on mobile) | — |
| Sonner toasts | `react-native-toast-message` or `burnt` (native iOS toasts) | Third-party |
| Recharts sparklines | `victory-native` or `react-native-svg` + custom | Third-party |
| `<a href="tel:...">` | `Linking.openURL("tel:...")` | Built-in |
| Dark mode (CSS vars) | `useColorScheme()` + theme context | Built-in |

#### Task 3.6 — Dashboard Screen

**Port:** `frontend/app/(app)/dashboard/_dashboard-client.tsx`

**Behavior (same):**
- Fetch current debrief, weekly summary, 30-day metrics in parallel
- Show composite scores (Recovery / Sleep / Activity)
- Highlights strip with delta arrows
- Debrief narrative card
- 30-day sparkline charts
- Empty state with "Generate My First Debrief" CTA
- Pull-to-refresh (new — native mobile pattern)

**Changes:**
- Replace `recharts` `<AreaChart>` with `victory-native` `<VictoryArea>` or `react-native-svg`-based custom sparklines
- Replace CSS grid layout with Flexbox + `<ScrollView>`
- Replace Tailwind classes with `StyleSheet.create()` or NativeWind
- Add haptic feedback on score rings (iOS)

#### Task 3.7 — Chat Screen

**Port:** `frontend/app/(app)/chat/_chat-client.tsx`

**Behavior (same):**
- Session list (sidebar on web → separate list view or bottom sheet on mobile)
- Message bubbles with role-based styling
- Send message + optimistic UI
- Emergency detection banner with hotline `tel:` links
- Rate limit display (20/day)
- Starter question suggestions

**Changes:**
- Replace `<Sheet>` session sidebar with a `<FlatList>` screen or `@gorhom/bottom-sheet`
- Use `KeyboardAvoidingView` for input area
- Use `<FlatList inverted>` for auto-scrolling message list (standard RN chat pattern)
- Replace `<textarea>` with `<TextInput multiline>`
- Emergency phone links: `Linking.openURL("tel:911")`

#### Task 3.8 — History Screen

**Port:** `frontend/app/(app)/history/_history-client.tsx`

**Behavior (same):**
- Paginated list of past debriefs
- Expandable cards (week range, highlights, narrative)
- Feedback widget per debrief

**Changes:**
- Use `<FlatList>` with `onEndReached` for infinite scroll (instead of "Load More" button)
- `Animated` API or `react-native-reanimated` for expand/collapse

#### Task 3.9 — Settings Screen

**Port:** `frontend/app/(app)/settings/_settings-client.tsx`

**Behavior (same):**
- Timezone setting
- Email notification toggle
- Data sharing consent toggle
- Connected data sources
- Baseline display

**Additions:**
- **HealthKit connection status** — show whether HealthKit access is granted, last sync time
- **HealthKit re-authorization** button if permissions were denied
- **Push notification toggle** (APNs)
- Sign out button (clears SecureStore tokens)
- App version display

#### Task 3.10 — Onboarding Wizard

**Port:** `frontend/app/onboarding/_onboarding-wizard.tsx`

**Steps (modified):**
1. **Welcome** — same, with app icon/branding
2. **HealthKit Permission** — NEW. Request HealthKit authorization. Explain what data is read and why. Handle denial gracefully (app still works with manual data)
3. **Initial HealthKit Sync** — NEW. If authorized, pull 90 days of HealthKit data and sync to backend. Show progress indicator. This replaces "seed demo data" for users with real wearable data
4. **Timezone** — auto-detected from device, confirm or override
5. **Data Sharing Consent** — same as web
6. **Health Habit Survey** — same as web (if consented)
7. **Demo Data** — only offer if HealthKit had no data or was denied. Call `POST /onboarding/seed-demo`
8. **Push Notification Permission** — NEW. Request APNs authorization
9. **Done** — "Your first debrief arrives Sunday" with countdown

#### Task 3.11 — Styling & Theming

**Approach:** Use NativeWind (Tailwind for React Native) to maximize class reuse from web, OR use `StyleSheet.create()` for full native control.

**Recommendation:** NativeWind v4, because:
- Many Tailwind class names from the web codebase carry over directly
- Dark mode support via `useColorScheme()`
- Compatible with Expo

**Color palette port:** Convert the oklch CSS variables in `globals.css` to hex/rgb values:

```typescript
// constants/colors.ts
export const colors = {
  light: {
    background: '#ffffff',
    foreground: '#0a0a0b',
    primary: '#0f766e',       // teal-700
    primaryForeground: '#f0fdfa',
    card: '#ffffff',
    border: '#e5e7eb',
    muted: '#f4f4f5',
    // ... port all CSS vars
  },
  dark: {
    background: '#09090b',
    foreground: '#fafafa',
    primary: '#2dd4bf',       // teal-400
    primaryForeground: '#042f2e',
    card: '#18181b',
    border: '#27272a',
    muted: '#27272a',
    // ... port all CSS vars
  },
};
```

---

### Phase 4: Push Notifications (Replace Email-Primary)

**Goal:** Add APNs push notifications as the primary debrief alert mechanism. Email becomes optional.

#### Task 4.1 — Add Push Token Storage to Backend

**New column on `users` table:**
- `apns_device_token VARCHAR` — the device push token
- `push_notifications_enabled BOOLEAN DEFAULT true`

Create an Alembic migration.

**New endpoint:**
- `PUT /users/me/push-token` — accepts `{device_token: string}`, stores on user record

#### Task 4.2 — Push Notification Service (Backend)

**New file:** `backend/app/services/push_service.py`

- Use `aioapns` or `httpx` to send push notifications via APNs HTTP/2 API
- Requires the `.p8` auth key file, Key ID, and Team ID (from developer setup)
- Send a push notification when a debrief is generated (in `debrief_service.py` after storing the debrief)
- Payload: `{"aps": {"alert": {"title": "Your Weekly Health Debrief", "body": "Your debrief for [week_range] is ready"}, "sound": "default", "badge": 1}}`

#### Task 4.3 — Update Debrief Pipeline

In `debrief_service.py`, after the debrief is generated and stored:
1. If `push_notifications_enabled`: send APNs push notification
2. If `email_notifications_enabled`: send email via Resend (existing behavior)
3. Both can be active simultaneously

#### Task 4.4 — Client-Side Push Registration

In the React Native app:
- Use `expo-notifications` to request push permission and get the device token
- Send the token to `PUT /users/me/push-token` after onboarding
- Handle incoming notifications: deep-link to the dashboard/debrief when tapped
- Handle token refresh: re-register on each app launch

---

### Phase 5: Backend Cleanup & Optimization

#### Task 5.1 — Remove Next.js-Specific Code

Once the web frontend is fully retired:
- Drop the NextAuth tables (`accounts`, `sessions`, `verification_tokens`) via Alembic migration
- Remove `API_SECRET_KEY` from config (no longer needed with JWT auth)
- Remove the header-based auth fallback from `core/auth.py`
- Update CORS settings in FastAPI `main.py` — now needs CORS since mobile app calls directly (not via same-origin proxy)

#### Task 5.2 — Add CORS Configuration

The web app didn't need CORS because the proxy was same-origin. The mobile app calls FastAPI directly, so add:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Mobile apps don't have origins, but keep restrictive for web
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Note:** iOS apps don't send an `Origin` header, so CORS is mainly needed if you also serve a web client. For a pure mobile backend, CORS is effectively a no-op but harmless to include.

#### Task 5.3 — Add Rate Limiting Middleware

Without the proxy layer buffering requests, consider adding rate limiting to FastAPI directly:
- Use `slowapi` or a custom middleware
- Rate limit per user (from JWT `user_id`): e.g., 100 requests/minute
- Chat rate limit already exists (20/day) — keep as-is

#### Task 5.4 — Optimize for Mobile Clients

- Add response compression (`GZipMiddleware`) for bandwidth-sensitive mobile clients
- Add `ETag`/`If-None-Match` headers for cacheable responses (baselines, survey questions)
- Consider adding a `GET /sync/status` endpoint that returns last sync timestamps for metrics, debriefs, baselines — helps the mobile app decide what to refresh

---

### Phase 6: Archive/Remove Web Frontend

#### Task 6.1 — Archive the Frontend Directory

- Move `frontend/` to `frontend-web-archive/` or delete it
- Remove `frontend` Dockerfile references from `docker-compose.yml` (if any)
- Update the project root README to reference the mobile app
- The `package.json`, Next.js config, and all `app/`, `components/`, `lib/` directories under `frontend/` are no longer needed

#### Task 6.2 — Update Docker Compose

Remove any frontend services. Keep only:
- PostgreSQL
- FastAPI backend (for local development)

The mobile app runs via `npx expo start` on the developer's machine, connecting to `http://localhost:8000`.

#### Task 6.3 — Update Project Structure

**New project structure:**
```
/
├── backend/              # FastAPI (unchanged structure)
├── mobile/               # React Native (Expo) iOS app
├── docker-compose.yml    # Postgres + FastAPI only
├── plan.md               # Original plan
├── migration-plan.md     # This document
└── README.md
```

---

## Migration Sequence & Dependencies

```
Phase 1 (Backend Auth)           ← Do first, enables all other phases
  ↓
Phase 2 (HealthKit)              ← Can start in parallel with Phase 3
  ↓                                (HealthKit is a service, not UI)
Phase 3 (React Native Frontend)  ← Largest phase, most work
  ↓
Phase 4 (Push Notifications)     ← Depends on Phase 3 (needs mobile app)
  ↓
Phase 5 (Backend Cleanup)        ← Do after mobile app is working
  ↓
Phase 6 (Archive Web)            ← Final cleanup
```

**Critical path:** Phase 1 → Phase 3 → Phase 4 → ship
**Parallel path:** Phase 2 can happen alongside Phase 3

---

## Detailed Task Checklist

### Phase 1: Backend Auth Migration
- [ ] Add `python-jose[cryptography]` and `passlib[bcrypt]` to `requirements.txt`
- [ ] Create `backend/app/core/jwt.py` with `create_access_token()`, `create_refresh_token()`, `verify_token()` functions
- [ ] Add JWT config to `backend/app/core/config.py` (`JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`)
- [ ] Create `backend/app/routers/auth.py` with `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`
- [ ] Add password hashing utility (bcrypt via passlib) in auth router or a shared utility
- [ ] Update `backend/app/core/auth.py` — dual-mode: JWT Bearer token (primary) + X-User-Id header (fallback)
- [ ] Create Alembic migration for `refresh_tokens` table
- [ ] Register auth router in `backend/app/main.py`
- [ ] Test: signup → receive tokens → use access token for API calls → refresh token → verify protected endpoints reject invalid tokens
- [ ] Add `POST /auth/apple` endpoint for Sign in with Apple (verify Apple identity token, create/link user)

### Phase 2: HealthKit Integration
- [ ] Install `react-native-health` or equivalent Expo-compatible HealthKit package
- [ ] Configure HealthKit entitlements in `app.json` / `app.config.ts`
- [ ] Create `mobile/services/healthkit.ts` — HealthKit authorization + data reading for 4 metric types
- [ ] Create `mobile/services/healthkit-sync.ts` — normalize HealthKit data → `POST /metrics` batch sync
- [ ] Add `source_type: "apple_healthkit"` to backend validation (if source_type is validated)
- [ ] Create `mobile/hooks/useHealthKit.ts` — React hook for HealthKit status and sync triggers
- [ ] Implement background sync via `expo-background-fetch`
- [ ] Implement HealthKit observer queries for real-time sync (when new data is written)
- [ ] Store `last_synced_date` in AsyncStorage
- [ ] Test on physical device with Apple Watch data

### Phase 3: React Native Frontend
- [ ] Initialize Expo project with TypeScript template
- [ ] Install core dependencies: expo-router, expo-secure-store, react-native-reanimated, react-native-gesture-handler, react-native-safe-area-context, react-native-screens
- [ ] Install UI dependencies: @gorhom/bottom-sheet, react-native-toast-message, victory-native, @react-native-picker/picker
- [ ] Install NativeWind (Tailwind for RN) + nativewind config
- [ ] Create auth context + SecureStore token management (`mobile/components/auth-provider.tsx`)
- [ ] Port API client: `frontend/lib/api.ts` → `mobile/services/api.ts` (change base URL, add Bearer token, add refresh interceptor)
- [ ] Port TypeScript interfaces (these are identical — copy from `api.ts`)
- [ ] Create root layout with auth/theme providers (`mobile/app/_layout.tsx`)
- [ ] Create auth stack: login + signup screens
- [ ] Create tab navigator: Dashboard, Chat, History, Settings
- [ ] Create color constants from CSS vars (`mobile/constants/colors.ts`)
- [ ] Port Dashboard screen (debrief card, highlights strip, sparkline charts, empty state)
- [ ] Port Chat screen (session list, message bubbles, input, emergency banner)
- [ ] Port History screen (debrief list, expandable cards, feedback)
- [ ] Port Settings screen (timezone, email, consent, sources, baselines)
- [ ] Modify and port Onboarding wizard (add HealthKit + push notification steps)
- [ ] Port component: debrief-card (narrative display + feedback)
- [ ] Port component: highlights-strip (delta arrows, color coding)
- [ ] Port component: feedback-widget (rating + comment)
- [ ] Create component: health-score-ring (circular progress — new, native-feeling)
- [ ] Create component: chat-bubble (message display)
- [ ] Create sparkline chart component using victory-native
- [ ] Add pull-to-refresh on Dashboard and History
- [ ] Add haptic feedback on interactions (expo-haptics)
- [ ] Implement dark mode via useColorScheme + theme context
- [ ] Test full flow: signup → onboard → HealthKit sync → dashboard → chat → history → settings

### Phase 4: Push Notifications
- [ ] Install `expo-notifications`
- [ ] Add Alembic migration for `apns_device_token` and `push_notifications_enabled` columns on `users`
- [ ] Add `PUT /users/me/push-token` endpoint
- [ ] Create `backend/app/services/push_service.py` using APNs HTTP/2 API
- [ ] Update `debrief_service.py` to send push notification after debrief generation
- [ ] Add push token registration in mobile app (after onboarding)
- [ ] Handle notification tap → deep link to debrief
- [ ] Add push notification toggle in Settings
- [ ] Test on physical device

### Phase 5: Backend Cleanup
- [ ] Add CORS middleware to FastAPI `main.py`
- [ ] Add GZip compression middleware
- [ ] Add rate limiting middleware (slowapi or custom)
- [ ] Create Alembic migration to drop NextAuth tables (accounts, sessions, verification_tokens)
- [ ] Remove `API_SECRET_KEY` from config and header-based auth from `core/auth.py`
- [ ] Add `GET /sync/status` endpoint for mobile client sync optimization
- [ ] Update requirements.txt with new dependencies, remove unused ones

### Phase 6: Archive Web Frontend
- [ ] Move `frontend/` to archive or delete
- [ ] Update `docker-compose.yml` to remove frontend service (if any)
- [ ] Update root README.md with new architecture, setup instructions, mobile development workflow
- [ ] Update project structure documentation

---

## Dependency Map (New & Modified Packages)

### Backend (additions to `requirements.txt`)
```
python-jose[cryptography]    # JWT encoding/decoding
passlib[bcrypt]              # Password hashing (replaces Next.js bcrypt)
aioapns                      # Apple Push Notification service client
```

### Mobile (new `package.json`)
```
expo                         # Expo framework
expo-router                  # File-based routing
expo-secure-store            # iOS Keychain token storage
expo-notifications           # Push notifications
expo-background-fetch        # Background HealthKit sync
expo-haptics                 # Haptic feedback
expo-font                    # Custom fonts
expo-linking                 # Deep linking
react-native-health          # HealthKit bridge
@react-navigation/native     # Navigation
@react-navigation/bottom-tabs
@react-navigation/native-stack
react-native-reanimated      # Animations
react-native-gesture-handler # Gestures
react-native-safe-area-context
react-native-screens
@gorhom/bottom-sheet         # Bottom sheet (replaces shadcn Sheet)
react-native-toast-message   # Toast notifications (replaces Sonner)
victory-native               # Charts (replaces Recharts)
react-native-svg             # SVG support for charts
nativewind                   # Tailwind CSS for React Native
@react-native-picker/picker  # Dropdown select
react-native-skeleton-placeholder  # Loading skeletons
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| HealthKit permission denied by user | Medium | High — no data to analyze | Fall back to demo data; allow manual metric entry; clearly explain value proposition during permission request |
| App Store rejection (HealthKit) | Medium | High — blocks launch | Follow Apple's HealthKit guidelines exactly; demonstrate clear user benefit; include proper privacy policy |
| Background sync reliability | Medium | Medium — stale data | Use HealthKit observer queries + foreground sync on app open; show "last synced X hours ago" in UI |
| JWT token security | Low | High — auth bypass | Use short expiry (15 min), refresh tokens, HTTPS-only, SecureStore (Keychain) |
| React Native performance (charts) | Low | Medium — janky UI | Use `victory-native` with `react-native-reanimated` for native-thread animations; limit chart data points |
| Expo managed workflow limitations | Low | Medium — need native modules | `react-native-health` works with Expo (dev client); if blocked, eject to bare workflow |
| Push notification delivery | Low | Low — email fallback exists | Keep email as secondary notification channel; monitor APNs delivery receipts |

---

## Timeline Estimate

| Phase | Estimated Duration | Parallelizable? |
|-------|-------------------|-----------------|
| Phase 1: Backend Auth | 3-4 days | No (blocks all else) |
| Phase 2: HealthKit | 4-5 days | Yes (parallel with Phase 3) |
| Phase 3: React Native Frontend | 10-14 days | Contains the most work |
| Phase 4: Push Notifications | 2-3 days | After Phase 3 |
| Phase 5: Backend Cleanup | 1-2 days | After Phase 3 |
| Phase 6: Archive Web | 0.5 day | After Phase 5 |
| **Total** | **~3-4 weeks** | |

This estimate assumes a single developer working full-time. The bulk of the work is Phase 3 (porting all screens and components to React Native).

---

## HIPAA Considerations for iOS

The migration maintains all existing HIPAA controls and adds iOS-specific considerations:

| Control | Web Implementation | iOS Implementation |
|---------|-------------------|-------------------|
| Encryption at rest (tokens) | Browser cookies (httpOnly, secure) | `expo-secure-store` (iOS Keychain, hardware-encrypted) — **stronger** |
| Encryption in transit | HTTPS (same) | HTTPS (same) + App Transport Security enforced by iOS |
| Data on device | None (web app, no local storage of PHI) | HealthKit data stays in HealthKit (Apple manages encryption). Synced metrics go to backend only — **no PHI cached on device** in the app's storage |
| PII in AI calls | Scrubbed server-side (same) | Scrubbed server-side (same) — no change |
| Audit logging | Same | Same |
| BAA with HealthKit | N/A | Not needed — HealthKit data is read-only on-device and sent to your own backend. Apple is not a business associate for HealthKit reads |
| BAA with APNs | N/A | Push notification content should NOT contain PHI. Use generic alerts ("Your debrief is ready") not health data in the push payload |

**Key rule for push notifications:** Never include health metrics, scores, or narrative content in the push notification payload. APNs payloads traverse Apple's servers and are not covered under a BAA. Use generic text only:
- **Good:** "Your weekly health debrief is ready. Tap to read."
- **Bad:** "Your sleep dropped 15% this week. Recovery score: 58."
