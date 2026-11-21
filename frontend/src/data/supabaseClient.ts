/**
 * Browser-side Supabase Auth client helper.
 *
 * Dito naka-setup yung Supabase client para lang sa staff sign-in at pagkuha ng current JWT access token.
 * Tandaan: Hindi diretso sa Supabase tables nag-CRUD ang frontend — kinukuha lang ni `api.ts` itong token
 * para ipadala sa protected Express backend API. Check mo dito kapag may login config error o walang auth token.
 */
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Browser-safe client: uses the PUBLISHABLE key (public by design).
// RLS policies + the backend's role checks are the real protection;
// this key alone grants nothing beyond what policies allow.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Magiging null ito kapag walang VITE_SUPABASE_* env vars (ibig sabihin local practice/demo mode).
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

// Kinukuha yung current Supabase session access token para maikabit ni `api.ts` sa Authorization Bearer header ng bawat API call.
/** Current session access token for API calls (null when signed out). */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
