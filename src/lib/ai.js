// Выжимка прогноза дня из сырого текста через OpenAI (gpt-4o-mini).
// Возвращает структуру для блока на главной и причёсанный полный текст.
import { config } from './config.js';
import { logger } from './logger.js';

const SYSTEM = `Ты — редактор сайта радио «Толкай Вода». Тебе присылают сырой текст
ежедневного эзотерического «прогноза дня» от Геннадия Серафимовича (стиль Павла Глобы):
дата, лунный день, разделы (Прелюдия, Рубим, Приметы, Сны, Еда, Одежда, Вода и т.п.),
ссылки и подпись. Преобразуй его для публикации.

Верни СТРОГО JSON со следующими полями:
{
  "subtitle": "строка лунного дня, например «28-й Солнечный день, 1/2 Лунные дни» (если нет — пустая строка)",
  "intro": "2–4 коротких предложения — суть дня своими словами, для свёрнутого блока",
  "water": "Вода дня — одно ёмкое предложение (из раздела про воду)",
  "color": "Цвет дня — перечисление цветов одежды (из раздела одежда/цвет)",
  "food": "Еда дня — одно короткое предложение про питание",
  "advice": "Совет дня — один короткий императивный совет, итог дня",
  "full": "полный причёсанный прогноз. Каждый раздел начинай с заголовка в формате «## Заголовок» на отдельной строке, затем абзац. Убери ссылки, разделители (---), дату-шапку и подпись. Сохрани смысл и разделы автора."
}

Правила: без эмодзи. Пиши по-русски, живо, но без воды. Не выдумывай фактов сверх текста.
Если какого-то раздела нет — оставь соответствующее поле пустой строкой.`;

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('OpenAI вернул не-JSON');
  }
}

export function aiEnabled() {
  return !!config.openai.apiKey;
}

// rawText → { subtitle, intro, water, color, food, advice, full }
export async function prepareForecast(rawText) {
  if (!config.openai.apiKey) throw new Error('OPENAI_API_KEY не задан');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${config.openai.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: rawText },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI: пустой ответ');

    const obj = extractJson(content);
    return {
      subtitle: String(obj.subtitle || '').trim(),
      intro: String(obj.intro || '').trim(),
      water: String(obj.water || '').trim(),
      color: String(obj.color || '').trim(),
      food: String(obj.food || '').trim(),
      advice: String(obj.advice || '').trim(),
      full: String(obj.full || '').trim(),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Фолбэк без ИИ: грубая структуризация, чтобы бот работал и без ключа.
export function prepareForecastFallback(rawText) {
  const clean = String(rawText)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/https?:\/\//i.test(l) && l.trim() !== '---')
    .join('\n')
    .trim();
  const paras = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const subtitle = (paras.find((p) => /\d+.{0,4}(солнечн|лунн)/i.test(p)) || '').split('\n')[0] || '';
  const intro = paras.find((p) => p !== subtitle && p.length > 40) || paras[0] || '';
  return {
    subtitle,
    intro: intro.length > 400 ? intro.slice(0, 400) + '…' : intro,
    water: '',
    color: '',
    food: '',
    advice: '',
    full: clean,
  };
}
