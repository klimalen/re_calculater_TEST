/**
 * AI recognition client.
 * Calls the Supabase Edge Function which proxies to the AI provider.
 * This module only knows about the contract — not the provider.
 */

import { withTimeout } from './timeout.js';
import { supabase } from '../supabase.js';

const EDGE_FUNCTION = 'recognize-food';
const TIMEOUT_MS = 60000; // AI can be slow on complex images

// ── Mock mode (set to true when AI provider is unavailable) ──
const MOCK_AI = false;

function _mockResult(input) {
  // Simulate network delay
  return new Promise(resolve => setTimeout(() => {
    resolve({
      items: [
        { name: input.text ? input.text.slice(0, 40) : 'Тестовое блюдо', weight_g: 200, kcal: 350, protein: 15, fat: 12, carb: 45 },
        { name: 'Гарнир', weight_g: 150, kcal: 180, protein: 4, fat: 2, carb: 38 },
      ],
      total: { kcal: 530, protein: 19, fat: 14, carb: 83 },
      confidence: 0.85,
      description: 'Mock-данные (AI отключён)',
    });
  }, 1500));
}

/**
 * @param {{ imageBase64?: string, text?: string }} input
 * @returns {Promise<AIRecognitionResult>}
 */
export async function recognizeFood(input) {
  if (!input.imageBase64 && !input.text) {
    throw new Error('Нужно передать фото или текст');
  }

  if (MOCK_AI) {
    const result = await _mockResult(input);
    _validateResult(result);
    return result;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Не авторизован');

  const response = await withTimeout(
    supabase.functions.invoke(EDGE_FUNCTION, {
      body: input,
    }),
    TIMEOUT_MS
  );

  if (response.error) {
    const msg = response.error.message || '';

    if (msg.includes('429') || msg.includes('RATE_LIMIT')) {
      const err = new Error('Дневной лимит запросов исчерпан');
      err.code = 'RATE_LIMIT';
      throw err;
    }

    if (msg.includes('CONCURRENT')) {
      const err = new Error('Дождитесь завершения текущего запроса');
      err.code = 'CONCURRENT';
      throw err;
    }

    throw new Error('Ошибка распознавания. Попробуйте ещё раз');
  }

  const result = response.data;
  _validateResult(result);
  return result;
}

function _validateResult(result) {
  if (!result || !Array.isArray(result.items)) {
    throw new Error('Неверный формат ответа от AI');
  }
  // Sanitize numbers to prevent negative/NaN values entering the UI
  result.items = result.items.map(item => ({
    name:           String(item.name || 'Блюдо'),
    weight_g:       _sanitizeNum(item.weight_g),
    kcal_per100:    _sanitizeNum(item.kcal_per100),
    protein_per100: _sanitizeNum(item.protein_per100),
    fat_per100:     _sanitizeNum(item.fat_per100),
    carb_per100:    _sanitizeNum(item.carb_per100),
  }));

  const t = result.total || {};
  result.total = {
    kcal: _sanitizeNum(t.kcal),
    protein: _sanitizeNum(t.protein),
    fat: _sanitizeNum(t.fat),
    carb: _sanitizeNum(t.carb),
  };

  result.confidence = Math.min(1, Math.max(0, Number(result.confidence) || 0.5));
}

function _sanitizeNum(v) {
  const n = parseFloat(v);
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 10) / 10;
}
