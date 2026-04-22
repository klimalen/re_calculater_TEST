-- ============================================================
-- IP rate limiting for signup
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Table: one row per (ip_hash, date), accumulates signup count
CREATE TABLE IF NOT EXISTS signup_attempts (
  ip_hash TEXT NOT NULL,
  date    DATE NOT NULL,
  count   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, date)
);

-- RLS: only Edge Function (service role) accesses this table
ALTER TABLE signup_attempts ENABLE ROW LEVEL SECURITY;

-- No policies needed — service role bypasses RLS

-- Atomic increment + rate limit check.
-- Returns TRUE if signup is allowed, FALSE if limit reached.
DROP FUNCTION IF EXISTS check_and_increment_signup(TEXT, DATE, INTEGER);

CREATE FUNCTION check_and_increment_signup(
  p_ip_hash TEXT,
  p_date    DATE,
  p_max     INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Insert first attempt OR increment existing counter
  INSERT INTO signup_attempts (ip_hash, date, count)
  VALUES (p_ip_hash, p_date, 1)
  ON CONFLICT (ip_hash, date) DO UPDATE
    SET count = signup_attempts.count + 1
  RETURNING count INTO v_count;

  IF v_count > p_max THEN
    -- Roll back the increment — don't count this blocked attempt
    UPDATE signup_attempts
    SET count = count - 1
    WHERE ip_hash = p_ip_hash AND date = p_date;
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Auto-cleanup: remove rows older than 3 days (keeps table small)
-- Optional: run via pg_cron if available, otherwise rows stay but are harmless
-- SELECT cron.schedule('cleanup-signup-attempts', '0 3 * * *',
--   $$DELETE FROM signup_attempts WHERE date < CURRENT_DATE - 2$$);
