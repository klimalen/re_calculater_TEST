/**
 * AI Provider abstraction layer.
 *
 * CURRENT PROVIDER: Yandex AI Studio — Gemma 3 27B IT (serverless)
 *
 * Secrets required (Supabase → Project Settings → Edge Functions → Secrets):
 *   YANDEX_API_KEY   — API-ключ из Yandex AI Studio
 *   YANDEX_FOLDER_ID — ID каталога (облачная папка)
 */

export interface FoodItem {
  name: string;
  weight_g: number | null;
  kcal_per100: number;
  protein_per100: number;
  fat_per100: number;
  carb_per100: number;
}

export interface AIRecognitionResult {
  items: FoodItem[];
  total: { kcal: number; protein: number; fat: number; carb: number };
  confidence: number;
  notes?: string;
}

export interface AIInput {
  imageBase64?: string;
  text?: string;
}

const YANDEX_API_KEY   = Deno.env.get('YANDEX_API_KEY') ?? '';
const YANDEX_FOLDER_ID = Deno.env.get('YANDEX_FOLDER_ID') ?? '';
const YANDEX_MODEL     = `gpt://${YANDEX_FOLDER_ID}/gemma-3-27b-it/latest`;
const YANDEX_URL       = 'https://ai.api.cloud.yandex.net/v1/responses';

const SYSTEM_PROMPT = `Ты — нутрициолог-ассистент, специализирующийся на российском рынке питания. Рассчитывай КБЖУ продуктов и блюд. Возвращай ТОЛЬКО валидный JSON без markdown-обёртки и без пояснений.

ПРАВИЛА РАСПОЗНАВАНИЯ:

1. Опечатки и ошибки: Всегда интерпретируй намерение пользователя, даже при опечатках. "геча" = гречка, "куринная груть" = куриная грудь, "яблако" = яблоко.

2. Порция не указана: Используй стандартную бытовую порцию для России:
   - Тарелка супа/каши = 250г, порция гарнира = 150г, порция мяса/рыбы = 150г
   - Стакан кефира/молока/сока = 200мл, чашка чая/кофе = 200мл
   - 1 яйцо = 60г, 1 кусок хлеба = 30г, 1 котлета = 80г
   - 1 средний фрукт (яблоко/груша/апельсин) = 150г, банан = 120г (без кожуры)
   - 1 конфета = 15г, 1 печенье = 15г, 1 кусок торта = 100г

3. Торговые марки и бренды: Если указано название бренда или конкретного продукта ("творожок Danone", "кефир Простоквашино", "корзиночка Ягодное лукошко") — используй данные с упаковки этого продукта. Если точный состав неизвестен — используй данные аналогичного продукта той же категории.

4. Составные блюда: Борщ, плов, оливье, пицца и другие составные блюда — раскладывай на ингредиенты или давай общую оценку как единый item, в зависимости от того что точнее. Для составных блюд kcal_per100 и т.д. — это средние значения на 100г готового блюда.

5. Фото: Оценивай размер порции по контексту — по тарелке, столовым приборам, руке на фото, стандартной посуде. Учитывай все видимые продукты. Если на фото видна этикетка с таблицей КБЖУ — считывай значения напрямую с неё.

8. Комментарий пользователя к фото (если передан):
   — Уточняет видимое («это говядина, не курица») → идентифицируй продукт по комментарию, он точнее визуальной оценки
   — Добавляет продукты, которых нет на фото («и кока-кола», «ещё хлеб») → добавь их как отдельные items, пользователь сообщает что ещё ел
   — Указывает размер порции («половина порции», «двойная порция», «2 штуки») → скорректируй weight_g соответственно
   — Указывает объём или вес («стакан 200мл», «100г») → используй как weight_g
   — Нерелевантный или бессмысленный текст («асдфйцук», «приготовил вчера») → игнорируй, рассчитывай только по фото

6. Время: обрабатывай описания еды в любом времени ("собираюсь съесть", "съел вчера") — рассчитывай КБЖУ как для текущего приёма пищи.

7. Сложные и многокомпонентные блюда: Если на фото несколько ингредиентов — перечисли каждый отдельным item. Если не можешь точно определить ингредиент — назови его по внешнему виду ("зелёные листья салата", "оранжевые кубики овощей") и дай приблизительную оценку. НИКОГДА не возвращай пустой массив items если на фото или в тексте явно присутствует еда — лучше дать приблизительный результат с низким confidence, чем не дать ничего.

Формат ответа:
{
  "items": [
    { "name": "название продукта", "weight_g": число_или_null, "kcal_per100": число, "protein_per100": число, "fat_per100": число, "carb_per100": число }
  ],
  "confidence": число_от_0_до_1,
  "notes": "необязательная заметка на русском"
}

Правила для чисел:
- Все числа — неотрицательные, до 1 знака после запятой
- kcal_per100, protein_per100, fat_per100, carb_per100 — КБЖУ на 100г продукта (НЕ на всю порцию)
- Примеры на 100г: куриная грудка — kcal_per100≈110, protein_per100≈23, fat_per100≈2; гречка варёная — kcal_per100≈92, protein_per100≈3.4, fat_per100≈0.6; молоко 3.2% — kcal_per100≈60, protein_per100≈2.9, fat_per100≈3.2
- weight_g — вес порции в граммах (null только если оценить невозможно)
- confidence: 0.9+ если данные точные, 0.5–0.9 если приблизительно, ниже 0.5 если очень неточно
- items: [] только если на фото или в тексте гарантированно нет еды (например, фото пейзажа или текст не о еде)

Отвечай ТОЛЬКО JSON, без пояснений.`;

