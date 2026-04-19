/**
 * Fix: chapters[i].mediaItems'ı scenes[0].mediaItems'tan kopyala + galleryImages orphan merge.
 *
 * Neden: iOS (StoryStore.swift) chapters[i].mediaItems okuyor ama önceki migration veriyi
 * yalnız scenes[0].mediaItems'a koymuş — iOS client'ta görseller boş görünüyor. Bu script
 * chapter-level mediaItems'ı doldurur, galleryImages'ta sadece galleryImages'ta olan orphan
 * medyaları URL'deki /chapters/N/ path'ine göre doğru chapter'a dağıtır.
 *
 * Davranış:
 *   - Her story için her chapter'da mediaItems == scenes[0].mediaItems olacak şekilde senkronlar
 *   - galleryImages'daki her item'ı URL'den chapter tespit edip ilgili chapter'ın
 *     mediaItems + scenes[0].mediaItems'ına ekler (unique by URL)
 *   - alt içinde [hidden] prefix'i olanlar → item.hidden = true, alt'tan prefix silinir
 *   - alt içinde [video] prefix'i olanlar → title = 'legacy_video' (zaten varsa korunur),
 *     alt'tan prefix silinir, mimeType = 'video/mp4' tahmini set edilir (legacy için)
 *   - Image olarak tespit edilen item'lara mimeType = 'image/*' set edilir (url uzantısına göre)
 *   - scenes[] ve galleryImages[] KORUNUR (backward-compat)
 *
 * Usage:
 *   DRY_RUN=true  MONGO_URI="..." npx ts-node scripts/migrations/fix-chapter-mediaItems.ts
 *   DRY_RUN=false MONGO_URI="..." npx ts-node scripts/migrations/fix-chapter-mediaItems.ts
 *
 * Direkt bağlantı:
 *   export MONGO_URI='mongodb://root:StoryMongo2026x@91.98.177.117:40777/story_prod?authSource=admin&directConnection=true'
 */

import { MongoClient, ObjectId } from 'mongodb';
import { randomUUID } from 'crypto';

const MONGO_URI = process.env.MONGO_URI;
const DRY_RUN = process.env.DRY_RUN !== 'false';
const PREVIEW_LIMIT = 3;

if (!MONGO_URI) {
  console.error('[migrate] MONGO_URI env zorunlu.');
  process.exit(1);
}

interface MediaItem {
  _id?: string;
  order: number;
  title?: string;
  alt?: string;
  url: string;
  thumbnail?: string;
  hidden?: boolean;
  mimeType?: string;
}

function detectMimeType(url: string, title?: string): string | undefined {
  if (title === 'legacy_video') return 'video/mp4';
  const lower = (url || '').toLowerCase().split('?')[0];
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  return undefined;
}

function extractChapterIdxFromUrl(url: string): number | null {
  const m = (url || '').match(/\/chapters\/(\d+)\//);
  return m ? parseInt(m[1], 10) : null;
}

function normalize(m: any, fallbackOrder: number): MediaItem {
  const alt: string = typeof m.alt === 'string' ? m.alt : '';
  const isHiddenByAlt = alt.includes('[hidden]');
  const isVideoByAlt = alt.includes('[video]');
  const cleanAlt = alt
    .replace(/\[hidden\]/g, '')
    .replace(/\[video\]/g, '')
    .trim();

  const out: MediaItem = {
    _id: m._id || randomUUID(),
    order: typeof m.order === 'number' ? m.order : fallbackOrder,
    url: m.url,
    thumbnail: m.thumbnail,
    title: m.title,
    alt: cleanAlt || undefined,
    hidden: m.hidden === true || isHiddenByAlt,
    mimeType: m.mimeType || detectMimeType(m.url, m.title),
  };

  if (!out.title && (isVideoByAlt || out.mimeType?.startsWith('video/'))) {
    out.title = 'legacy_video';
  }
  return out;
}

function dedupeByUrl(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const it of items) {
    if (!it.url || seen.has(it.url)) continue;
    seen.add(it.url);
    out.push(it);
  }
  return out;
}

