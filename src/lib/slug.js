// Транслитерация кириллицы в латиницу и генерация slug для статей.

const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function transliterate(str) {
  return String(str)
    .toLowerCase()
    .split('')
    .map((ch) => (ch in MAP ? MAP[ch] : ch))
    .join('');
}

// "О клане «Толкай Вода»" → "o-klane-tolkai-voda"
export function slugify(title) {
  const base = transliterate(title)
    .replace(/[^a-z0-9]+/g, '-') // всё не [a-z0-9] → дефис
    .replace(/^-+|-+$/g, '') // обрезать дефисы по краям
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base || 'post';
}

// Возвращает уникальный slug: если базовый занят (exists(slug) === true),
// добавляет числовой суффикс -2, -3, …
export function uniqueSlug(title, exists) {
  const base = slugify(title);
  if (!exists(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
