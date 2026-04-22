import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL     = 'https://mveurfdckrdfmxgdvjdw.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9S4_dvEERlG26_tVuoleYw_yZ3wfwXi';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
