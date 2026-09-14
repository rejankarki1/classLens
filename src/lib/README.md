# Backend integrations (later)

Backend owners add the Supabase client and shared backend configuration here.
No credentials, SDK setup, database, storage, or AI calls are required today.

Keep mobile-facing contracts in `src/services/` and shared type imports in
`src/types/`. Service implementations can later call Supabase without changing
screen imports. Gemini credentials belong in server-side Edge Function secrets,
never in the mobile app.

Initialize `supabase/` with the CLI when backend work starts, then add migrations
and the analyze-material, ask-lecture, and generate-quiz functions. Empty folders
are intentionally omitted until then.
