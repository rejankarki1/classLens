export function getDataMode(): 'mock' | 'supabase' {
  const mode = process.env.EXPO_PUBLIC_DATA_MODE ?? 'mock';

  if (mode !== 'mock' && mode !== 'supabase') {
    throw new Error('ClassLens: EXPO_PUBLIC_DATA_MODE must be mock or supabase.');
  }

  return mode;
}
