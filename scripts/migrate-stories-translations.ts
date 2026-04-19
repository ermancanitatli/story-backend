/* eslint-disable no-console */
/**
 * STORY-01 migration
 *
 * Her story dokümanı için `translations.en` yoksa mevcut flat
 * `title` / `summary` / `summarySafe` alanlarını EN translation olarak kopyalar.
 *
 * Idempotent: zaten `translations.en` doldurulmuş dokümanlara dokunulmaz.
 *
 * Çalıştırma:
 *   MONGODB_URI="mongodb://..." npx ts-node scripts/migrate-stories-translations.ts
 */
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[migrate] MONGODB_URI env variable is required.');
    process.exit(1);
  }

  console.log('[migrate] Connecting to MongoDB...');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('[migrate] No database handle after connect.');
    process.exit(1);
  }
  const collection = db.collection('stories');

  const total = await collection.countDocuments({});
  console.log(`[migrate] stories collection: ${total} documents total.`);

  const cursor = collection.find({}, { projection: { title: 1, summary: 1, summarySafe: 1, translations: 1 } });

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  while (await cursor.hasNext()) {
    const doc: any = await cursor.next();
    if (!doc) break;
    scanned++;

    const hasEnTranslation =
      doc.translations && typeof doc.translations === 'object' && doc.translations.en && typeof doc.translations.en === 'object';

    if (hasEnTranslation) {
      skipped++;
    } else {
      const enTranslation: Record<string, string> = {};
      if (typeof doc.title === 'string' && doc.title.length > 0) enTranslation.title = doc.title;
      if (typeof doc.summary === 'string' && doc.summary.length > 0) enTranslation.summary = doc.summary;
      if (typeof doc.summarySafe === 'string' && doc.summarySafe.length > 0) enTranslation.summarySafe = doc.summarySafe;

      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            'translations.en': enTranslation,
          },
        },
      );
      updated++;
    }

    if (scanned % 100 === 0) {
      console.log(`[migrate] progress: scanned=${scanned}/${total} updated=${updated} skipped=${skipped}`);
    }
  }

  console.log(
    `[migrate] done. scanned=${scanned} updated=${updated} skipped(idempotent)=${skipped}`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[migrate] failed:', err);
  try {
    await mongoose.disconnect();
  } catch {
    /* noop */
  }
  process.exit(1);
});
