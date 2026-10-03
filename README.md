<p align="center">
  <img src="assets/images/classlens-icon.png" width="120" alt="ClassLens icon" />
</p>

<h1 align="center">ClassLens</h1>

<p align="center">
  <strong>Capture the lecture. Keep the knowledge.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo_SDK-57-000020?logo=expo" alt="Expo SDK 57" />
  <img src="https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react" alt="React Native" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/Gemini-AI-4285F4?logo=google" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/RevenueCat-Subscriptions-F5A623?logo=revenuecat" alt="RevenueCat" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License" />
</p>

---

ClassLens is an intelligent mobile notebook for college students. It turns photos of lecture slides, whiteboards, and handwritten notes into organized course material that students can review, search, ask questions about, and use to generate quizzes.

Designed for a focused community of college students, ClassLens emphasizes **fast capture**, **faithful note extraction**, and a **simple end-to-end study workflow**.

## ✨ Core Experience

```
Sign up → Complete profile → Select courses → Capture lecture photos
→ Verify photo quality → Process & organize notes → Review, ask questions, and quiz
```

## 📋 Features

### 🔐 Authentication & Onboarding
- Email/password authentication with Supabase Auth
- Email-confirmation-aware signup flow
- Student profile onboarding — name, academic year, and major
- Per-user course enrollment with row-level security
- Global course catalog with support for creating missing courses

### 📸 Capture
- Live rear-camera experience using Expo Camera
- Rapid capture of up to **six photos per session**
- Thumbnail strip with full-photo preview, removal, and session retention
- On-device photo-quality analysis using real sampled pixels:
  - Laplacian-variance blur detection
  - Severe underexposure / overexposure detection
- **Retake** or **Keep Anyway** flow for low-quality shots
- Typed multi-photo capture-session handoff to processing

### ⚙️ Processing
- Durable multi-photo processing queue with safe retry and resume
- Background upload and processing using `expo-background-task`
- Batch AI analysis across every photo in a lecture session
- Automatic course filing using Gemini-based course matching against the
  student's enrolled courses
- Course-confirmation drafts when a confident match is unavailable
- **Inbox** to confirm, change, or discard a filed lecture

### 📓 Notebook
- Per-photo **faithful extraction** alongside combined **AI-organized notes**
- Lecture summaries, key concepts, examples, assignments, and exam mentions
- Home and course views filtered to the signed-in student's courses
- Semester notebook and lecture search

### 🧠 AI-Powered Study Tools
- **Ask This Lecture** — grounded Q&A over lecture content and original photos
- **Generate Quiz** — auto-generated quizzes from lecture material, limited to
  3 quizzes per rolling 7 days on the free tier (unlimited for Pro)

### 🤝 Social & CatchUp
- Friend connections with search, request, and accept flow
- **CatchUp** — find, request, and accept friends' shared lectures, view them,
  and copy any shared lecture into your own notebook
- **Add to My Notes** — independent, persistent notebook copies of shared notes
- CatchUp push notifications

### 💳 Account & Subscription
- Profile editing (name, academic year, major)
- Account deletion — permanently removes your data, Storage files, and login
- **ClassLens Pro** subscription via RevenueCat, unlocking unlimited quizzes

### 🛠 Developer Experience
- **Mock** and **Supabase** data modes for development
- Strict TypeScript throughout
- Clean service-layer abstraction (screens never call Supabase directly)

## 🏗 Architecture

ClassLens keeps screen components cleanly separated from data access:

```
Expo Router screens
        ↓
  Service layer
        ↓
Mock mode  ·or·  Supabase mode
                      ↓
         PostgreSQL · Storage · Edge Functions
```

The camera pipeline operates in two layers:

| Layer | Responsibility |
|-------|---------------|
| **On-device** | Capture, local persistence, blur/exposure checks, Retake/Keep Anyway |
| **Async processing** | Upload, AI analysis, course matching, notebook creation, retries, notifications |

## 🧰 Backend

Processing runs as a durable job queue, not a request/response call, so a
dropped connection or a killed app never loses a capture session:

