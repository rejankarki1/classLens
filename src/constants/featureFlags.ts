/**
 * Recovery codes require a custom Supabase recovery template, which the pilot's
 * default SMTP provider does not support. Enable only after custom SMTP and the
 * six-digit {{ .Token }} recovery template are configured and verified.
 */
export const PASSWORD_RECOVERY_ENABLED =
  process.env.EXPO_PUBLIC_PASSWORD_RECOVERY_ENABLED === 'true';