async function main() {
  const client = new MongoClient(MONGO_URI!);
  await client.connect();
  const db = client.db();
  const stories = db.collection('stories');

  console.log(`[migrate] DRY_RUN=${DRY_RUN} | DB=${db.databaseName}`);

  const storyDocs = await stories
    .find({}, { projection: { _id: 1, title: 1, chapters: 1, galleryImages: 1 } })
    .toArray();

  console.log(`[migrate] Toplam story: ${storyDocs.length}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;
  let previewShown = 0;
  const ops: any[] = [];

  for (const story of storyDocs) {
    processed++;
    try {
      const chapters: any[] = Array.isArray(story.chapters) ? story.chapters : [];
      if (chapters.length === 0) {
        skipped++;
        continue;
      }

      // 1) Build per-chapter media maps from scenes[0].mediaItems
      const perChapter: MediaItem[][] = chapters.map((ch: any) => {
        const scArr: any[] =
          (ch.scenes && ch.scenes[0] && ch.scenes[0].mediaItems) || [];
        const existingChapMedia: any[] = Array.isArray(ch.mediaItems) ? ch.mediaItems : [];
        // Prefer scenes[0].mediaItems as the authoritative source (migration source)
        const source = scArr.length > 0 ? scArr : existingChapMedia;
        return source.map((m: any, i: number) => normalize(m, i));
      });

      // 2) Merge orphan galleryImages into proper chapter by URL
      const galleryImgs: any[] = Array.isArray(story.galleryImages)
        ? story.galleryImages
        : [];
      let orphansMerged = 0;
      const allUrls = new Set<string>();
      perChapter.forEach((arr) => arr.forEach((m) => allUrls.add(m.url)));

      for (const g of galleryImgs) {
        if (!g?.url || allUrls.has(g.url)) continue;
        const chIdx = extractChapterIdxFromUrl(g.url);
        if (chIdx === null || chIdx < 0 || chIdx >= chapters.length) continue;
        const normalized = normalize(g, perChapter[chIdx].length);
        perChapter[chIdx].push(normalized);
        allUrls.add(g.url);
        orphansMerged++;
      }

      // 3) Dedupe + sort by order
      const finalPerChapter = perChapter.map((arr) =>
        dedupeByUrl(arr)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((m, i) => ({ ...m, order: i })),
      );

      // 4) Build update: chapters[i].mediaItems = finalPerChapter[i],
      //    and chapters[i].scenes[0].mediaItems = same (dual-write)
      const setObj: any = {};
      for (let i = 0; i < chapters.length; i++) {
        setObj[`chapters.${i}.mediaItems`] = finalPerChapter[i];
        const ch = chapters[i];
        const hasScene = Array.isArray(ch.scenes) && ch.scenes.length > 0;
        if (hasScene) {
          setObj[`chapters.${i}.scenes.0.mediaItems`] = finalPerChapter[i];
        } else if (finalPerChapter[i].length > 0) {
          // Create a scene if none exists and we have media
          setObj[`chapters.${i}.scenes`] = [
            {
              title: ch.title || 'Scene',
              description: ch.summary || '',
              mediaItems: finalPerChapter[i],
            },
          ];
        }
      }

      if (previewShown < PREVIEW_LIMIT) {
        previewShown++;
        console.log(
          `\n[migrate][preview ${previewShown}/${PREVIEW_LIMIT}] ${story._id} "${story.title}"`,
        );
        console.log(`  orphan merged from galleryImages: ${orphansMerged}`);
        finalPerChapter.forEach((arr, i) => {
          const imgs = arr.filter((m) => !m.mimeType?.startsWith('video/')).length;
          const vids = arr.filter((m) => m.mimeType?.startsWith('video/')).length;
          const hidden = arr.filter((m) => m.hidden).length;
          console.log(
            `  ch[${i}] "${chapters[i].title}" total=${arr.length} img=${imgs} vid=${vids} hidden=${hidden}`,
          );
        });
      }

      ops.push({
        updateOne: {
          filter: { _id: story._id },
          update: { $set: setObj },
        },
      });
      updated++;

      if (ops.length >= 50 && !DRY_RUN) {
        const res = await stories.bulkWrite(ops, { ordered: false });
        console.log(
          `[migrate] bulkWrite flush → matched=${res.matchedCount} modified=${res.modifiedCount}`,
        );
        ops.length = 0;
      }
    } catch (err) {
      errored++;
      console.error(`[migrate][error] ${story._id}: ${(err as Error).message}`);
    }
  }

  if (ops.length > 0 && !DRY_RUN) {
    const res = await stories.bulkWrite(ops, { ordered: false });
    console.log(
      `[migrate] final flush → matched=${res.matchedCount} modified=${res.modifiedCount}`,
    );
  }

  console.log(`\n[migrate] === özet ===`);
  console.log(`  processed      : ${processed}`);
  console.log(`  will/did update: ${updated}`);
  console.log(`  skipped        : ${skipped}`);
  console.log(`  errored        : ${errored}`);
  console.log(`  DRY_RUN        : ${DRY_RUN}`);

  if (DRY_RUN) {
    console.log(
      `\n[migrate] DRY_RUN aktifti — hiçbir yazma yapılmadı. DRY_RUN=false ile tekrar çalıştırın.`,
    );
  }

  await client.close();
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
