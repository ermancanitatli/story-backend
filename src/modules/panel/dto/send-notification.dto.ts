import {
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

const SEGMENTS = [
  'all',
  'non_premium',
  'premium',
  'active_7d',
  'inactive_30d',
  'custom_user_ids',
] as const;

export type NotificationSegment = (typeof SEGMENTS)[number];

export class SendNotificationDto {
  @IsObject()
  headings: Record<string, string>;

  @IsObject()
  contents: Record<string, string>;

  @IsIn(SEGMENTS)
  segment: NotificationSegment;

  @ValidateIf((o) => o.segment === 'custom_user_ids')
  @IsArray()
  @IsString({ each: true })
  customUserIds?: string[];

  @IsOptional()
  @IsString()
  bigPicture?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @IsISO8601()
  sendAt?: string;
}

export class EstimateNotificationDto {
  @IsIn(SEGMENTS)
  segment: NotificationSegment;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customUserIds?: string[];
}
