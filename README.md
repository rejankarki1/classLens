# 📸 ClassLens

### Your camera roll shouldn't be your notebook. ClassLens turns what you capture in class into one.

**ClassLens** is an AI-powered mobile study companion that transforms photos of classroom material into organized, interactive lecture notebooks.

Built for **TXST Shipathon 2026** at **Texas State University**.

**Photo & Video × Education**

---

## 🎯 The Problem

Students take photos of everything in class:

- Whiteboards
- Lecture slides
- Handwritten notes
- Worksheets
- Examples
- Assignment instructions

But those photos usually disappear into the camera roll.

Days later, students have to figure out:

- Which class was this?
- What topic was being discussed?
- What was actually important?
- Was an assignment mentioned?
- Is this going to be on the exam?

And if you miss class entirely, getting useful notes from someone else creates another problem.

**ClassLens was built to solve both.**

---

## 💡 The Idea

### Don't organize your class material. Just capture it.

Instead of:

```text
Take Photo
    ↓
Camera Roll
    ↓
Hundreds of Other Photos
    ↓
Forgotten
```

ClassLens turns the process into:

```text
Capture
    ↓
AI Analysis
    ↓
Course + Topic Recognition
    ↓
Organized Lecture
    ↓
Study
```

The original classroom material always remains available.

**AI does not replace your notes — it builds a study layer around them.**

---

# ✨ What ClassLens Does

## 📸 Capture a Lecture

Capture or upload a photo of classroom material directly from ClassLens.

The original photo is uploaded and preserved as lecture material.

```text
Photo
  ↓
Supabase Storage
  ↓
Gemini Analysis
  ↓
Structured Lecture
```

---

## 🧠 AI Lecture Analysis

ClassLens uses **Google Gemini multimodal AI** to understand classroom material.

From a lecture photo, ClassLens can organize:

- Course
- Lecture title
- Topic
- Summary
- Key concepts
- Important points
- Assignment mentions
- Exam mentions

The result becomes a structured notebook instead of another forgotten image.

---

## 📚 Smart Course Organization

Lectures are organized inside courses so students can find their material naturally.

```text
Course
│
├── Lecture
│   ├── Original Material
│   ├── Summary
│   ├── Key Concepts
│   ├── Important Points
│   ├── Assignments
│   ├── Exam Mentions
│   ├── Ask This Lecture
│   └── Generate Quiz
│
└── Lecture
```

ClassLens can use the analyzed material to help determine where a lecture belongs.

---

## 🖼️ Keep the Original

One of the main principles behind ClassLens is simple:

> **The original material is the source of truth.**

ClassLens doesn't replace a professor's whiteboard, a slide, or the student's original notes with an AI-generated version.

The original uploaded material stays attached to the lecture.

AI-generated summaries and study tools are added **around it**.

---

# 💬 Ask This Lecture

A lecture shouldn't become static after it is saved.

ClassLens lets students ask questions about their lecture material.

For example:

```text
"What was the main idea of this lecture?"

"Explain this concept more simply."

"What are the most important things I should remember?"

"Was anything mentioned about the exam?"
```

The lecture becomes an interactive study resource rather than just a collection of notes.

---

# 📝 Generate Quiz

ClassLens can generate a multiple-choice quiz from saved lecture content.

Instead of searching for practice questions elsewhere, students can immediately test themselves on what they just learned.

```text
Lecture
   ↓
Generate Quiz
   ↓
5 Questions
   ↓
Test Understanding
```

---

# 🤝 CatchUpMate

### Missed class? Catch up from someone who didn't.

ClassLens isn't only about organizing your own material.

**CatchUpMate** helps students recover from missed lectures using notes captured by classmates.

```text
You Miss Class
      ↓
Classmate Captures Lecture
      ↓
ClassLens Organizes It
      ↓
CatchUpMate
      ↓
Review Shared Material
      ↓
+ Add to My Notes
      ↓
Continue Studying
```

Students can review:

- Who shared the lecture
- Course information
- Original classroom material
- Lecture summary
- Key concepts
- Important points

If the material is useful, the student can add the lecture to their own notes.

The student's copy is separate, so the classmate's original lecture remains unchanged.

---

## 🧑🤝🧑 CatchUpMate Demo

Our hackathon demo includes a realistic missed-class scenario.

**Prashant Bhattarai** attended a **Computer Organization** lecture covering Assembly Language concepts.

The original lecture photo was uploaded to ClassLens and analyzed.

Through CatchUpMate, another student can:

1. Discover Prashant's shared lecture
2. See the actual uploaded Assembly notes
3. Review the AI-organized lecture
4. Read key concepts and important points
5. Add the lecture to their own notes
6. Continue studying from their own copy

This demonstrates the core ClassLens idea:

> **Knowledge captured by one student can help another student catch up.**

---

# 🚀 Core Flow

```text
             CLASSROOM
                 │
                 ▼
         Capture Material
                 │
                 ▼
        Supabase Storage
                 │
                 ▼
        Gemini Multimodal
                 │
                 ▼
         LectureAnalysis
                 │
                 ▼
      Course Identification
                 │
                 ▼
        Lecture Notebook
          /           \
         ▼             ▼
  Ask Lecture     Generate Quiz
```

---

# 🏗️ Architecture