- **`processing_jobs` queue** — one owner-scoped row per capture session, moving
  through `queued → uploading → analyzing → course_needed → filing → completed`
  (or `retryable_failed` / `terminal_failed`). A database trigger enforces valid
  stage transitions, so no client or worker can skip or corrupt a job's state.
- **`process-job` Edge Function** — claims a job either by `jobId` (authenticated
  foreground resume) or via the recovery worker, runs Gemini analysis (reusing a
  saved analysis instead of re-calling Gemini when one already exists), matches
  the result to a course, and idempotently files it into the student's `lectures`.
- **pg_cron recovery worker** — periodically re-claims stuck jobs so processing
  completes even if the app was closed mid-upload, with overload backoff on
  `GEMINI_ALL_BUSY` that waits and retries without burning the job's retry cap.
- **Free Gemini model chain with fallback** — tries
  `gemini-3.1-flash-lite → gemma-4-26b-a4b-it → gemini-3.5-flash-lite →
  gemini-3-flash-preview` in order, each attempt bounded by its own timeout, so a
  single overloaded or slow model doesn't stall a job.
- **Gemini-based course matching** — the model proposes a best-match course
  directly from the student's enrolled courses; filing only happens automatically
  above a confidence threshold, otherwise the job waits in `course_needed` for the
  student to confirm.
- **Server-side quiz quota** — `reserve_quiz_use` enforces 3 quizzes per rolling
  7 days for free users (Pro users bypass via a RevenueCat entitlement check),
  using an advisory lock plus a reservation/completion step so concurrent or
  retried requests can't double-count or race past the limit.
- **Account deletion** — a dedicated Edge Function that deletes a user's rows,
  their Storage files, and their Supabase Auth user.
- **Discard capture RPC** and **push token reassignment RPC** — `discard_processing_job`
  cleanly tears down an abandoned capture (job, captures, inbox events) and
  returns its storage paths for cleanup; `register_device_push_token` reassigns a
  push token to the currently signed-in device/user.
- **Row Level Security** on every user-data table — profile and lecture reads/writes
  are scoped to the authenticated user (and their accepted friends, for CatchUp).

## 🛠 Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Mobile** | React Native · Expo SDK 57 · Expo Router · TypeScript · React |
| **Camera & Image** | `expo-camera` · `expo-image-manipulator` · `jpeg-js` · Laplacian-variance & luminance analysis |
| **Background** | `expo-background-task` · `expo-notifications` |
| **Backend** | Supabase Auth · Supabase PostgreSQL · Supabase Storage · Supabase Edge Functions · pg_cron |
| **Security** | PostgreSQL Row Level Security (RLS) · SQL migrations |
| **AI** | Google Gemini via Edge Functions — course matching, structured analysis, grounded Q&A, quiz generation |
| **Payments** | RevenueCat (`react-native-purchases`, `react-native-purchases-ui`) — Pro entitlement and paywall |
| **Dev Tools** | npm · TypeScript strict mode · Expo CLI · Git & GitHub |

## 📁 Project Structure

```
classLens/
├── assets/                         App icons, splash screen, tab icons
├── docs/                           Product plan and engineering workflow
├── src/
│   ├── app/                        Expo Router screens and layouts
│   ├── components/                 Shared UI components
│   ├── constants/                  Theme tokens and shared constants
│   ├── features/                   Feature-scoped types, state, and logic
│   ├── hooks/                      Reusable React hooks
│   ├── lib/                        Supabase client and shared parsing/helpers
│   ├── services/                   Data and business-logic boundary
│   └── types/                      Shared application types
├── supabase/
│   ├── functions/                  Edge Functions
│   │   ├── process-job/            Durable job worker: Gemini analysis, course matching, filing
│   │   ├── analyze-captures/       Multi-photo capture session analysis
│   │   ├── ask-lecture/            Grounded lecture Q&A
│   │   ├── generate-quiz/         Quiz generation + server-side quota
│   │   ├── cleanup-originals/      Scheduled cleanup of eligible original photos
│   │   ├── delete-account/        Account + data + Storage deletion
│   │   └── _shared/                Shared Edge Function helpers
│   ├── migrations/                 Database schema and RLS history
│   └── seed.sql                    Development and demo seed data
├── AGENTS.md                       Repository instructions for coding agents
├── SHARED_CONTRACTS.md             Operational service and data contracts
├── app.json                        Expo configuration
├── package.json                    Dependencies and scripts
└── tsconfig.json                   TypeScript configuration
```

