import { IsString, MinLength, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString() currentPassword: string;

  @IsString()
  @MinLength(12, { message: 'Şifre en az 12 karakter olmalı' })
  @Matches(/[A-Z]/, { message: 'Şifre en az 1 büyük harf içermeli' })
  @Matches(/[0-9]/, { message: 'Şifre en az 1 rakam içermeli' })
  newPassword: string;

  @IsString() confirmPassword: string;
}
