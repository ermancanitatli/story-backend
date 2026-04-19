import { ArrayNotEmpty, IsArray, IsIn, IsInt, Min } from 'class-validator';

export class ReorderImagesDto {
  @IsIn(['cover', 'gallery'])
  type!: 'cover' | 'gallery';

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  orderedIndexes!: number[];
}
