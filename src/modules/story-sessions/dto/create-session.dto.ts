import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({ description: 'Story ID' })
  @IsString()
  @IsNotEmpty()
  storyId: string;

  @ApiPropertyOptional({ description: 'Character customizations' })
  @IsOptional()
  @IsObject()
  customizations?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Player display name' })
  @IsOptional()
  @IsString()
  playerName?: string;

  @ApiPropertyOptional({ description: 'Player gender' })
  @IsOptional()
  @IsString()
  playerGender?: string;

  @ApiPropertyOptional({ description: 'Language code' })
  @IsOptional()
  @IsString()
  languageCode?: string;
}
