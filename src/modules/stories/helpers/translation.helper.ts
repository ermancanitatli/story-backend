import { Story } from '../schemas/story.schema';

export type TranslatableField = 'title' | 'summary' | 'summarySafe';

/**
 * Story multi-locale fallback zinciri:
 *   1) translations[locale][field]
 *   2) translations.en[field]
 *   3) Legacy flat alan: story[field]
 *   4) '' (boş string)
 *
 * Runtime tarafında validation yok — locale bilinmeyen olsa bile EN'e düşer.
 */
export function getTranslation(
  story: Story | Record<string, any>,
  locale: string,
  field: TranslatableField,
): string {
  const translations = (story as any)?.translations as
    | Record<string, Partial<Record<TranslatableField, string>>>
    | undefined;

  const localized = translations?.[locale]?.[field];
  if (localized) return localized;

  const en = translations?.en?.[field];
  if (en) return en;

  return (story as any)?.[field] ?? '';
}
