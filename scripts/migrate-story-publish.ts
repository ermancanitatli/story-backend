/**
 * STORY-03 — isPublished migration
 *
 * Schema'da `isPublished` default `false` olarak eklendi. Mevcut hikayelerin
 * gizlenmemesi için bu script, `isPublished` alanı olmayan tüm dokümanları
 * `true` olarak işaretler.
 *
 * Çalıştırma:
 *   MONGODB_URI=... MONGO_DB_PROD=story_prod npx ts-node scripts/migrate-story-publish.ts
 */
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required');

  const dbName = process.env.MONGO_DB_PROD || 'story_prod';
  await mongoose.connect(uri, { dbName });

  const res = await mongoose.connection
    .collection('stories')
    .updateMany(
      { isPublished: { $exists: false } },
      { $set: { isPublished: true } },
    );

  console.log('Updated:', res.modifiedCount);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
