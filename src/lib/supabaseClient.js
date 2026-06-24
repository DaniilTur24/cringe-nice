import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Supabase env vars missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (see .env.example).'
  )
}

// Falls back to a syntactically valid placeholder so createClient() doesn't
// throw at import time and white-screen the app; a missing/bad config then
// surfaces as a normal request error, caught and toasted like any other.
//
// flowType: 'pkce' — the default 'implicit' flow puts the live access_token
// and refresh_token straight into the OAuth redirect URL's hash fragment
// (Onboarding's Google sign-in redirects to window.location.href, which
// also carries ?trip_id=... for invite links). Any browser that opens a
// URL containing that hash gets logged in as whoever the token belongs to
// — copying/sharing that address-bar URL leaks a live session. PKCE sends
// a one-time `code` instead, redeemable only by the browser holding the
// matching code_verifier in its own localStorage, so a leaked URL is inert
// elsewhere.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  { auth: { flowType: 'pkce' } }
)
