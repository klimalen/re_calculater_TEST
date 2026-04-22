-- ============================================================
-- Security hardening migration
-- Run in Supabase Dashboard → SQL Editor
--
-- Covers:
--   #3  Atomic acquire_ai_slot RPC (race condition fix)
--   #7  CHECK constraints on meal_items
--   #8  Daily meal limit trigger (max 50 meals/day per user)
--   #9  RLS rate-limit on feedback table
--   #10 Row Level Security on all user tables
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- #7  CHECK constraints on meal_items
-- Prevents client-manipulated values from polluting the diary
-- ────────────────────────────────────────────────────────────

-- Drop constraints first so the script is re-runnable
ALTER TABLE meal_items
  DROP CONSTRAINT IF EXISTS meal_items_kcal_range,
  DROP CONSTRAINT IF EXISTS meal_items_protein_range,
  DROP CONSTRAINT IF EXISTS meal_items_fat_range,
  DROP CONSTRAINT IF EXISTS meal_items_carb_range,
  DROP CONSTRAINT IF EXISTS meal_items_weight_range;

ALTER TABLE meal_items
  ADD CONSTRAINT meal_items_kcal_range
    CHECK (kcal >= 0 AND kcal <= 5000),
  ADD CONSTRAINT meal_items_protein_range
    CHECK (protein >= 0 AND protein <= 500),
  ADD CONSTRAINT meal_items_fat_range
    CHECK (fat >= 0 AND fat <= 500),
  ADD CONSTRAINT meal_items_carb_range
    CHECK (carb >= 0 AND carb <= 500),
  ADD CONSTRAINT meal_items_weight_range
    CHECK (weight_g IS NULL OR (weight_g >= 0 AND weight_g <= 5000));


-- ────────────────────────────────────────────────────────────
-- #8  Daily meal limit — max 50 meals per user per day
-- Prevents storage flooding and stats query degradation
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _check_daily_meal_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM meals
    WHERE user_id = NEW.user_id
      AND eaten_date = NEW.eaten_date
  ) >= 50 THEN
    RAISE EXCEPTION 'daily_meal_limit_reached'
      USING HINT = 'Maximum 50 meals per day per user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_daily_meal_limit ON meals;

CREATE TRIGGER enforce_daily_meal_limit
  BEFORE INSERT ON meals
  FOR EACH ROW
  EXECUTE FUNCTION _check_daily_meal_limit();


-- ────────────────────────────────────────────────────────────
-- #3  Atomic acquire_ai_slot RPC (race condition fix)
-- Uses SELECT … FOR UPDATE to serialize concurrent requests
-- from multiple Edge Function instances for the same user
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS acquire_ai_slot(UUID, DATE, INTEGER);

CREATE OR REPLACE FUNCTION acquire_ai_slot(
  p_user_id UUID,
  p_date    DATE,
  p_max     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row ai_usage%ROWTYPE;
BEGIN
  -- Lock the row exclusively — blocks any other concurrent call for the same user+date
  SELECT * INTO v_row
  FROM ai_usage
  WHERE user_id = p_user_id AND date = p_date
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Row doesn't exist yet (first request of the day handled by UPSERT in edge function)
    -- This path should not normally be reached; return ok so edge function proceeds
    RETURN '{"blocked": null}'::JSONB;
  END IF;

  -- Another request is already in-flight for this user
  IF v_row.is_processing THEN
    RETURN '{"blocked": "CONCURRENT"}'::JSONB;
  END IF;

  -- Daily limit exhausted
  IF v_row.request_count >= p_max THEN
    RETURN '{"blocked": "RATE_LIMIT"}'::JSONB;
  END IF;

  -- Acquire the slot: increment counter + set processing flag atomically
  UPDATE ai_usage
  SET request_count   = request_count + 1,
      is_processing   = TRUE,
      last_request_at = NOW()
  WHERE user_id = p_user_id AND date = p_date;

  RETURN '{"blocked": null}'::JSONB;
END;
$$;

-- Rollback slot on AI error (undo count increment + release lock)
DROP FUNCTION IF EXISTS release_ai_slot_rollback(UUID, DATE);

CREATE OR REPLACE FUNCTION release_ai_slot_rollback(
  p_user_id UUID,
  p_date    DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_usage
  SET request_count = GREATEST(request_count - 1, 0),
      is_processing = FALSE
  WHERE user_id = p_user_id AND date = p_date;
END;
$$;

-- Ensure the unique constraint exists so UPSERT in the edge function works correctly
ALTER TABLE ai_usage
  DROP CONSTRAINT IF EXISTS ai_usage_user_id_date_key;

ALTER TABLE ai_usage
  ADD CONSTRAINT ai_usage_user_id_date_key
    UNIQUE (user_id, date);


-- ────────────────────────────────────────────────────────────
-- #10  Row Level Security — enable on all user tables
-- Without RLS, any authenticated user can read/write any row
-- directly via the Supabase REST API using their valid JWT
-- ────────────────────────────────────────────────────────────

-- meals
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_meals" ON meals;
CREATE POLICY "users_own_meals" ON meals
  FOR ALL
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- meal_items (access via parent meals row)
ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_meal_items" ON meal_items;
CREATE POLICY "users_own_meal_items" ON meal_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meals
      WHERE meals.id = meal_items.meal_id
        AND meals.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meals
      WHERE meals.id = meal_items.meal_id
        AND meals.user_id = auth.uid()
    )
  );

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_profile" ON profiles;
CREATE POLICY "users_own_profile" ON profiles
  FOR ALL
  TO authenticated
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ai_usage (users may only see their own quota)
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_ai_usage" ON ai_usage;
CREATE POLICY "users_own_ai_usage" ON ai_usage
  FOR ALL
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- banner_dismissals
ALTER TABLE banner_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_banner_dismissals" ON banner_dismissals;
CREATE POLICY "users_own_banner_dismissals" ON banner_dismissals
  FOR ALL
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- #9  Feedback rate limiting via RLS
-- Max 5 messages per user per 24 hours
-- ────────────────────────────────────────────────────────────

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Allow reading own feedback
DROP POLICY IF EXISTS "users_read_own_feedback" ON feedback;
CREATE POLICY "users_read_own_feedback" ON feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow inserting, but rate-limit to 5 per 24h
DROP POLICY IF EXISTS "users_insert_feedback_ratelimit" ON feedback;
CREATE POLICY "users_insert_feedback_ratelimit" ON feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      SELECT COUNT(*)
      FROM feedback
      WHERE user_id = auth.uid()
        AND created_at > NOW() - INTERVAL '24 hours'
    ) < 5
  );

-- Unauthenticated users (user_id IS NULL) can still submit — but no rate limit from their side.
-- Consider removing this if anonymous feedback is not needed.
DROP POLICY IF EXISTS "anon_insert_feedback" ON feedback;
CREATE POLICY "anon_insert_feedback" ON feedback
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);


-- ────────────────────────────────────────────────────────────
-- Performance indexes (if not already present)
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_meals_user_date
  ON meals (user_id, eaten_date);

CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id
  ON meal_items (meal_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date
  ON ai_usage (user_id, date);