```text
┌─────────────────────────┐
│      React Native       │
│        ClassLens        │
└────────────┬────────────┘
             │
          Capture
             │
             ▼
┌─────────────────────────┐
│    Supabase Storage     │
│    Original Material    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Supabase Edge Functions │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│      Google Gemini      │
│   Multimodal Analysis   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│     LectureAnalysis     │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Supabase PostgreSQL    │
│                         │
│ Courses                 │
│ Lectures                │
│ Materials               │
│ Profiles                │
│ Friendships             │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│    Lecture Notebook     │
│                         │
│ Summary                 │
│ Concepts                │
│ Original Material       │
│ Ask                     │
│ Quiz                    │
└─────────────────────────┘
```

---

# 🧩 Lecture Analysis Contract

ClassLens keeps AI output structured using a shared TypeScript contract.

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

This allows the mobile application, database, and AI pipeline to work with predictable lecture data.

---

# 🛠️ Tech Stack

## Mobile

- **React Native**
- **Expo SDK 57**
- **Expo Router**
- **TypeScript**

## Backend

- **Supabase**
- **PostgreSQL**
- **Supabase Storage**
- **Supabase Edge Functions**
- **Supabase Authentication**

## Artificial Intelligence

- **Google Gemini**
- Multimodal image analysis
- Lecture organization
- Lecture Q&A
- Quiz generation

---

# 🗄️ Data Model

At a high level, ClassLens organizes information like this:

```text
User
│
├── Profile
│
├── Courses
│    │
│    └── Lectures
│          │
│          └── Materials
│
└── Friendships
      │
      └── Shared Lectures
```

A lecture contains the structured study information while materials preserve the original uploaded classroom content.

---

# 📱 Main Features

| Feature | Description |
|---|---|
| 📸 Lecture Capture | Capture classroom material directly from the mobile app |
| 🧠 AI Analysis | Analyze lecture photos with Gemini |
| 📚 Courses | Organize lectures by course |
| 📝 Lecture Notebook | Structured summaries, concepts and important points |
| 🖼️ Original Material | Preserve and view the original uploaded photo |
| 💬 Ask This Lecture | Ask AI questions about saved lecture content |
| 🧪 Generate Quiz | Generate study questions from a lecture |
| 🤝 CatchUpMate | Discover lecture material shared by classmates |
| ➕ Add to My Notes | Copy useful shared lectures into your own notebook |
| 👤 Profiles | Student profile and identity |
| 🔐 Authentication | Account/session support through Supabase |

---

# ⚙️ Running ClassLens Locally

## 1. Clone the repository

```bash
git clone https://github.com/rejankarki1/classLens.git
cd classLens
```

## 2. Install dependencies

```bash
npm install
```

## 3. Environment Configuration

Create:

```text
.env.local
```

Use the repository's `.env.example` as the starting template.

The mobile application requires its public Supabase configuration.

Example structure:

```env
EXPO_PUBLIC_DATA_MODE=supabase
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

### Important

Never place private credentials in the mobile environment.

Do **not** commit:

- Gemini API keys
- Supabase service-role keys
- Private API credentials
- `.env.local`

Gemini credentials used by the AI backend should be configured as **server-side Supabase Edge Function secrets**.

---

## 4. Start ClassLens

```bash
npx expo start
```

For a physical device on the same network:

```bash
npx expo start --lan
```

Then open the project using Expo Go or an appropriate development build.

---

# 🔐 Security

ClassLens was developed as a **hackathon prototype**.

Authentication, profiles, friendships, database storage, and shared lecture functionality are implemented, but portions of the current access model are designed to support the hackathon demonstration environment.

Before production deployment, the authorization and Row Level Security model should be hardened for complete per-user isolation and production-grade private sharing.

---

# 🧪 Project Verification

The final hackathon build has been checked with:

```bash
npx tsc --noEmit
npx expo export
git diff --check
```

The project successfully exports for:

- iOS
- Android
- Web

The AI analysis, lecture Q&A, and quiz pipelines also include offline validation checks.

---

# 🌱 Future Direction

ClassLens can grow beyond individual lecture organization into a complete course intelligence layer.

Future ideas include:

### 🧠 Ask an Entire Course

Ask questions across multiple lectures instead of one lecture at a time.

### 📝 Course-Level Quizzes

Generate quizzes covering several weeks or an entire exam unit.

### 🎓 AI Exam Study Guides

Combine lectures into automatically generated exam review material.

### 🔎 Lecture Search

Search across captured lectures, concepts, assignments, and original material.

### 🤝 Collaborative Class Notebooks

Allow classmates to build shared course knowledge together.

### 🧠 Smarter Course Recognition

Improve automatic matching between captured material and existing courses.

### 📄 More Material Types

Expand capture beyond photos to additional classroom formats.

### 🔒 Production-Grade Sharing

Introduce stricter permissions and private sharing controls for larger-scale deployment.

---

# 🏆 Built for TXST Shipathon 2026

**Texas State University**

ClassLens combines:

### 📸 Photo & Video
×
### 📚 Education

Our goal was to rethink something students already do every day:

**taking pictures in class.**

Instead of asking students to adopt another complicated organization system, ClassLens starts with an existing habit and makes that habit useful.

---

# 👨‍💻 Team

### Rejan Karki

Computer Science — Texas State University  
GitHub: `@rejankarki1`

### Prashant Bhattarai

Texas State University  
Email: `rna54@txstate.edu`

### Gauridhi Pun

Texas State University  
Email: `stc78@txstate.edu`

---

# 💚 ClassLens

### Capture class. Keep the knowledge.

**Don't organize your class material. Just capture it. ClassLens organizes it for you.**
