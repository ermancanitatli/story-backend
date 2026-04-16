import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnonymousLoginDto {
  @ApiProperty({
    description: 'Device ID from iOS Keychain (persistent across app reinstalls)',
    example: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId: string;
}
