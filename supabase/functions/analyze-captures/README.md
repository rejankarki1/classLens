# Combined capture analysis deployment

This authenticated function accepts one capture session with one to six ordered
capture UUIDs, verifies ownership through the caller's JWT and RLS, downloads all
photos, sends them to Gemini in one request, and persists one validated analysis.

Manual actions after reviewing the migration:

```sh
supabase db push
supabase functions deploy analyze-captures --project-ref <project-ref>
```

The hosted function requires `GEMINI_API_KEY`; Supabase supplies `SUPABASE_URL`
and `SUPABASE_ANON_KEY`. Do not place provider or service-role secrets in Expo.

Local focused verification:

```sh
node supabase/functions/analyze-captures/check.cjs
```
