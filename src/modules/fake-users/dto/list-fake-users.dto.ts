import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListFakeUsersDto {
  @ApiPropertyOptional({ description: 'Arama terimi (displayName, userHandle)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number = 25;

  @ApiPropertyOptional({ description: 'Ülke koduna göre filtrele' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Cinsiyete göre filtrele (male | female)' })
  @IsOptional()
  @IsString()
  gender?: string;
}
