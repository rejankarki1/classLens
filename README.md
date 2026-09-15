# ClassLens 📸📚

> **Your camera roll shouldn't be your notebook. ClassLens turns what you capture in class into one.**

ClassLens is an AI-powered mobile study companion built for **TXST Shipathon 2026** at Texas State University. It turns photos of classroom materials into organized lecture notebooks, with study tools grounded in the saved notes and original photos.

**Capture class. Keep the knowledge.**

## The Problem

Students take photos of whiteboards, slides, worksheets, and handwritten notes throughout class. Those photos get buried in camera rolls, separated from their course, topic, and context. Finding a picture later is only the first step—students still need to work out what matters and how to study it.

ClassLens brings capture, organization, and studying into one flow.

## How It Works

```text
Capture classroom material
    ↓
Upload the original photo
    ↓
Gemini multimodal analysis
    ↓
Recognize course and topic
    ↓
Create an organized lecture notebook
    ↓
View the preserved original material
    ↓
Ask This Lecture · Generate Quiz
```

**ClassLens does not replace or rewrite the student's original material.** The original uploaded photo remains attached to the lecture as the source of truth. AI adds organization and study tools around it.

Course suggestions are matched against saved courses. When a suggestion cannot be resolved, students choose a course or confirm creation of a new one. AI does not silently create courses.

## ✨ Implemented Features

### 📸 Photo Lecture Capture

Take a photo or choose one from the device's photo library. ClassLens uploads the original to **Supabase Storage** and sends it through the analysis pipeline. The current capture flow supports photos.

### 🧠 Gemini Lecture Analysis

Gemini multimodal analysis produces:

- Suggested course and lecture topic
- Lecture title and AI summary
- Key concepts and important points
- Assignment mentions
- Exam mentions

### 📚 Courses and Lecture Notebooks

Browse courses and their saved lectures. Automatic course/topic organization turns captured material into structured notebooks, with original material viewing alongside the organized study information.

### 💬 Ask This Lecture

Ask questions about a saved lecture, such as:

- “What was the main idea of this lecture?”
- “Explain this concept more simply.”
- “Was anything mentioned about the exam?”

Answers are grounded in the saved lecture fields and original photos. The assistant is instructed to say when information is absent from the lecture.

### 📝 Generate Quiz

Generate five multiple-choice questions from a saved lecture, with four options per question, answer feedback, explanations, and a final score. Retake the generated quiz to review the material.

### 👤 Authentication and Profiles

Sign up or sign in with Supabase Authentication, complete an academic profile, and find classmates by profile name. Friendship requests support the classmate-sharing experience.

## 🤝 CatchUpMate

Missing class shouldn't mean missing the lecture.

A student who misses class can review a classmate's captured lecture, see the original material and AI-organized notes, and select **Add to My Notes** to copy the lecture into their own notebook.

The copy retains the source course, saved study information, and copied photo materials. **The classmate's original lecture and photo remain unchanged.**

```text
Miss class
    ↓
Review a classmate's shared lecture
    ↓
View the original photo and organized notes
    ↓
Add to My Notes
    ↓
Continue studying in your own notebook
```

### Prashant's Assembly Demo

The hackathon demo features **Prashant Bhattarai** sharing real **Assembly / Computer Organization** lecture notes through CatchUpMate. It includes the real uploaded photo, course information, saved analysis, key concepts, important points, and Add to My Notes.

The original demo photo is retained at [`assets/demo/prashant-assembly-notes.jpeg`](assets/demo/prashant-assembly-notes.jpeg). The hosted demo also requires its uploaded Storage object and material record; running the SQL seed alone does not upload the photo.

## 🏗️ Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React Native, Expo SDK 57, Expo Router, TypeScript |
| Backend | Supabase, PostgreSQL, Supabase Storage, Supabase Edge Functions, Supabase Authentication |
| AI | Google Gemini multimodal analysis, lecture Q&A, quiz generation |

## Architecture

```text
React Native
    ↓
Capture
    ↓
Supabase Storage
    ↓
Edge Function
    ↓
Gemini
    ↓
LectureAnalysis
    ↓
PostgreSQL
    ↓
Lecture Notebook
```

The mobile app calls async services for uploads, analysis, and persistence. Edge Functions handle Gemini requests. After analysis and course resolution, the app saves the lecture and attaches its original material. Ask This Lecture and Generate Quiz use saved lecture context on demand.

### Lecture Analysis Contract

```ts
type LectureAnalysis = {
  suggestedCourse: string | null;
  title: string;
  topic: string;
  summary: string;
  keyConcepts: string[];
  importantPoints: string[];
  assignments: string[];
  examMentions: string[];
};
```

This contract is validated at both the server and mobile service boundaries.

## 🚀 Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/rejankarki1/classLens.git
cd classLens
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the mobile environment

Create `.env.local` from the supplied template:

```bash
cp .env.example .env.local
```

Set the data mode to `supabase` and fill in your project's public configuration:

```dotenv
EXPO_PUBLIC_DATA_MODE=supabase
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

The template defaults to mock data; the current authentication, capture, and AI flows require Supabase mode. Restart Expo after changing environment variables.

Use a Supabase project configured with the repository's migrations, Storage bucket, and deployed `analyze-material`, `ask-lecture`, and `generate-quiz` Edge Functions. Creating `.env.local` does not provision the backend.

**Server-side AI secrets belong in Supabase Edge Function secrets.** Configure `GEMINI_API_KEY` and `CLASSLENS_DEMO_PUBLISHABLE_KEY` there; the latter must match the mobile app's public publishable key. The hosted runtime supplies `SUPABASE_URL`.

Never put Gemini keys or Supabase private/service-role credentials in the mobile app, README, or Git history.

Function setup and deployment details:

- [Photo analysis](supabase/functions/analyze-material/README.md)
- [Ask This Lecture](supabase/functions/ask-lecture/README.md)
- [Generate Quiz](supabase/functions/generate-quiz/README.md)

### 4. Start Expo

```bash
npx expo start
```

For a device on the same local network:

```bash
npx expo start --lan
```

Open the project in an Expo Go version compatible with SDK 57 or an appropriate development build. Sign in or create an account, then complete your profile.

### Verification

```bash
npx tsc --noEmit
npx expo export
```

Offline AI checks run without cloud requests:

```bash
node supabase/functions/analyze-material/check.cjs
node supabase/functions/ask-lecture/check.cjs
node supabase/functions/generate-quiz/check.cjs
```

## 🔐 Hackathon Prototype

ClassLens is designed for a shared, non-sensitive classroom demo. Authentication and friendships are implemented, while some database access policies and AI endpoints deliberately retain shared-demo access. Production use will require stricter per-user permissions, AI authorization, and quota controls.

## 🔮 Future Direction

- Course-level AI Q&A
- Course-level quizzes
- Exam study guides across multiple lectures
- Lecture search
- Collaborative notebooks
- Smarter course recognition
- More classroom material formats
- Production-grade permissions

## 🏆 Built For

**TXST Shipathon 2026** — Texas State University

**📸 Photo & Video × 📚 Education**

## 👨‍💻 Team

**Rejan Karki**<br>
Computer Science — Texas State University<br>
GitHub: @rejankarki1

**Prashant Bhattarai**<br>
Texas State University<br>
Email: rna54@txstate.edu

**Gauridhi Pun**<br>
Texas State University<br>
Email: stc78@txstate.edu

---

## ClassLens

**Capture class. Keep the knowledge.**
