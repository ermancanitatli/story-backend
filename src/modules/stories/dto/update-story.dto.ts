import { PartialType } from '@nestjs/swagger';
import { CreateStoryDto } from './create-story.dto';

/**
 * Admin update DTO. Tüm alanlar opsiyoneldir; sadece gönderilen alanlar
 * güncellenir. EN title zorunluluğu yalnız CREATE için geçerlidir.
 */
export class UpdateStoryDto extends PartialType(CreateStoryDto) {}
