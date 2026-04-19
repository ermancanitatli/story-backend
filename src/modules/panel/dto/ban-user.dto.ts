import { IsOptional, IsString, IsISO8601 } from 'class-validator';

export class BanUserDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsISO8601() until?: string; // null/yok = permanent
}
