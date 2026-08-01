import { All, Controller, GoneException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ErrorCodes } from '../../common/filters/error-codes';

/**
 * Singleplayer (story-sessions) TOMBSTONE controller.
 *
 * Ürün multiplayer-only'ye geçtiği için tüm singleplayer route'ları kaldırıldı:
 *   POST   /api/story-sessions
 *   GET    /api/story-sessions
 *   GET    /api/story-sessions/:id
 *   GET    /api/story-sessions/:id/progress
 *   POST   /api/story-sessions/:id/choice
 *   DELETE /api/story-sessions/batch
 *   DELETE /api/story-sessions/:id
 *
 * Hepsi 410 Gone döner — 404 değil. 404 "yanlış yol / geçici" sinyali verir ve
 * eski istemciler retry eder; 410 "kalıcı olarak kaldırıldı" demektir.
 *
 * @Public(): JWT guard bypass edilir. Aksi halde token'ı expire olmuş eski bir
 * istemci 401 alır ve gerçek sebebi (özellik kaldırıldı) asla göremez.
 *
 * NOT: `story_sessions` / `story_progress` collection'ları ve şema dosyaları
 * DURUYOR — veri dışa aktarımı ve panel istatistikleri hâlâ okuyor
 * (stories.module + panel.module kendi forFeature kaydını yapıyor).
 */
@ApiTags('Story Sessions (removed)')
@Controller('story-sessions')
export class StorySessionsController {
  @Public()
  @All(['/', '*'])
  @ApiOperation({
    summary: 'REMOVED — singleplayer kaldırıldı, tüm alt route\'lar 410 döner',
  })
  @ApiResponse({ status: 410, description: 'ENDPOINT_REMOVED' })
  gone(): never {
    throw new GoneException({
      code: ErrorCodes.ENDPOINT_REMOVED,
      message:
        'Singleplayer story sessions have been permanently removed. This app is multiplayer-only.',
    });
  }
}