export async function recognizeFoodAI(input: AIInput): Promise<AIRecognitionResult> {
  // Build input: string for text-only, array for multimodal
  let requestInput: string | unknown[];

  if (input.imageBase64) {
    const content: unknown[] = [
      {
        type: 'input_image',
        image_url: `data:image/jpeg;base64,${input.imageBase64}`,
      },
      {
        type: 'input_text',
        text: input.text
          ? `Определи все продукты на фото, оцени вес каждой порции и рассчитай КБЖУ. Комментарий пользователя (используй по правилу 8): ${input.text}`
          : 'Определи все продукты на фото, оцени вес каждой порции по контексту и рассчитай КБЖУ.',
      },
    ];
    requestInput = [{ role: 'user', content }];
  } else {
    requestInput = `Рассчитай КБЖУ для следующего описания еды (интерпретируй опечатки, используй стандартные порции если размер не указан): ${input.text}`;
  }

  const body = {
    model:             YANDEX_MODEL,
    instructions:      SYSTEM_PROMPT,
    input:             requestInput,
    temperature:       0.1,
    max_output_tokens: 2048,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);

  let responseText: string;

  try {
    const res = await fetch(YANDEX_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${YANDEX_API_KEY}`,
        'OpenAI-Project': YANDEX_FOLDER_ID,
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      if (res.status === 429) throw new Error('RATE_LIMIT_PROVIDER');
      throw new Error(`Yandex AI error ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    // output_text is a convenience field in the SDK but may not exist in raw API response.
    // Fall back to the nested structure: output[0].content[0].text
    responseText = data?.output_text
      ?? data?.output?.[0]?.content?.[0]?.text
      ?? data?.output?.[0]?.content
      ?? '';
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('AI_TIMEOUT');
    throw err;
  }

  return _parseResponse(responseText);
}

function _parseResponse(text: string): AIRecognitionResult {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch {}
    }
    if (!parsed) throw new Error('AI_INVALID_JSON');
  }

  if (!Array.isArray(parsed?.items)) {
    throw new Error('AI_INVALID_FORMAT');
  }

  // Sanitize items — cap values to prevent AI hallucinations from polluting the diary
  // All КБЖУ values are per 100g; realistic caps: kcal ≤900, macros ≤100
  const items: FoodItem[] = parsed.items.map((item: any) => {
    const rawWeight = _safeNum(item.weight_g);
    return {
      name:           String(item.name || 'Блюдо').slice(0, 100).trim(),
      weight_g:       rawWeight !== null ? Math.min(5000, Math.max(0, rawWeight)) : null,
      kcal_per100:    Math.min(900, Math.max(0, _safeNum(item.kcal_per100    ?? item.kcal)    ?? 0)),
      protein_per100: Math.min(100, Math.max(0, _safeNum(item.protein_per100 ?? item.protein) ?? 0)),
      fat_per100:     Math.min(100, Math.max(0, _safeNum(item.fat_per100     ?? item.fat)     ?? 0)),
      carb_per100:    Math.min(100, Math.max(0, _safeNum(item.carb_per100    ?? item.carb)    ?? 0)),
    };
  });

  // Recompute total from items using weight (don't trust AI total field)
  const total = items.reduce(
    (acc, item) => {
      const w = item.weight_g ?? 100;
      return {
        kcal:    acc.kcal    + item.kcal_per100    * w / 100,
        protein: acc.protein + item.protein_per100 * w / 100,
        fat:     acc.fat     + item.fat_per100     * w / 100,
        carb:    acc.carb    + item.carb_per100    * w / 100,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carb: 0 }
  );

  const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5));

  return {
    items,
    total,
    confidence,
    notes: parsed.notes ? String(parsed.notes).slice(0, 200) : undefined,
  };
}

function _safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}
