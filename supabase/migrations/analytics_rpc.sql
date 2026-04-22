-- ══════════════════════════════════════════════════════
-- Analytics RPC functions (service role only)
-- Run in Supabase SQL Editor or via: supabase db push
-- ══════════════════════════════════════════════════════

-- ── New users per day ─────────────────────────────────
CREATE OR REPLACE FUNCTION admin_new_users_per_day(p_days int DEFAULT 30)
RETURNS TABLE (day date, new_users bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DATE(created_at) AS day, COUNT(*) AS new_users
  FROM profiles
  WHERE created_at >= CURRENT_DATE - p_days
  GROUP BY day
  ORDER BY day;
$$;

REVOKE ALL ON FUNCTION admin_new_users_per_day(int) FROM PUBLIC, anon, authenticated;

-- ── Photo recognitions per day ────────────────────────
CREATE OR REPLACE FUNCTION admin_photo_recognitions_per_day(p_days int DEFAULT 30)
RETURNS TABLE (day date, recognitions bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT eaten_date AS day, COUNT(*) AS recognitions
  FROM meals
  WHERE source = 'photo'
    AND eaten_date >= CURRENT_DATE - p_days
  GROUP BY day
  ORDER BY day;
$$;

REVOKE ALL ON FUNCTION admin_photo_recognitions_per_day(int) FROM PUBLIC, anon, authenticated;

-- ── Retention (regular + cumulative, days 0–14) ───────
CREATE OR REPLACE FUNCTION admin_retention(p_min_users int DEFAULT 3)
RETURNS TABLE (
  day_n          int,
  eligible_users bigint,
  returned       bigint,
  retention_pct  numeric,
  cumulative_pct numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cohorts AS (
    SELECT id AS user_id, DATE(created_at) AS cohort_day
    FROM profiles
  ),
  days AS (
    SELECT generate_series(0, 14) AS day_n
  ),
  activity AS (
    SELECT DISTINCT user_id, eaten_date FROM meals
  ),
  base AS (
    SELECT d.day_n, c.user_id, c.cohort_day
    FROM days d
    JOIN cohorts c ON c.cohort_day <= CURRENT_DATE - d.day_n
  ),
  calculated AS (
    SELECT
      b.day_n,
      COUNT(DISTINCT b.user_id) AS eligible_users,
      COUNT(DISTINCT CASE
        WHEN a.eaten_date = b.cohort_day + b.day_n THEN b.user_id
      END) AS returned_exact,
      COUNT(DISTINCT CASE
        WHEN a.eaten_date BETWEEN b.cohort_day + 1 AND b.cohort_day + b.day_n THEN b.user_id
      END) AS returned_cum
    FROM base b
    LEFT JOIN activity a ON a.user_id = b.user_id
    GROUP BY b.day_n
  )
  SELECT
    day_n,
    eligible_users,
    returned_exact                                                              AS returned,
    CASE WHEN day_n = 0 THEN 100.0
         ELSE ROUND(returned_exact::numeric / NULLIF(eligible_users, 0) * 100, 1)
    END                                                                         AS retention_pct,
    CASE WHEN day_n = 0 THEN 100.0
         ELSE ROUND(returned_cum::numeric / NULLIF(eligible_users, 0) * 100, 1)
    END                                                                         AS cumulative_pct
  FROM calculated
  WHERE eligible_users >= p_min_users
  ORDER BY day_n;
$$;

REVOKE ALL ON FUNCTION admin_retention(int) FROM PUBLIC, anon, authenticated;

-- ── Cohort retention table (day 0, 1, 3, 7) ──────────
CREATE OR REPLACE FUNCTION admin_cohort_retention()
RETURNS TABLE (
  cohort_day  date,
  cohort_size bigint,
  day0_pct    numeric,
  day1_pct    numeric,
  day3_pct    numeric,
  day7_pct    numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cohorts AS (
    SELECT id AS user_id, DATE(created_at) AS cohort_day
    FROM profiles
  ),
  activity AS (
    SELECT DISTINCT user_id, eaten_date AS active_day
    FROM meals
  ),
  retention AS (
    SELECT
      c.cohort_day,
      COUNT(DISTINCT c.user_id)                                                                    AS cohort_size,
      COUNT(DISTINCT CASE WHEN a.active_day = c.cohort_day + 0 THEN c.user_id END)                AS day0,
      COUNT(DISTINCT CASE WHEN a.active_day = c.cohort_day + 1 THEN c.user_id END)                AS day1,
      COUNT(DISTINCT CASE WHEN a.active_day = c.cohort_day + 3 THEN c.user_id END)                AS day3,
      COUNT(DISTINCT CASE WHEN a.active_day = c.cohort_day + 7 THEN c.user_id END)                AS day7
    FROM cohorts c
    LEFT JOIN activity a ON c.user_id = a.user_id
    GROUP BY c.cohort_day
  )
  SELECT
    cohort_day,
    cohort_size,
    ROUND(day0::numeric / NULLIF(cohort_size, 0) * 100, 1) AS day0_pct,
    ROUND(day1::numeric / NULLIF(cohort_size, 0) * 100, 1) AS day1_pct,
    ROUND(day3::numeric / NULLIF(cohort_size, 0) * 100, 1) AS day3_pct,
    ROUND(day7::numeric / NULLIF(cohort_size, 0) * 100, 1) AS day7_pct
  FROM retention
  ORDER BY cohort_day;
$$;

REVOKE ALL ON FUNCTION admin_cohort_retention() FROM PUBLIC, anon, authenticated;

-- ── Text recognitions per day ─────────────────────────
CREATE OR REPLACE FUNCTION admin_text_recognitions_per_day(p_days int DEFAULT 30)
RETURNS TABLE (day date, recognitions bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT eaten_date AS day, COUNT(*) AS recognitions
  FROM meals
  WHERE source = 'text'
    AND eaten_date >= CURRENT_DATE - p_days
  GROUP BY day
  ORDER BY day;
$$;

REVOKE ALL ON FUNCTION admin_text_recognitions_per_day(int) FROM PUBLIC, anon, authenticated;

-- ── Recent activity: yesterday + today for users registered before day-before-yesterday ──
CREATE OR REPLACE FUNCTION admin_recent_activity()
RETURNS TABLE (
  total_registered  bigint,
  users_yesterday   bigint,
  users_today       bigint,
  users_both_days   bigint,
  cutoff_date       date,
  yesterday         date,
  today             date
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dates AS (
    SELECT
      (CURRENT_DATE - 2) AS cutoff_date,
      (CURRENT_DATE - 1) AS yesterday,
      CURRENT_DATE       AS today
  ),
  eligible AS (
    SELECT p.id AS user_id
    FROM profiles p
    CROSS JOIN dates d
    WHERE p.created_at::date <= d.cutoff_date
  ),
  active AS (
    SELECT DISTINCT m.user_id, m.created_at::date AS active_date
    FROM meals m
    INNER JOIN eligible e ON e.user_id = m.user_id
    CROSS JOIN dates d
    WHERE m.created_at::date IN (d.yesterday, d.today)
  )
  SELECT
    (SELECT COUNT(*) FROM eligible)::bigint,
    COUNT(DISTINCT CASE WHEN a.active_date = d.yesterday THEN a.user_id END)::bigint,
    COUNT(DISTINCT CASE WHEN a.active_date = d.today     THEN a.user_id END)::bigint,
    COUNT(DISTINCT CASE
      WHEN a.active_date = d.yesterday
       AND EXISTS (SELECT 1 FROM active a2 WHERE a2.user_id = a.user_id AND a2.active_date = d.today)
      THEN a.user_id
    END)::bigint,
    d.cutoff_date,
    d.yesterday,
    d.today
  FROM dates d
  LEFT JOIN active a ON true
  GROUP BY d.cutoff_date, d.yesterday, d.today;
$$;

REVOKE ALL ON FUNCTION admin_recent_activity() FROM PUBLIC, anon, authenticated;
