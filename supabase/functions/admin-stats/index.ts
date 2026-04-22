/**
 * Edge Function: admin-stats
 * Returns aggregated analytics data for the admin dashboard.
 * Protected by ADMIN_SECRET header — never expose this key in client code.
 *
 * Required secrets:
 *   ADMIN_SECRET — any random string, set via: supabase secrets set ADMIN_SECRET=<value>
 *
 * Deploy: supabase functions deploy admin-stats --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
};

const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const adminSecret    = Deno.env.get('ADMIN_SECRET')!;

const db = createClient(supabaseUrl, serviceRoleKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.headers.get('x-admin-secret') !== adminSecret) {
    return _error('Unauthorized', 401);
  }

  const url    = new URL(req.url);
  const days   = parseInt(url.searchParams.get('days')    ?? '30', 10);
  const minUsers = parseInt(url.searchParams.get('min_users') ?? '3',  10);

  try {
    const [users, recognitions, textRecognitions, retention, cohorts, recentActivity] = await Promise.all([
      db.rpc('admin_new_users_per_day',           { p_days: days }),
      db.rpc('admin_photo_recognitions_per_day',  { p_days: days }),
      db.rpc('admin_text_recognitions_per_day',   { p_days: days }),
      db.rpc('admin_retention',                   { p_min_users: minUsers }),
      db.rpc('admin_cohort_retention'),
      db.rpc('admin_recent_activity'),
    ]);

    if (users.error)            throw users.error;
    if (recognitions.error)     throw recognitions.error;
    if (textRecognitions.error) throw textRecognitions.error;
    if (retention.error)        throw retention.error;
    if (cohorts.error)          throw cohorts.error;
    if (recentActivity.error)   throw recentActivity.error;

    return new Response(JSON.stringify({
      users:            users.data,
      recognitions:     recognitions.data,
      textRecognitions: textRecognitions.data,
      retention:        retention.data,
      cohorts:          cohorts.data,
      recentActivity:   recentActivity.data?.[0] ?? null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status:  200,
    });
  } catch (err) {
    console.error('[admin-stats]', err);
    return _error('Server error', 500);
  }
});

function _error(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status },
  );
}
