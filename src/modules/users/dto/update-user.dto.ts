import { IsOptional, IsString, MaxLength, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoURL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoThumbnailURL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  userHandle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  deviceInfo?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  notificationSettings?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  oneSignalPlayerId?: string;
}
