import { createHandler } from './handler.ts';

Deno.serve(createHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('CLASSLENS_DEMO_PUBLISHABLE_KEY') ?? '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  cronSecret: Deno.env.get('CLEANUP_CRON_SECRET') ?? '',
}));
