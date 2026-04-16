import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitChoiceDto {
  @ApiProperty({ description: 'Choice ID (1-4)' })
  @IsString()
  @IsNotEmpty()
  choiceId: string;

  @ApiProperty({ description: 'Choice text' })
  @IsString()
  @IsNotEmpty()
  choiceText: string;

  @ApiPropertyOptional({ description: 'Choice type (action, dialogue, exploration, decision)' })
  @IsOptional()
  @IsString()
  choiceType?: string;

  @ApiPropertyOptional({ description: 'Custom user input (not from choices list)' })
  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;
}
