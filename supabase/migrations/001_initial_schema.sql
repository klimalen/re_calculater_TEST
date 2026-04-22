-- ══════════════════════════════════════════════════════
-- FoodCal — Initial Schema
-- ══════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Profiles ─────────────────────────────────────────
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name    text,
  timezone        text NOT NULL DEFAULT 'UTC',
  goal_kcal       int CHECK (goal_kcal > 0),
  goal_protein    numeric(6,1) CHECK (goal_protein >= 0),
  goal_fat        numeric(6,1) CHECK (goal_fat >= 0),
  goal_carb       numeric(6,1) CHECK (goal_carb >= 0),
  onboarding_done boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Meals ─────────────────────────────────────────────
CREATE TABLE meals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  eaten_at        timestamptz NOT NULL,
  eaten_date      date NOT NULL,
  meal_type       text CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  source          text NOT NULL CHECK (source IN ('photo','text')),
  photo_url       text,
  ai_confidence   numeric(3,2) CHECK (ai_confidence BETWEEN 0 AND 1),
  notes           text,
  total_kcal      numeric(7,1) NOT NULL CHECK (total_kcal >= 0),
  total_protein   numeric(6,1) NOT NULL CHECK (total_protein >= 0),
  total_fat       numeric(6,1) NOT NULL CHECK (total_fat >= 0),
  total_carb      numeric(6,1) NOT NULL CHECK (total_carb >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meals_user_date_idx ON meals (user_id, eaten_date);
CREATE INDEX meals_user_at_idx   ON meals (user_id, eaten_at);

-- ── Meal items ────────────────────────────────────────
CREATE TABLE meal_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id     uuid NOT NULL REFERENCES meals ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name        text NOT NULL,
  weight_g    numeric(7,1) CHECK (weight_g > 0),
  kcal        numeric(7,1) NOT NULL CHECK (kcal >= 0),
  protein     numeric(6,1) NOT NULL CHECK (protein >= 0),
  fat         numeric(6,1) NOT NULL CHECK (fat >= 0),
  carb        numeric(6,1) NOT NULL CHECK (carb >= 0),
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meal_items_meal_idx ON meal_items (meal_id);
CREATE INDEX meal_items_user_idx ON meal_items (user_id);

-- ── AI usage / rate limiting ──────────────────────────
CREATE TABLE ai_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date            date NOT NULL,
  request_count   int NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  is_processing   boolean NOT NULL DEFAULT false,
  last_request_at timestamptz,
  UNIQUE (user_id, date)
);

-- ── Analytics events ──────────────────────────────────
CREATE TABLE analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users ON DELETE SET NULL,
  event_name  text NOT NULL,
  properties  jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_user_idx ON analytics_events (user_id, created_at);

-- ══════════════════════════════════════════════════════
-- Row Level Security
-- ══════════════════════════════════════════════════════

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage        ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- profiles: user sees and modifies only own row
CREATE POLICY profiles_self ON profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- meals: user sees and modifies only own rows
CREATE POLICY meals_self ON meals
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- meal_items: user sees and modifies only own rows
CREATE POLICY meal_items_self ON meal_items
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ai_usage: user sees only own rows (writes via service role from Edge Function)
CREATE POLICY ai_usage_read ON ai_usage
  FOR SELECT USING (user_id = auth.uid());

-- analytics: user sees only own rows; insert allowed for authenticated + anon
CREATE POLICY analytics_insert ON analytics_events
  FOR INSERT WITH CHECK (true);
CREATE POLICY analytics_self ON analytics_events
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

-- ══════════════════════════════════════════════════════
-- RPC Functions
-- ══════════════════════════════════════════════════════

