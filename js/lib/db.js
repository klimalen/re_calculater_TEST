/**
 * Database operations.
 * All queries use withTimeout for safety.
 */

import { supabase } from '../supabase.js';
import { withTimeout } from './timeout.js';
import { toLocalDateString } from './timezone.js';

// ── Profile ───────────────────────────────────────────

export async function getProfile(userId) {
  const { data, error } = await withTimeout(
    supabase.from('profiles').select('*').eq('id', userId).single()
  );
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertProfile(userId, fields) {
  const { data, error } = await withTimeout(
    supabase.from('profiles').upsert({ id: userId, ...fields }).select().single()
  );
  if (error) throw error;
  return data;
}

// ── Meals ─────────────────────────────────────────────

/**
 * Create meal + items atomically via RPC.
 * Returns the created meal with items.
 */
export async function createMeal({ userId, mealData, items }) {
  const { data, error } = await withTimeout(
    supabase.rpc('create_meal_with_items', {
      p_meal: mealData,
      p_items: items,
    })
  );
  if (error) throw error;
  return data;
}

/** Get all meals for a specific date string (YYYY-MM-DD) */
export async function getMealsByDate(userId, dateStr) {
  const { data, error } = await withTimeout(
    supabase
      .from('meals')
      .select('*, meal_items(*)')
      .eq('user_id', userId)
      .eq('eaten_date', dateStr)
      .order('eaten_at', { ascending: true })
  );
  if (error) throw error;
  return data || [];
}

/** Get meals for a range of dates */
export async function getMealsByDateRange(userId, fromDate, toDate) {
  const { data, error } = await withTimeout(
    supabase
      .from('meals')
      .select('id, eaten_date, total_kcal, total_protein, total_fat, total_carb')
      .eq('user_id', userId)
      .gte('eaten_date', fromDate)
      .lte('eaten_date', toDate)
      .order('eaten_date', { ascending: true })
  );
  if (error) throw error;
  return data || [];
}

/** Delete a meal (cascade deletes items + triggers storage cleanup via DB function) */
export async function deleteMeal(mealId) {
  const { error } = await withTimeout(
    supabase.from('meals').delete().eq('id', mealId)
  );
  if (error) throw error;
}

/** Update meal metadata (time, type, notes) */
export async function updateMeal(mealId, fields) {
  const { data, error } = await withTimeout(
    supabase.from('meals').update(fields).eq('id', mealId).select().single()
  );
  if (error) throw error;
  return data;
}

/** Update a single meal item's fields */
export async function updateMealItem(itemId, fields) {
  const { data, error } = await withTimeout(
    supabase.from('meal_items').update(fields).eq('id', itemId).select().single()
  );
  if (error) throw error;
  return data;
}

/** Delete a single meal item */
export async function deleteMealItem(itemId) {
  const { error } = await withTimeout(
    supabase.from('meal_items').delete().eq('id', itemId)
  );
  if (error) throw error;
}

// ── Stats aggregation ─────────────────────────────────

/** Get daily totals for a date range — uses RPC for DB-side aggregation */
export async function getDailyTotals(userId, fromDate, toDate) {
  const { data, error } = await withTimeout(
    supabase.rpc('get_daily_totals', {
      p_user_id: userId,
      p_from: fromDate,
      p_to: toDate,
    })
  );
  if (error) throw error;
  return data || [];
}

// ── AI usage / rate limiting ──────────────────────────

/** Get today's AI usage record */
export async function getAiUsage(userId, dateStr) {
  const { data, error } = await withTimeout(
    supabase
      .from('ai_usage')
      .select('*')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .maybeSingle()
  );
  if (error) throw error;
  return data;
}
