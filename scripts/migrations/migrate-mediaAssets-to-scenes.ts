/**
 * Legacy mediaAssets → scenes migration
 * Usage:
 *   DRY_RUN=true MONGO_URI="mongodb://..." npx ts-node scripts/migrations/migrate-mediaAssets-to-scenes.ts
 *   DRY_RUN=false MONGO_URI="mongodb://..." npx ts-node scripts/migrations/migrate-mediaAssets-to-scenes.ts
 *
 * MongoDB tunnel (CLAUDE.md protocol):
 *   pkill -f "ssh.*L 27017:localhost:31889"
 *   sshpass -p '...' ssh -fN -L 27017:localhost:31889 root@91.98.177.117
 *   export MONGO_URI='mongodb://root:StoryMongo2026x@localhost:27017/story_prod?authSource=admin&directConnection=true'
 *   DRY_RUN=true npx ts-node scripts/migrations/migrate-mediaAssets-to-scenes.ts
 *
 * ⚠️ Bu script ÇALIŞTIRILMADI — manuel review gerekli. Önce dev DB'de test et.
 *
 * Amaç:
 *   Eski Firestore formatındaki `chapters[i].mediaAssets: { videos: [...], images: [...] }`
 *   alanını yeni şemaya (`chapters[i].scenes: StoryScene[]` → her sahne `MediaItem[]`)
 *   tek bir "Legacy Scene" içine normalize ederek taşır; ardından `mediaAssets` alanını
 *   `$unset` ile temizler.
 *
 *   Chapter'da zaten dolu bir `scenes` dizisi varsa (length > 0) — migration atlanır
 *   (kullanıcı manuel çalışmasının üzerine yazmamak için).
 */

import {
  MongoClient,
  AnyBulkWriteOperation,
  Document as MongoDocument,
  ObjectId,
} from 'mongodb';

// ---- Types (schema ile birebir uyumlu, runtime'da validate edilmez) ----

interface LegacyMediaAssetImage {
  order?: number;
  url?: string;
  thumbnail?: string;
  hidden?: boolean;
  alt?: string;
  title?: string;
}

interface LegacyMediaAssetVideo {
  order?: number;
  url?: string;
  thumbnail?: string;
  title?: string;
}

interface LegacyMediaAssets {
  videos?: LegacyMediaAssetVideo[];
  images?: LegacyMediaAssetImage[];
}

interface MediaItem {
  order: number;
  url: string;
  thumbnail?: string;
  title?: string;
  alt?: string;
}

interface StoryScene {
  title?: string;
  description?: string;
  mediaItems?: MediaItem[];
}

interface StoryChapter {
  title?: string;
  summary?: string;
  description?: string; // legacy alan — scene description için kaynak
  order?: number;
  scenes?: StoryScene[];
  mediaItems?: MediaItem[];
  mediaAssets?: LegacyMediaAssets;
}

interface StoryDoc extends MongoDocument {
  _id: ObjectId;
  title?: string;
  chapters?: StoryChapter[];
}

// ---- Config ----

const MONGO_URI = process.env.MONGO_URI;
const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const DB_NAME = process.env.DB_NAME ?? 'story_prod';
const COLLECTION = 'stories';
const PROGRESS_EVERY = 50;
const SAMPLE_PREVIEW_COUNT = 3;

if (!MONGO_URI) {
  console.error('[migrate] MONGO_URI env zorunlu — çıkılıyor.');
  process.exit(1);
}

// ---- Helpers ----

/**
 * Legacy bir image node'unu yeni MediaItem'a dönüştürür.
 * `hidden: true` olanların `alt` alanına "[hidden]" prefix eklenir ki UI'da ayırt edilsin.
 */
function imageToMediaItem(
  img: LegacyMediaAssetImage,
  fallbackOrder: number,
): MediaItem | null {
  if (!img || !img.url) return null;
  const existingAlt = (img.alt ?? '').trim();
  const hiddenPrefix = img.hidden ? '[hidden]' : '';
  const alt =
    hiddenPrefix && existingAlt
      ? `${hiddenPrefix} ${existingAlt}`
      : hiddenPrefix || existingAlt;

  const item: MediaItem = {
    order: typeof img.order === 'number' ? img.order : fallbackOrder,
    url: img.url,
  };
  if (img.thumbnail) item.thumbnail = img.thumbnail;
  if (alt) item.alt = alt;
  if (img.title) item.title = img.title;
  return item;
}

/**
 * Legacy bir video node'unu yeni MediaItem'a dönüştürür.
 * Video'ları image'lardan ayırt edebilmek için `title: 'legacy_video'` konur
 * (başka title yoksa).
 */
