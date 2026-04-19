import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
    if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
  }
  return undefined;
};

export class ListStoryQueryDto {
  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  sortBy: string = 'updatedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';
}
