/**
 * Edge Function: recognize-food — deployed with --no-verify-jwt
 *
 * Rate limiting:
 * - Max 10 AI requests per user per day
 * - Max 1 concurrent request per user (is_processing flag)
 *
 * Flow:
 * 1. Authenticate request
 * 2. Check & acquire rate limit slot (atomic upsert)
 * 3. Call AI provider
 * 4. Release rate limit slot
 * 5. Return result
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { recognizeFoodAI } from '../_shared/ai-provider.ts';

const MAX_REQUESTS_PER_DAY = 10;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl      = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey  = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseAdminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Admin client for DB operations (rate limiting, RPC)
  const supabase = createClient(supabaseUrl, supabaseAdminKey);

  // ── Auth ─────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return _error('Unauthorized', 401);
  }

  // Verify user via anon client with user's own token in headers
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return _error('Unauthorized', 401);
  }

  // ── Parse body ────────────────────────────────────────
  let body: { imageBase64?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return _error('Invalid request body', 400);
  }

  if (!body.imageBase64 && !body.text) {
    return _error('imageBase64 or text is required', 400);
  }

  // Validate imageBase64 size (max ~600KB base64 ≈ ~450KB image)
  if (body.imageBase64 && body.imageBase64.length > 800_000) {
    return _error('Image too large. Please compress before sending.', 400);
  }

  // ── Rate limiting (atomic) ────────────────────────────
  const today = _utcDateString();

  // Try to acquire slot: increment count + set is_processing=true atomically
  const { data: usage, error: usageError } = await supabase
    .from('ai_usage')
    .upsert(
      {
        user_id:         user.id,
        date:            today,
        request_count:   1,
        is_processing:   true,
        last_request_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,date',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  // If row already existed, we need to check and increment
  if (usageError || !usage) {
    // Row exists — check limits via RPC
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('acquire_ai_slot', { p_user_id: user.id, p_date: today, p_max: MAX_REQUESTS_PER_DAY });

    if (rpcError) {
      return _error('Ошибка сервера', 500);
    }

    if (rpcResult?.blocked === 'RATE_LIMIT') {
      return _error(`Дневной лимит (${MAX_REQUESTS_PER_DAY} запросов) исчерпан`, 429, 'RATE_LIMIT');
    }

    if (rpcResult?.blocked === 'CONCURRENT') {
      return _error('Дождитесь завершения текущего запроса', 429, 'CONCURRENT');
    }
  }

  // ── Call AI ───────────────────────────────────────────
  let result;
  try {
    result = await recognizeFoodAI({
      imageBase64: body.imageBase64,
      text: body.text,
    });
  } catch (err: any) {
    // Release processing lock on error
    await _releaseSlot(supabase, user.id, today, /* rollback count */ true);

    const msg = err.message || '';
    if (msg === 'AI_TIMEOUT')       return _error('AI не ответил вовремя. Попробуйте ещё раз.', 504);
    if (msg === 'RATE_LIMIT_PROVIDER') return _error('AI сервис перегружен. Попробуйте через минуту.', 503);
    if (msg === 'AI_INVALID_JSON' || msg === 'AI_INVALID_FORMAT')
      return _error('AI вернул некорректный ответ. Попробуйте ещё раз.', 502);

    return _error('Не удалось распознать. Попробуйте ещё раз.', 502);
  } finally {
    // Always release is_processing flag
    await _releaseSlot(supabase, user.id, today, false);
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
});

async function _releaseSlot(supabase: any, userId: string, date: string, rollback: boolean) {
  try {
    if (rollback) {
      await supabase.rpc('release_ai_slot_rollback', { p_user_id: userId, p_date: date });
    } else {
      await supabase
        .from('ai_usage')
        .update({ is_processing: false })
        .eq('user_id', userId)
        .eq('date', date);
    }
  } catch {}
}

function _error(message: string, status: number, code?: string) {
  return new Response(
    JSON.stringify({ error: message, code }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
  );
}

function _utcDateString() {
  return new Date().toISOString().slice(0, 10);
}
