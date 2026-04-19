import { MongoClient } from 'mongodb';

interface ExpectedIndex {
  collection: string;
  keys: Record<string, number>;
  unique?: boolean;
  sparse?: boolean;
  ttlDays?: number;
}

const EXPECTED: ExpectedIndex[] = [
  { collection: 'users', keys: { userHandle: 1 }, unique: true },
  { collection: 'users', keys: { email: 1 }, sparse: true },
  { collection: 'users', keys: { isBanned: 1 } },
  { collection: 'users', keys: { isDeleted: 1 } },
  { collection: 'stories', keys: { isPublished: 1, genre: 1, createdAt: -1 } },
  { collection: 'stories', keys: { tags: 1 } },
  { collection: 'admin_users', keys: { username: 1 }, unique: true },
  { collection: 'admin_audit_logs', keys: { targetUserId: 1, createdAt: -1 } },
  { collection: 'admin_audit_logs', keys: { action: 1, createdAt: -1 } },
  { collection: 'admin_audit_logs', keys: { createdAt: 1 }, ttlDays: 365 },
];

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }
  const dbName =
    process.env.MONGO_DB_PROD || process.env.MONGO_DB_DEV || 'story_prod';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  let missing = 0;
  for (const exp of EXPECTED) {
    const coll = db.collection(exp.collection);
    const indexes = await coll.indexes().catch(() => [] as any[]);
    const found = indexes.find(
      (ix: any) => JSON.stringify(ix.key) === JSON.stringify(exp.keys),
    );
    if (!found) {
      console.log(
        `❌ MISSING ${exp.collection} ${JSON.stringify(exp.keys)}`,
      );
      missing++;
    } else {
      console.log(`✅ OK ${exp.collection} ${JSON.stringify(exp.keys)}`);
    }
  }

  await client.close();
  console.log(
    `\nResult: ${EXPECTED.length - missing}/${EXPECTED.length} OK, ${missing} missing`,
  );
  process.exit(missing > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
