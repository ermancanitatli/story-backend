import { IsOptional, IsString } from 'class-validator';

/**
 * Tek bir locale için story çevirisi.
 * title, summary ve summarySafe opsiyoneldir; EN için title zorunlu kuralı
 * CreateStoryDto seviyesinde uygulanır.
 */
export class StoryTranslationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  summarySafe?: string;
}

export const SUPPORTED_LOCALES = [
  'en',
  'tr',
  'ar',
  'de',
  'es',
  'fr',
  'it',
  'ja',
  'ko',
  'pt',
  'ru',
  'zh',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type StoryTranslationsMap = Partial<
  Record<SupportedLocale, StoryTranslationDto>
> & {
  en: StoryTranslationDto;
};
