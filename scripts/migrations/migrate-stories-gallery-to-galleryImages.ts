/**
 * Legacy stories_gallery → stories.galleryImages migration
 *
 * Bağlam:
 *   Firestore'dan migrate edilirken hikayeye ait görseller/videolar ayrı bir
 *   `stories_gallery` koleksiyonuna yazılmış. `story_id` alanı story'nin
 *   `legacyFirestoreId` değerine karşılık geliyor. Yeni şema tüm medyayı
 *   `stories.galleryImages[]` array'inde tutuyor (MediaItem[]). Bu script
 *   `stories_gallery` doc'larını join edip ilgili story'nin `galleryImages`
 *   array'ine kopyalar.
 *
 * Davranış:
 *   - Her story için legacyFirestoreId ile eşleşen tüm stories_gallery doc'larını çek
 *   - type=image ve type=video ikisini de taşı (video MediaItem olarak, title='legacy_video')
 *   - `order` alanına göre sırala (ASC)
 *   - `hidden: true` olan kayıtların `alt` alanına `[hidden]` prefix koy
 *   - Mevcut `galleryImages` doluysa doc'u atla (double-migration koruması)
 *   - stories_gallery koleksiyonuna DOKUNMA (silme). Yedek kalsın.
 *
 * Usage:
 *   DRY_RUN=true MONGO_URI="..." npx ts-node scripts/migrations/migrate-stories-gallery-to-galleryImages.ts
 *   DRY_RUN=false MONGO_URI="..." npx ts-node scripts/migrations/migrate-stories-gallery-to-galleryImages.ts
 *
 * Direkt bağlantı (CLAUDE.md):
 *   export MONGO_URI='mongodb://root:StoryMongo2026x@91.98.177.117:40777/story_prod?authSource=admin&directConnection=true'
 */

import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI;
const DRY_RUN = process.env.DRY_RUN !== 'false';
const PREVIEW_LIMIT = 3;

if (!MONGO_URI) {
  console.error('[migrate] MONGO_URI env zorunlu.');
  process.exit(1);
}

interface GalleryDoc {
  _id: string;
  story_id?: string;
  legacyFirestoreId?: string;
  type: 'image' | 'video';
  url: string;
  thumbnail_url?: string;
  order?: number;
  hidden?: boolean;
  metadata?: { original_name?: string; mime_type?: string; size?: number; source?: string };
}

interface MediaItem {
  _id?: string;
  order: number;
  title?: string;
  alt?: string;
  url: string;
  thumbnail?: string;
}

function toMediaItem(g: GalleryDoc, idx: number): MediaItem {
  const altParts: string[] = [];
  if (g.hidden) altParts.push('[hidden]');
  if (g.type === 'video') altParts.push('[video]');
  if (g.metadata?.original_name) altParts.push(g.metadata.original_name);

  return {
    _id: g._id,
    order: typeof g.order === 'number' ? g.order : idx,
    title: g.type === 'video' ? 'legacy_video' : undefined,
    alt: altParts.length ? altParts.join(' ') : undefined,
    url: g.url,
    thumbnail: g.thumbnail_url || undefined,
  };
}

async function main() {
  const client = new MongoClient(MONGO_URI!);
  await client.connect();
  const db = client.db();
  const stories = db.collection('stories');
  const galleryCol = db.collection<GalleryDoc>('stories_gallery');

  console.log(`[migrate] DRY_RUN=${DRY_RUN} | DB=${db.databaseName}`);

  const storyDocs = await stories
    .find({ legacyFirestoreId: { $exists: true, $ne: null } })
    .project({ _id: 1, title: 1, legacyFirestoreId: 1, galleryImages: 1 })
    .toArray();

  console.log(`[migrate] Aday story sayısı (legacyFirestoreId olan): ${storyDocs.length}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;
  let previewShown = 0;

  const ops: any[] = [];

  for (const story of storyDocs) {
    processed++;
    try {
      const legacyId = story.legacyFirestoreId as string;
      const existing = story.galleryImages as MediaItem[] | undefined;
      if (existing && existing.length > 0) {
        console.log(`[migrate][skip] ${story._id} "${story.title}" — galleryImages zaten dolu (${existing.length})`);
        skipped++;
        continue;
      }

      const galleryItems = await galleryCol
        .find({ story_id: legacyId })
        .sort({ order: 1, created_at: 1 })
        .toArray();

      if (galleryItems.length === 0) {
        skipped++;
        continue;
      }

      const mediaItems = galleryItems.map((g, i) => toMediaItem(g, i));

      if (previewShown < PREVIEW_LIMIT) {
        previewShown++;
        console.log(`\n[migrate][preview ${previewShown}/${PREVIEW_LIMIT}] ${story._id} "${story.title}" legacyId=${legacyId}`);
        console.log(`  galleryImages eklenecek: ${mediaItems.length} (image+video karışık)`);
        console.log(`  ilk item: ${JSON.stringify(mediaItems[0], null, 2)}`);
        const types = mediaItems.reduce<Record<string, number>>((acc, m) => {
          const k = m.title === 'legacy_video' ? 'video' : 'image';
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {});
        console.log(`  tür dağılımı: ${JSON.stringify(types)}`);
        const hiddenCount = mediaItems.filter((m) => m.alt?.includes('[hidden]')).length;
        console.log(`  hidden: ${hiddenCount}`);
      }

      ops.push({
        updateOne: {
          filter: { _id: story._id },
          update: { $set: { galleryImages: mediaItems } },
        },
      });
      updated++;

      if (ops.length >= 100 && !DRY_RUN) {
        const res = await stories.bulkWrite(ops, { ordered: false });
        console.log(`[migrate] bulkWrite flush → matched=${res.matchedCount} modified=${res.modifiedCount}`);
        ops.length = 0;
      }

      if (processed % 50 === 0) {
        console.log(`[migrate] progress: ${processed}/${storyDocs.length}`);
      }
    } catch (err) {
      errored++;
      console.error(`[migrate][error] ${story._id}: ${(err as Error).message}`);
    }
  }

  if (ops.length > 0 && !DRY_RUN) {
    const res = await stories.bulkWrite(ops, { ordered: false });
    console.log(`[migrate] bulkWrite final flush → matched=${res.matchedCount} modified=${res.modifiedCount}`);
  }

  console.log(`\n[migrate] === özet ===`);
  console.log(`  processed      : ${processed}`);
  console.log(`  will/did update: ${updated}`);
  console.log(`  skipped        : ${skipped}`);
  console.log(`  errored        : ${errored}`);
  console.log(`  DRY_RUN        : ${DRY_RUN}`);

  if (DRY_RUN) {
    console.log(`\n[migrate] DRY_RUN aktifti — hiçbir yazma yapılmadı. DRY_RUN=false ile tekrar çalıştırın.`);
  } else {
    console.log(`\n[migrate] NOT: stories_gallery koleksiyonuna dokunulmadı — yedek olarak duruyor.`);
  }

  await client.close();
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
