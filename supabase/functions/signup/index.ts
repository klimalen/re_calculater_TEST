/**
 * Edge Function: signup
 * Lightweight IP-based rate limit check before account creation.
 * Does NOT create users — just validates the IP quota.
 * The actual Supabase signUp is done client-side via the JS SDK.
 *
 * Rate limit: MAX_SIGNUPS_PER_IP_PER_DAY registrations per IP per day.
 * IP is hashed (SHA-256 + salt) — raw IPs are never stored.
 *
 * Required secrets:
 *   IP_HASH_SALT — random string, e.g. `openssl rand -hex 32`
 *
 * Deploy: supabase functions deploy signup --no-verify-jwt
 * v4
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_SIGNUPS_PER_IP_PER_DAY = 3;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Module-level: initialised once per instance
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const adminKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ipSalt      = Deno.env.get('IP_HASH_SALT') ?? '';
const db          = createClient(supabaseUrl, adminKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Parse body (only email needed for the IP check) ──
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return _error('Invalid request body', 400);
  }

  // ── IP rate limit check ───────────────────────────────
  const ip = req.headers.get('CF-Connecting-IP')
          || req.headers.get('X-Forwarded-For')?.split(',')[0].trim()
          || 'unknown';

  const ipHash = await _hashIp(ip, ipSalt);
  const today  = new Date().toISOString().slice(0, 10);

  const { data: allowed, error: rpcErr } = await db.rpc('check_and_increment_signup', {
    p_ip_hash: ipHash,
    p_date:    today,
    p_max:     MAX_SIGNUPS_PER_IP_PER_DAY,
  });

  if (rpcErr) {
    console.error('[signup] RPC error:', rpcErr.message);
    return _error('Ошибка сервера', 500);
  }

  if (!allowed) {
    return _error(
      'Слишком много регистраций с этого устройства. Попробуйте завтра.',
      429,
      'IP_RATE_LIMIT',
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status:  200,
  });
});

async function _hashIp(ip: string, salt: string): Promise<string> {
  const data       = new TextEncoder().encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function _error(message: string, status: number, code?: string) {
  return new Response(
    JSON.stringify({ error: message, code }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status },
  );
}
