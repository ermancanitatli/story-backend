import { IsOptional, IsString, IsEmail, IsNumber, Min, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PremiumInput {
  @IsOptional() @IsBoolean() isPremium?: boolean;
  @IsOptional() @IsString() plan?: string;
  @IsOptional() @IsString() expiresAt?: string;
}

export class AdminUpdateUserDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() userHandle?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsNumber() @Min(0) credits?: number;
  @IsOptional() @ValidateNested() @Type(() => PremiumInput) premium?: PremiumInput;
}