-- Atomic create meal + items in one transaction
CREATE OR REPLACE FUNCTION create_meal_with_items(
  p_meal  jsonb,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meal_id uuid;
  v_item    jsonb;
  v_result  jsonb;
BEGIN
  -- Verify user owns this meal
  IF (p_meal->>'user_id')::uuid != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Insert meal
  INSERT INTO meals (
    id, user_id, eaten_at, eaten_date, meal_type, source,
    ai_confidence, notes, total_kcal, total_protein, total_fat, total_carb
  )
  VALUES (
    COALESCE((p_meal->>'id')::uuid, gen_random_uuid()),
    auth.uid(),
    (p_meal->>'eaten_at')::timestamptz,
    (p_meal->>'eaten_date')::date,
    p_meal->>'meal_type',
    p_meal->>'source',
    (p_meal->>'ai_confidence')::numeric,
    p_meal->>'notes',
    (p_meal->>'total_kcal')::numeric,
    (p_meal->>'total_protein')::numeric,
    (p_meal->>'total_fat')::numeric,
    (p_meal->>'total_carb')::numeric
  )
  RETURNING id INTO v_meal_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO meal_items (meal_id, user_id, name, weight_g, kcal, protein, fat, carb, sort_order)
    VALUES (
      v_meal_id,
      auth.uid(),
      v_item->>'name',
      (v_item->>'weight_g')::numeric,
      (v_item->>'kcal')::numeric,
      (v_item->>'protein')::numeric,
      (v_item->>'fat')::numeric,
      (v_item->>'carb')::numeric,
      COALESCE((v_item->>'sort_order')::int, 0)
    );
  END LOOP;

  SELECT row_to_json(m.*) INTO v_result FROM meals m WHERE m.id = v_meal_id;
  RETURN v_result;
END;
$$;

-- Aggregate daily totals for stats
CREATE OR REPLACE FUNCTION get_daily_totals(
  p_user_id uuid,
  p_from    date,
  p_to      date
) RETURNS TABLE (
  eaten_date    date,
  total_kcal    numeric,
  total_protein numeric,
  total_fat     numeric,
  total_carb    numeric,
  meal_count    int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    eaten_date,
    SUM(total_kcal)::numeric    AS total_kcal,
    SUM(total_protein)::numeric AS total_protein,
    SUM(total_fat)::numeric     AS total_fat,
    SUM(total_carb)::numeric    AS total_carb,
    COUNT(*)::int               AS meal_count
  FROM meals
  WHERE user_id = p_user_id
    AND eaten_date BETWEEN p_from AND p_to
    AND user_id = auth.uid()
  GROUP BY eaten_date
  ORDER BY eaten_date;
$$;

-- Atomic AI slot acquisition (called from Edge Function via service role)
CREATE OR REPLACE FUNCTION acquire_ai_slot(
  p_user_id uuid,
  p_date    date,
  p_max     int DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row ai_usage%ROWTYPE;
BEGIN
  -- Lock the row
  SELECT * INTO v_row FROM ai_usage WHERE user_id = p_user_id AND date = p_date FOR UPDATE;

  IF NOT FOUND THEN
    -- First request today
    INSERT INTO ai_usage (user_id, date, request_count, is_processing, last_request_at)
    VALUES (p_user_id, p_date, 1, true, now());
    RETURN '{"blocked": null}'::jsonb;
  END IF;

  IF v_row.request_count >= p_max THEN
    RETURN '{"blocked": "RATE_LIMIT"}'::jsonb;
  END IF;

  IF v_row.is_processing THEN
    RETURN '{"blocked": "CONCURRENT"}'::jsonb;
  END IF;

  UPDATE ai_usage
  SET request_count = request_count + 1, is_processing = true, last_request_at = now()
  WHERE user_id = p_user_id AND date = p_date;

  RETURN '{"blocked": null}'::jsonb;
END;
$$;

-- Release slot on AI error (rollback the count)
CREATE OR REPLACE FUNCTION release_ai_slot_rollback(
  p_user_id uuid,
  p_date    date
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE ai_usage
  SET request_count = GREATEST(0, request_count - 1), is_processing = false
  WHERE user_id = p_user_id AND date = p_date;
$$;

-- Delete user account (called from frontend via service role)
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cascade deletes handle meals, meal_items, ai_usage
  DELETE FROM profiles WHERE id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Auto-update profiles.updated_at
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