## 🚀 Getting Started

### Prerequisites

| Requirement | Notes |
|------------|-------|
| **Node.js** and **npm** | LTS recommended |
| **A dev build** | Native modules (RevenueCat, background tasks) require a custom dev build — Expo Go is not supported |
| **Xcode / Android Studio** | For building and running the dev build on a device or simulator |
| **Supabase project** | Required for Supabase mode |
| **Gemini credentials** | Configured as Supabase Edge Function secrets |
| **RevenueCat project** | Required for Pro subscription/paywall testing |

### Installation

```bash
git clone https://github.com/rejankarki1/classLens.git
cd classLens
npm install
```

### Environment Setup

Copy the environment template and fill in your values:

```bash
cp .env.example .env.local
```

```env
# Choose mock or supabase. Missing DATA_MODE defaults to mock.
EXPO_PUBLIC_DATA_MODE=supabase
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
# Debug iOS builds only — a RevenueCat Test Store key crashes release/TestFlight builds.
EXPO_PUBLIC_REVENUECAT_IOS_KEY=your_revenuecat_debug_ios_key
```

> **⚠️ Do not commit `.env.local` or any secret keys.**

Edge Functions read their own secrets from Supabase, set by name (never in this
repo or `.env.local`): `GEMINI_API_KEY`, `CLASSLENS_DEMO_PUBLISHABLE_KEY`,
`WORKER_CRON_SECRET`, `CLEANUP_CRON_SECRET`, `REVENUECAT_SECRET_KEY`.

### Production email authentication

The pilot project intentionally keeps Supabase email autoconfirm enabled because
the built-in SMTP service is rate-limited and should not gate judge access. The
app still preserves the pending “Check your email” state and supports resending
confirmation mail for environments where confirmation is enabled.

Before production, configure a custom SMTP provider, verify confirmation and
password-recovery delivery, then disable email autoconfirm in Supabase. The Reset
Password template must include `{{ .Token }}` so the app can verify its six-digit
recovery code without mobile deep links.

Password recovery is hidden in the pilot build because the default Supabase SMTP
provider does not allow that custom template. After custom SMTP is configured,
set the email OTP length to six, install and verify the token template, and build
with `EXPO_PUBLIC_PASSWORD_RECOVERY_ENABLED=true` to show “Forgot password?”.

### Run the App

ClassLens uses native modules that Expo Go cannot load, so it runs as a dev build:

```bash
npx expo run:ios --device
```

(or `npx expo run:android --device` for Android). This builds and installs a dev
build on the connected device, then starts Metro.

### Type Check

```bash
npx tsc --noEmit
```

## 🔄 Data Modes

ClassLens supports two development modes, controlled by `EXPO_PUBLIC_DATA_MODE` in `.env.local`:

| Mode | Description |
|------|-------------|
| `mock` | Local demo data — no Supabase connection required |
| `supabase` | Real authentication, database, storage, and Edge Functions |

## 🔒 Database & Security

- Schema changes are tracked in `supabase/migrations/`
- User-owned data is protected with **PostgreSQL Row Level Security** policies
- Course memberships are isolated by authenticated user
- The course catalog is shared; each student's enrollment is private
- Screens use the service layer — **no direct Supabase queries**
- Secrets belong in Supabase function secrets or local ignored environment files, **never in source control**

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [`CLASSLENS_IMPLEMENTATION_PLAN.md`](docs/CLASSLENS_IMPLEMENTATION_PLAN.md) | Authoritative product architecture and milestones |
| [`SHARED_CONTRACTS.md`](SHARED_CONTRACTS.md) | Operational data and service contracts |
| [`AGENTS.md`](AGENTS.md) | Repository rules for coding agents |

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
