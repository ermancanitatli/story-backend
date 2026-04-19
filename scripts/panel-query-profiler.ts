/**
 * Panel list endpoint'lerinde N+1 query tespit script'i.
 *
 * Kullanım:
 *   NODE_ENV=development MONGODB_URI=... npx ts-node scripts/panel-query-profiler.ts
 *
 * Mongoose debug log'larını yakalar, her endpoint başına query sayısını ölçer.
 */
import mongoose from 'mongoose';

const QUERY_THRESHOLD = 3;

async function main() {
  let queryCount = 0;
  mongoose.set('debug', (collection: string, method: string) => {
    queryCount++;
    console.log(`  [${queryCount}] ${collection}.${method}`);
  });

  // Her endpoint için basit GET simülasyonu
  const endpoints = [
    { name: '/panel/api/users', url: 'http://localhost:3000/panel/api/users?limit=50' },
    { name: '/panel/api/stories', url: 'http://localhost:3000/panel/api/stories?limit=50' },
    { name: '/panel/api/notifications/history', url: 'http://localhost:3000/panel/api/notifications/history?limit=50' },
    { name: '/panel/api/audit-logs', url: 'http://localhost:3000/panel/api/audit-logs?limit=50' },
  ];

  console.log('\n⚠️  Bu script backend ayakta olmasını + admin session cookie gerektirir.');
  console.log('Manuel test: her endpoint için Mongo debug çıktısını incele.\n');

  for (const ep of endpoints) {
    queryCount = 0;
    console.log(`\n=== ${ep.name} ===`);
    try {
      const res = await fetch(ep.url);
      console.log(`  HTTP ${res.status}, query count: ${queryCount}`);
      if (queryCount > QUERY_THRESHOLD) {
        console.log(`  ❌ WARN: ${queryCount} query > threshold ${QUERY_THRESHOLD}`);
      } else {
        console.log(`  ✅ OK`);
      }
    } catch (err) {
      console.log(`  SKIP: ${(err as Error).message}`);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
