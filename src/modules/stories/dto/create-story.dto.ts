import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import {
  StoryTranslationDto,
  StoryTranslationsMap,
} from './story-translations.dto';

@ValidatorConstraint({ name: 'EnTitleRequired', async: false })
class EnTitleRequiredConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const en = (value as Record<string, StoryTranslationDto>).en;
    return !!en && typeof en.title === 'string' && en.title.trim().length > 0;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'translations.en.title is required and must be a non-empty string';
  }
}

export class CreateStoryDto {
  /**
   * Locale → translation map. EN title zorunludur.
   * Örn: { en: { title: 'X', summary: '...' }, tr: { title: '...' } }
   */
  @IsObject()
  @IsNotEmptyObject()
  @Validate(EnTitleRequiredConstraint)
  translations!: StoryTranslationsMap;

  // Legacy flat fields (EN defaults) — PATCH'lerde update için kabul edilir
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  summarySafe?: string;

  @IsString()
  genre!: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsString()
  ageRating?: string;

  @IsBoolean()
  isPaid!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditCost?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean = false;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  coverImage?: any[];

  @IsOptional()
  @IsArray()
  galleryImages?: any[];

  @IsOptional()
  @IsArray()
  characters?: any[];

  // Chapter yapısı (title, summary, scenes, mediaItems)
  @IsOptional()
  @IsArray()
  chapters?: any[];

  // SEO / admin meta
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}
