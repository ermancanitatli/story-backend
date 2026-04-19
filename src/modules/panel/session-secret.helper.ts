import { randomBytes } from 'crypto';
import { existsSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';

/**
 * SESSION_SECRET'i resolve eder:
 *   1. process.env.SESSION_SECRET varsa onu döner.
 *   2. Yoksa proje root'undaki .env dosyasına 64-byte hex üretip ekler,
 *      aynı değeri döner. Production'da .env kalıcı volume'de olmalı.
 *   3. .env dosyasına yazılamıyorsa (readonly FS) fallback olarak değeri üretir
 *      ve process.env'e koyar — ama uyarır (cluster'larda tutarsızlığa yol açar).
 */
export function resolveSessionSecret(): string {
  const existing = process.env.SESSION_SECRET;
  if (existing && existing.length >= 16) {
    return existing;
  }

  const generated = randomBytes(32).toString('hex'); // 64 hex chars
  const envPath = join(process.cwd(), '.env');
  const line = `\nSESSION_SECRET=${generated}\n`;

  try {
    const content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    if (!/^SESSION_SECRET=/m.test(content)) {
      appendFileSync(envPath, line, { encoding: 'utf8' });
      console.log(`🔐 SESSION_SECRET auto-generated and appended to ${envPath}`);
    } else {
      // .env'de var ama process.env'e yüklenmemiş: parse et
      const match = content.match(/^SESSION_SECRET=(.+)$/m);
      if (match) {
        process.env.SESSION_SECRET = match[1].trim();
        return process.env.SESSION_SECRET;
      }
    }
  } catch (err) {
    console.warn(
      `⚠️ SESSION_SECRET could not be persisted to .env (${(err as Error).message}). ` +
        `Using in-memory secret — sessions will be invalidated on restart and inconsistent across cluster nodes. ` +
        `Set SESSION_SECRET env variable manually for production.`,
    );
  }

  process.env.SESSION_SECRET = generated;
  return generated;
}
