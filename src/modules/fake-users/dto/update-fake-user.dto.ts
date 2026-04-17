import { IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFakeUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

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
  languageCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoURL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoThumbnailURL?: string;
}

export class BulkUpdateDto {
  @ApiProperty({ description: 'Güncellenecek fake user ID listesi' })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  languageCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;
}

export class BulkDeleteDto {
  @ApiProperty({ description: 'Silinecek fake user ID listesi' })
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

export class SetCountryDto {
  @ApiProperty({ description: 'Atanacak ülke kodu' })
  @IsString()
  countryCode: string;
}
