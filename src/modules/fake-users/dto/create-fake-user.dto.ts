import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFakeUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  languageCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: 'male | female' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class BulkCreateDto {
  @ApiPropertyOptional({ description: 'Otomatik üretilecek fake user sayısı' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  count?: number;

  @ApiPropertyOptional({ description: 'Manuel olarak tanımlanmış fake user listesi' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFakeUserDto)
  items?: CreateFakeUserDto[];
}
