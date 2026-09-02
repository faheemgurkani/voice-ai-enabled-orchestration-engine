// Supabase client — staff/dashboard identity only.
//
// Witnesses never authenticate: their reference code is the credential, and
// nothing on the demo or ref-code lookup path touches this client.
//
// Only the publishable key belongs here. Anything VITE_-prefixed is compiled
// into the browser bundle, so the secret key must never appear in this file.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

/** False when the deployment has no Supabase project wired up yet. */
export const authConfigured = Boolean(url && publishableKey);

// Null rather than a broken client, so an unconfigured deployment degrades to
// "auth unavailable" instead of throwing during module evaluation.
export const supabase: SupabaseClient | null = authConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Current access token, refreshed by supabase-js when close to expiry.
 * Returns null for anonymous visitors — callers must treat that as "no header".
 */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
