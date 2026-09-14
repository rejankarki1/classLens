import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl) {
  throw new Error(
    'ClassLens: EXPO_PUBLIC_SUPABASE_URL is missing or empty. Set it in .env.local and reload Expo.',
  );
}

if (!supabasePublishableKey) {
  throw new Error(
    'ClassLens: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing or empty. Set it in .env.local and reload Expo.',
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
