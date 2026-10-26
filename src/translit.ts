const TRANSLITERATION: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya'
}

export function slugify (input: string): string {
  const transliterated = input.toLocaleLowerCase('ru-RU').split('')
    .map(char => TRANSLITERATION[char] ?? char)
    .join('')
  const slug = transliterated.replaceAll(/[^a-z0-9]+/gu, '_').replaceAll(/^_+|_+$/gu, '')
  if (slug.length === 0) {
    return 'device'
  }
  return /^\d/u.test(slug) ? `d${slug}` : slug
}