function videoToMediaItem(
  vid: LegacyMediaAssetVideo,
  fallbackOrder: number,
): MediaItem | null {
  if (!vid || !vid.url) return null;
  const item: MediaItem = {
    order: typeof vid.order === 'number' ? vid.order : fallbackOrder,
    url: vid.url,
    title: vid.title && vid.title.trim().length > 0 ? vid.title : 'legacy_video',
  };
  if (vid.thumbnail) item.thumbnail = vid.thumbnail;
  return item;
}

/**
 * Bir chapter için migration sonucu oluşturulacak yeni `scenes` dizisini üretir.
 * - `scenes` zaten doluysa (length > 0) null döner → migration atlanır.
 * - `mediaAssets` yoksa null döner → yapılacak iş yok.
 * - Aksi halde tek bir "Legacy Scene" içeren dizi döner.
 */
function buildScenesForChapter(chapter: StoryChapter): StoryScene[] | null {
  const hasExistingScenes = Array.isArray(chapter.scenes) && chapter.scenes.length > 0;
  if (hasExistingScenes) return null;

  const legacy = chapter.mediaAssets;
  if (!legacy) return null;

  const images = Array.isArray(legacy.images) ? legacy.images : [];
  const videos = Array.isArray(legacy.videos) ? legacy.videos : [];

  const mediaItems: MediaItem[] = [];

  images.forEach((img, idx) => {
    const item = imageToMediaItem(img, idx);
    if (item) mediaItems.push(item);
  });

  videos.forEach((vid, idx) => {
    // Video order'ları image sıralamasının ardına yerleştir ki çakışma olsa bile deterministic olsun.
    const item = videoToMediaItem(vid, images.length + idx);
    if (item) mediaItems.push(item);
  });

  // Hiç asset yoksa bile mediaAssets key'i vardı — yine de temiz bir scene oluştur ama
  // mediaItems boşsa scene oluşturmanın bir anlamı yok → null dön, $unset yine uygulansın
  // diye ayrı bir sinyal gerekecek. Bunu caller tarafında handle ediyoruz.
  if (mediaItems.length === 0) {
    return [];
  }

  // Order'a göre sırala (stabil; image'lar önce, video'lar sonra).
  mediaItems.sort((a, b) => a.order - b.order);

  const scene: StoryScene = {
    title: chapter.title && chapter.title.trim().length > 0 ? chapter.title : 'Legacy Scene',
    description: chapter.description ?? '',
    mediaItems,
  };

  return [scene];
}

interface ChapterMigrationResult {
  chapterIndex: number;
  action: 'add-scenes' | 'skip-existing-scenes' | 'empty-mediaAssets' | 'no-mediaAssets';
  newScenes?: StoryScene[];
}

/**
 * Bir story doc'u için tüm chapter'ları tarar, migration planını çıkarır.
 * Document-level bulkWrite operasyonları caller tarafından oluşturulur.
 */
function planStoryMigration(doc: StoryDoc): ChapterMigrationResult[] {
  const results: ChapterMigrationResult[] = [];
  const chapters = Array.isArray(doc.chapters) ? doc.chapters : [];

  chapters.forEach((chapter, index) => {
    if (!chapter.mediaAssets) {
      results.push({ chapterIndex: index, action: 'no-mediaAssets' });
      return;
    }

    const scenes = buildScenesForChapter(chapter);

    if (scenes === null) {
      results.push({ chapterIndex: index, action: 'skip-existing-scenes' });
      return;
    }

    if (scenes.length === 0) {
      // mediaAssets var ama içi boş → sadece unset yapılacak, yeni scene yaratma.
      results.push({ chapterIndex: index, action: 'empty-mediaAssets' });
      return;
    }

    results.push({
      chapterIndex: index,
      action: 'add-scenes',
      newScenes: scenes,
    });
  });

  return results;
}

// ---- Main ----

