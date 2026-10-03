import { createHandler } from './handler.ts';

Deno.serve(createHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  publishableKey: Deno.env.get('CLASSLENS_DEMO_PUBLISHABLE_KEY') ?? '',
  geminiKey: Deno.env.get('GEMINI_API_KEY') ?? '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  revenuecatSecretKey: Deno.env.get('REVENUECAT_SECRET_KEY') ?? '',
}));
