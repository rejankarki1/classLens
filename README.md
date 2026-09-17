# ClassLens

> Capture the lecture. Keep the knowledge.

ClassLens is an intelligent mobile notebook for college students. It turns photos of lecture slides, whiteboards, and handwritten notes into organized course material that students can review, search, ask questions about, and use to generate quizzes.

This practical MVP targets approximately 10–20 users, prioritizing fast capture, faithful extraction, and a simple student workflow.

## Core experience

```text
Sign up → Complete profile → Select courses → Capture lecture photos
        → Verify photo quality → Process and organize notes
        → Review, ask questions, and generate quizzes
```

## Current features

- Supabase email/password authentication with confirmation-aware signup
- Student onboarding with name, academic year, and major
- Per-user course enrollment with row-level security
- Global course catalog, including creating a missing course
- Course-filtered home and course views
- Live rear-camera capture with up to six photos per session
- Thumbnails, full-photo preview, removal, and session retention
- On-device sampled-pixel quality analysis with Laplacian blur detection
- Severe underexposure and overexposure detection
- Retake or Keep Anyway flow
- Typed multi-photo handoff to Processing
- Single-photo upload and AI analysis
- Structured summaries, concepts, examples, assignments, and exam mentions
- Ask This Lecture and lecture-based quiz generation
- Friend connections and CatchUp/demo lecture-copy flow
- Mock and Supabase data modes

## In active development

- Durable multi-photo processing queue and background resume
- Batch analysis across every photo in a lecture session
- Automatic course matching using enrollment, schedule, and AI signals
- Unfiled drafts when course confirmation is required
- Session notebooks with faithful per-photo extraction and combined AI notes
- Automatic CatchUp evaluation and push notifications
- Semester notebook and improved lecture search

Multi-photo capture does not yet guarantee processing after an iOS force-quit. The planned solution is a persisted queue that resumes when background execution is available or when the app reopens.

## Architecture

Screens call services and never query Supabase directly:

```text
Expo Router screens → Service layer → Mock or Supabase mode
                                      → PostgreSQL, Storage, Edge Functions
```

The camera pipeline separates immediate on-device capture, persistence, and quality checks from asynchronous upload, AI analysis, matching, retries, and notifications.

## Technology stack

- Mobile: React Native, React, TypeScript, Expo SDK 57, Expo Router
- Camera/image processing: `expo-camera`, `expo-image-manipulator`, `jpeg-js`
- Backend: Supabase Auth, PostgreSQL/RLS, Storage, Edge Functions, SQL migrations
- AI: Google Gemini via Supabase Edge Functions for analysis, Q&A, and quizzes

## Project structure

```text
classLens/
├── assets/                     App images and visual assets
├── docs/                       Product plan and engineering workflow
├── src/                       Mobile app source
│   ├── app/                    Expo Router screens and layouts
│   ├── components/             Shared UI components
│   ├── features/               Feature types, state, and focused logic
│   ├── hooks/                  Reusable hooks
│   ├── lib/                    Supabase client and analysis helpers
│   ├── services/               Data and business-logic boundary
│   └── types/                  Shared application types
├── supabase/                  Migrations and AI Edge Functions
├── AGENTS.md
├── SHARED_CONTRACTS.md
├── FRONTEND_RULES.md
├── BACKEND_RULES.md
└── app.json
```

## Getting started

```bash
git clone https://github.com/rejankarki1/classLens.git
cd classLens
npm install
cp .env.example .env.local
```

Configure `.env.local`:

```env
EXPO_PUBLIC_DATA_MODE=supabase
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Use `mock` for local demo data or `supabase` for real backend services. Never commit `.env.local`, Gemini credentials, Supabase service-role keys, or other private secrets.

Start the app:

```bash
npx expo start --clear
```

## Verification

```bash
npx tsc --noEmit
git diff --check
```

Camera capture and background/resume behavior require physical-device testing, especially on iOS.

## Product documentation

- [`docs/CLASSLENS_IMPLEMENTATION_PLAN.md`](docs/CLASSLENS_IMPLEMENTATION_PLAN.md) — authoritative product and milestone plan
- [`SHARED_CONTRACTS.md`](SHARED_CONTRACTS.md) — operational service and data contracts
- [`AGENTS.md`](AGENTS.md) — repository instructions for contributors

## License

See [`LICENSE`](LICENSE).
