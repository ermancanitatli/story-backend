import {
  IsArray,
  ValidateNested,
  IsString,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

class ImportUserDto {
  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  photoURL?: string;

  @IsOptional()
  @IsString()
  photoThumbnailURL?: string;

  @IsOptional()
  @IsString()
  userHandle?: string;

  @IsOptional()
  @IsNumber()
  credits?: number;

  @IsOptional()
  @IsString()
  legacyFirebaseId?: string;

  @IsOptional()
  deviceInfo?: Record<string, any>;

  @IsOptional()
  appSettings?: Record<string, any>;

  @IsOptional()
  isAnonymous?: boolean;

  @IsOptional()
  isFake?: boolean;

  @IsOptional()
  online?: boolean;

  @IsOptional()
  lastSeen?: any;

  @IsOptional()
  presenceUpdatedAt?: any;

  @IsOptional()
  premium?: Record<string, any>;

  @IsOptional()
  notificationSettings?: Record<string, any>;

  @IsOptional()
  userStats?: Record<string, any>;
}

export class BulkImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportUserDto)
  users: ImportUserDto[];
}