async function main(): Promise<void> {
  console.log('[migrate] === mediaAssets → scenes migration ===');
  console.log(`[migrate] DRY_RUN=${DRY_RUN}`);
  console.log(`[migrate] DB=${DB_NAME} collection=${COLLECTION}`);

  const client = new MongoClient(MONGO_URI!);
  await client.connect();

  try {
    const db = client.db(DB_NAME);
    const coll = db.collection<StoryDoc>(COLLECTION);

    const filter = { 'chapters.mediaAssets': { $exists: true } };
    const totalMatching = await coll.countDocuments(filter);
    console.log(`[migrate] Match eden doc sayısı: ${totalMatching}`);

    if (totalMatching === 0) {
      console.log('[migrate] Migrate edilecek doc yok — çıkılıyor.');
      return;
    }

    const cursor = coll.find(filter);

    let processed = 0;
    let willUpdate = 0;
    let skippedNoChanges = 0;
    let errored = 0;
    let previewsPrinted = 0;

    // Küçük batch'lerle bulkWrite akıtmak için buffer.
    const bulkOps: AnyBulkWriteOperation<StoryDoc>[] = [];
    const BULK_FLUSH_SIZE = 100;

    const flushBulk = async (): Promise<void> => {
      if (bulkOps.length === 0) return;
      if (DRY_RUN) {
        bulkOps.length = 0;
        return;
      }
      try {
        const res = await coll.bulkWrite(bulkOps, { ordered: false });
        console.log(
          `[migrate] bulkWrite flush → matched=${res.matchedCount} modified=${res.modifiedCount}`,
        );
      } catch (err) {
        console.error('[migrate] bulkWrite hata:', err);
      } finally {
        bulkOps.length = 0;
      }
    };

    for await (const doc of cursor) {
      processed += 1;
      try {
        const plan = planStoryMigration(doc);

        const actionable = plan.filter(
          (p) => p.action === 'add-scenes' || p.action === 'empty-mediaAssets',
        );

        if (actionable.length === 0) {
          skippedNoChanges += 1;
        } else {
          willUpdate += 1;

          // Set ve unset operasyonlarını tek update'te birleştir.
          const setOps: Record<string, StoryScene[]> = {};
          const unsetOps: Record<string, ''> = {};

          for (const p of plan) {
            if (p.action === 'add-scenes' && p.newScenes) {
              setOps[`chapters.${p.chapterIndex}.scenes`] = p.newScenes;
              unsetOps[`chapters.${p.chapterIndex}.mediaAssets`] = '';
            } else if (p.action === 'empty-mediaAssets') {
              unsetOps[`chapters.${p.chapterIndex}.mediaAssets`] = '';
            }
          }

          // İlk N doc için dry-run preview yazdır.
          if (previewsPrinted < SAMPLE_PREVIEW_COUNT) {
            previewsPrinted += 1;
            console.log(
              `\n[migrate][preview ${previewsPrinted}/${SAMPLE_PREVIEW_COUNT}] doc _id=${String(doc._id)} title="${doc.title ?? ''}"`,
            );
            console.log(
              '  plan:',
              plan.map((p) => ({ chapter: p.chapterIndex, action: p.action })),
            );
            console.log('  $set keys:', Object.keys(setOps));
            console.log('  $unset keys:', Object.keys(unsetOps));
            const firstSceneKey = Object.keys(setOps)[0];
            if (firstSceneKey) {
              const scene = setOps[firstSceneKey][0];
              console.log(
                '  sample scene → title:',
                scene.title,
                '| mediaItems:',
                (scene.mediaItems ?? []).length,
                '| first item:',
                (scene.mediaItems ?? [])[0],
              );
            }
          }

          const update: Record<string, unknown> = {};
          if (Object.keys(setOps).length > 0) update.$set = setOps;
          if (Object.keys(unsetOps).length > 0) update.$unset = unsetOps;

          bulkOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update,
            },
          });

          if (bulkOps.length >= BULK_FLUSH_SIZE) {
            await flushBulk();
          }
        }
      } catch (err) {
        errored += 1;
        console.error(
          `[migrate] doc _id=${String(doc._id)} işlenirken hata:`,
          err,
        );
        // Hata olursa tek doc düşsün, diğerleri devam etsin.
      }

      if (processed % PROGRESS_EVERY === 0) {
        console.log(
          `[migrate] progress: processed=${processed}/${totalMatching} willUpdate=${willUpdate} skipped=${skippedNoChanges} errored=${errored}`,
        );
      }
    }

    // Kalan buffer'ı flush et.
    await flushBulk();

    console.log('\n[migrate] === özet ===');
    console.log(`  processed      : ${processed}`);
    console.log(`  will/did update: ${willUpdate}`);
    console.log(`  skipped        : ${skippedNoChanges}`);
    console.log(`  errored        : ${errored}`);
    console.log(`  DRY_RUN        : ${DRY_RUN}`);
    if (DRY_RUN) {
      console.log(
        '\n[migrate] DRY_RUN aktifti — hiçbir yazma yapılmadı. DRY_RUN=false ile tekrar çalıştırın.',
      );
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('[migrate] fatal error:', err);
  process.exit(1);
});
