/**
 * Chapter Transition Test — rasgele choice seçerek pacing davranışını gözlemler.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 STORY_ID=69e13e00312e6ba98b92db0a MAX_STEPS=30 \
 *     npx ts-node scripts/test-chapter-transition.ts
 *
 * ENV:
 *   BASE_URL     — default http://localhost:3000
 *   STORY_ID     — zorunlu
 *   MAX_STEPS    — default 30
 *   LANGUAGE     — default 'tr'
 *   SEED         — opsiyonel, tekrar edilebilir rasgelelik için
 *   DRY_PRINT    — 'full' ise tüm scene basılır; default 'short' (140 char)
 *   CLEANUP      — '1' ise bitişte session silinir
 *   INSPECT_SUMMARY — '1' ise her 5 step sonrası DB'den rollingSummary/
 *                    bridgeSummaries çekilip basılır (default 1)
 *   MONGO_URI    — inspection için; default prod URI
 *
 * Script pacing assertion'ları yapar (MIN=5, SOFT=7, MAX=10) ve
 * fail olursa exit(1) döner. Özet kalitesi için INSPECT_SUMMARY logları.
 */

import { MongoClient, ObjectId } from 'mongodb';

type ApiHeaders = Record<string, string>;

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const STORY_ID = process.env.STORY_ID;
const MAX_STEPS = parseInt(process.env.MAX_STEPS || '30', 10);
const LANGUAGE = process.env.LANGUAGE || 'tr';
const PRINT_MODE = process.env.DRY_PRINT === 'full' ? 'full' : 'short';
const CLEANUP = process.env.CLEANUP === '1';
const SEED = process.env.SEED ? parseInt(process.env.SEED, 10) : null;
const INSPECT_SUMMARY = (process.env.INSPECT_SUMMARY ?? '1') !== '0';
const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb://root:StoryMongo2026x@91.98.177.117:40777/story_prod?authSource=admin&directConnection=true';

// Mirror service constants — referans:
// src/modules/story-sessions/story-sessions.service.ts
const MIN_STEPS = 5;
const SOFT_STEPS = 7;
const MAX_STEPS_PER_CHAPTER = 10;

if (!STORY_ID) {
  console.error('[test] STORY_ID env zorunlu.');
  process.exit(1);
}

// Basit deterministic RNG (LCG) — SEED varsa tekrarlanabilir
let rngState = SEED ?? Date.now();
function rand(): number {
  rngState = (rngState * 1664525 + 1013904223) % 0x100000000;
  return rngState / 0x100000000;
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return '';
  const single = s.replace(/\s+/g, ' ').trim();
  return single.length > n ? single.substring(0, n) + '…' : single;
}

async function call(
  method: string,
  path: string,
  body?: any,
  headers: ApiHeaders = {},
): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(
      `[${method} ${path}] ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
    );
  }
  return data;
}

interface StepRow {
  step: number;
  chapter: number;
  chapterStepCount: number;
  choiceTaken?: string;
  suggest?: boolean;
  isTransition: boolean;
  isEnding: boolean;
  sceneType?: string;
  sceneText: string;
}

function formatRow(r: StepRow): string {
  const sug =
    r.suggest === true ? 'YES' : r.suggest === false ? 'no ' : '???';
  const tr = r.isTransition ? '✨ TR' : '  ';
  const end = r.isEnding ? '🏁' : ' ';
  const stype = r.sceneType === 'chapter_transition' ? 'T' : ' ';
  const step = String(r.step).padStart(3);
  const ch = String(r.chapter).padStart(2);
  const cstep = String(r.chapterStepCount).padStart(2);
  const scene = truncate(r.sceneText, PRINT_MODE === 'full' ? 9999 : 140);
  return ` ${step}  ${ch}  ${cstep}    ${sug.padEnd(4)}  ${tr}  ${end} ${stype}  ${scene}`;
}

interface SummarySnapshot {
  atStep: number;
  rollingText?: string;
  rollingUpdatedAtStep?: number;
  bridgeKeys?: string[];
  bridgesFull?: Record<string, string>;
}

const summarySnapshots: SummarySnapshot[] = [];

async function inspectSummaries(
  mongoClient: MongoClient | null,
  sessionId: string,
  atStep: number,
): Promise<SummarySnapshot | null> {
  if (!mongoClient) return null;
  try {
    const db = mongoClient.db();
    const s: any = await db
      .collection('story_sessions')
      .findOne({ _id: new ObjectId(sessionId) });
    if (!s) return null;
    const snap: SummarySnapshot = {
      atStep,
      rollingText: s.rollingSummary?.text || '',
      rollingUpdatedAtStep: s.rollingSummary?.updatedAtStep || 0,
      bridgeKeys: Object.keys(s.bridgeSummaries || {}),
      bridgesFull: s.bridgeSummaries || {},
    };
    return snap;
  } catch (err) {
    console.warn(`[inspect] mongo okuma hatası: ${(err as Error).message}`);
    return null;
  }
}

function printSummarySnapshot(snap: SummarySnapshot) {
  console.log('');
  console.log(`┌─── [SUMMARY INSPECTION @ step ${snap.atStep}] ──────────────────────────────`);
  if (snap.rollingText && snap.rollingText.trim().length > 0) {
    console.log(`│ 📝 Rolling Summary (updatedAtStep=${snap.rollingUpdatedAtStep})`);
    console.log(`│    len=${snap.rollingText.length} chars`);
    const wrapped = snap.rollingText.match(/.{1,120}/g) || [];
    wrapped.forEach((line) => console.log(`│    ${line}`));
  } else {
    console.log(`│ 📝 Rolling Summary: (henüz yok)`);
  }
  if (snap.bridgeKeys && snap.bridgeKeys.length > 0) {
    console.log(`│ 🌉 Chapter Bridges: ${snap.bridgeKeys.length} adet (chapter ${snap.bridgeKeys.join(', ')})`);
    for (const k of snap.bridgeKeys) {
      const txt = snap.bridgesFull?.[k] || '';
      const preview = txt.substring(0, 100) + (txt.length > 100 ? '…' : '');
      console.log(`│    ch${k}: ${preview}`);
    }
  } else {
    console.log(`│ 🌉 Chapter Bridges: (yok — henüz transition olmadı)`);
  }
  console.log(`└──────────────────────────────────────────────────────────────────────`);
  console.log('');
}

async function main() {
  console.log(`[config] BASE=${BASE_URL} STORY=${STORY_ID} MAX=${MAX_STEPS} LANG=${LANGUAGE} SEED=${SEED ?? 'random'} INSPECT_SUMMARY=${INSPECT_SUMMARY}`);

  // Mongo client (inspection için) — opsiyonel, başarısız olursa sadece summary logları gösterilmez
  let mongoClient: MongoClient | null = null;
  if (INSPECT_SUMMARY) {
    try {
      mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
      await mongoClient.connect();
      console.log(`[inspect] mongo bağlandı`);
    } catch (err) {
      console.warn(`[inspect] mongo bağlanamadı, summary inspection kapalı: ${(err as Error).message}`);
      mongoClient = null;
    }
  }

  // 1) Anonim auth
  const deviceId = `test-chapter-${Date.now()}-${Math.floor(rand() * 10000)}`;
  const auth = await call('POST', '/api/auth/anonymous', { deviceId });
  const token: string | undefined = auth.accessToken || auth.access_token;
  const userId = auth.userId || auth.user?._id;
  if (!token) {
    console.error('[auth] accessToken dönmedi:', auth);
    process.exit(1);
  }
  console.log(`[auth] userId=${userId} isNew=${auth.isNewUser ?? '?'}`);

  const headers: ApiHeaders = { Authorization: `Bearer ${token}` };

  // 2) Session create
  const sessionResp = await call(
    'POST',
    '/api/story-sessions',
    {
      storyId: STORY_ID,
      playerName: 'TestBot',
      playerGender: 'male',
      languageCode: LANGUAGE,
    },
    headers,
  );
  const session = sessionResp.session || sessionResp;
  const firstProgress = sessionResp.progress || sessionResp.firstProgress;
  const sessionId = session._id || session.id;
  const storyTitle = session.storyClone?.title || session.storyTitle || '(unknown)';
  const totalChapters = session.storyClone?.chapters?.length || 0;

  console.log(`[session] sid=${sessionId} story="${storyTitle}" totalChapters=${totalChapters}`);
  console.log('─'.repeat(140));
  console.log(
    ' step  ch  ch.step suggst tr end st  scene',
  );
  console.log('─'.repeat(140));

  const rows: StepRow[] = [];
  let lastProgress: any = firstProgress;

  const pushRow = (progress: any, stepNum: number, choiceTaken?: string) => {
    const row: StepRow = {
      step: stepNum,
      chapter: progress.currentChapter || 1,
      chapterStepCount: progress.chapterStepCount || 0,
      choiceTaken,
      suggest: progress.effects?.suggestChapterTransition,
      isTransition: !!progress.isChapterTransition,
      isEnding: !!progress.isEnding,
      sceneType: progress.sceneType || progress.scene_type,
      sceneText: progress.currentScene || '',
    };
    rows.push(row);
    console.log(formatRow(row));
  };

  pushRow(firstProgress, 1);

  // 3) Loop
  for (let step = 2; step <= MAX_STEPS; step++) {
    const choices = lastProgress.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      console.log('[loop] no choices — story probably ended');
      break;
    }
    if (lastProgress.isEnding) {
      console.log('[loop] isEnding=true — story ended');
      break;
    }
    const pickIdx = Math.floor(rand() * choices.length);
    const pick = choices[pickIdx];

    // choiceText bazen bilingual response'ta object olabilir veya boş gelebilir — normalize et
    const choiceText =
      typeof pick.text === 'string' && pick.text.trim().length > 0
        ? pick.text.trim()
        : typeof pick.text === 'object' && pick.text
          ? Object.values(pick.text).find(
              (v) => typeof v === 'string' && (v as string).trim().length > 0,
            ) as string
          : null;

    if (!choiceText) {
      console.error(
        `[step ${step}] choice.text boş/geçersiz — payload:`,
        JSON.stringify(pick).substring(0, 200),
      );
      break;
    }

    try {
      lastProgress = await call(
        'POST',
        `/api/story-sessions/${sessionId}/choice`,
        {
          choiceId: String(pick.id || pickIdx + 1),
          choiceText,
          choiceType: pick.type || 'action',
        },
        headers,
      );
      pushRow(lastProgress, step, choiceText);

      // Rolling summary inspection — her 5 step'te bir DB'den kontrol
      // (async summary fire-and-forget olduğu için 2 saniye bekle, propagation)
      if (mongoClient && step % 5 === 0 && step >= 5) {
        await new Promise((r) => setTimeout(r, 2500));
        const snap = await inspectSummaries(mongoClient, sessionId, step);
        if (snap) {
          summarySnapshots.push(snap);
          printSummarySnapshot(snap);
        }
      }

      // Chapter transition sonrası bridge summary kontrolü (1 saniye sonra)
      if (mongoClient && lastProgress.isChapterTransition) {
        await new Promise((r) => setTimeout(r, 1200));
        const snap = await inspectSummaries(mongoClient, sessionId, step);
        if (snap) {
          summarySnapshots.push(snap);
          console.log(`\n[bridge check — chapter transition @ step ${step}]`);
          printSummarySnapshot(snap);
        }
      }
    } catch (err) {
      console.error(`[step ${step}] failed:`, (err as Error).message);
      break;
    }
  }

  console.log('─'.repeat(140));

  // 4) Summary — chapter başına step sayısı
  const byChapter = new Map<number, StepRow[]>();
  for (const r of rows) {
    if (!byChapter.has(r.chapter)) byChapter.set(r.chapter, []);
    byChapter.get(r.chapter)!.push(r);
  }

  console.log('\n[summary] Chapter breakdown:');
  const chapterEntries = Array.from(byChapter.entries()).sort(
    (a, b) => a[0] - b[0],
  );
  for (const [ch, steps] of chapterEntries) {
    const stepCount = steps.length;
    const suggestSteps = steps
      .filter((s) => s.suggest === true)
      .map((s) => s.chapterStepCount);
    const transitionAt = steps.find((s) => s.isTransition);
    const note: string[] = [];
    if (suggestSteps.length) note.push(`suggest@${suggestSteps.join(',')}`);
    if (transitionAt) note.push(`transitioned-in@step${transitionAt.step}`);
    console.log(
      `  Chapter ${ch}: ${stepCount} step${stepCount > 1 ? 's' : ''}  ${note.join(' | ')}`,
    );
  }

  // 5) Assertions
  console.log('\n[assertions]');
  const fails: string[] = [];
  const passes: string[] = [];

  const lastChapterNum = chapterEntries[chapterEntries.length - 1][0];

  for (const [ch, steps] of chapterEntries) {
    const isLastInTestRun = ch === lastChapterNum;
    const isLastStoryChapter = totalChapters > 0 && ch >= totalChapters;
    // Chapter sadece transition olduğunda "kapanmış" sayılır.
    // Son chapter'da transition yok — pacing kapalı, max'a aldırış etme.
    const didClose = steps.some(
      (s, i) => i < steps.length - 1 && false, // anlamsız
    );
    // Gerçek kapanma: bir sonraki chapter başladığı zaman (chapterEntries sıralı)
    const nextChapterExists =
      chapterEntries.findIndex(([c]) => c === ch) < chapterEntries.length - 1;

    if (nextChapterExists) {
      // Bu chapter kapandı — step sayısı MIN..MAX arasında olmalı
      const count = steps.length;
      if (count < MIN_STEPS) {
        fails.push(
          `Chapter ${ch} sadece ${count} step'te kapandı — MIN_STEPS (${MIN_STEPS}) altında`,
        );
      } else if (count > MAX_STEPS_PER_CHAPTER) {
        fails.push(
          `Chapter ${ch} ${count} step sürdü — MAX_STEPS (${MAX_STEPS_PER_CHAPTER}) üstünde`,
        );
      } else {
        passes.push(
          `Chapter ${ch}: ${count} step (MIN..MAX aralığında ✓)`,
        );
      }
    } else if (isLastStoryChapter) {
      // Son chapter — pacing kapalı, MAX üstüne çıkmak serbest
      passes.push(
        `Chapter ${ch} (son chapter, pacing kapalı): ${steps.length} step — limit yok`,
      );
    } else {
      // Test MAX_STEPS'e ulaştı, chapter devam ediyor
      passes.push(
        `Chapter ${ch} devam ediyor (test MAX_STEPS'e ulaştı): ${steps.length} step`,
      );
    }
  }

  // Transition'lar suggest veya force ile mi oldu kontrolü
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.isTransition) {
      const prev = rows[i - 1];
      const forcedAtMax =
        prev && prev.chapterStepCount >= MAX_STEPS_PER_CHAPTER - 1;
      const suggestedPrev = prev && prev.suggest === true;
      if (suggestedPrev) {
        passes.push(
          `Step ${r.step} transition: AI suggest ✓ (step ${prev.step}'de true)`,
        );
      } else if (forcedAtMax) {
        passes.push(
          `Step ${r.step} transition: force @ MAX (step ${prev.step} ch.step=${prev.chapterStepCount})`,
        );
      } else {
        fails.push(
          `Step ${r.step} transition beklenmedik — suggest=false VE force değil (prev ch.step=${prev?.chapterStepCount})`,
        );
      }
    }
  }

  passes.forEach((p) => console.log('  ✓ ' + p));
  fails.forEach((f) => console.log('  ✗ ' + f));

  // === SUMMARY ASSERTIONS (rolling + bridge) ===
  if (mongoClient && INSPECT_SUMMARY) {
    console.log(`\n[summary inspection] ${summarySnapshots.length} snapshot alındı`);

    // Final snapshot — script sonunda DB state
    await new Promise((r) => setTimeout(r, 2000)); // propagation için bekle
    const finalSnap = await inspectSummaries(mongoClient, sessionId, rows.length);
    if (finalSnap) {
      console.log(`\n[summary] FINAL STATE:`);
      printSummarySnapshot(finalSnap);
    }

    // Assertions
    const summaryPasses: string[] = [];
    const summaryFails: string[] = [];

    // 1. Eğer en az 5 step oynandıysa rolling summary oluşmuş olmalı
    if (rows.length >= 5) {
      const lastRolling = finalSnap?.rollingText?.trim();
      if (lastRolling && lastRolling.length > 20) {
        summaryPasses.push(
          `Rolling summary üretilmiş: ${lastRolling.length} chars, updatedAtStep=${finalSnap?.rollingUpdatedAtStep}`,
        );
      } else {
        summaryFails.push(
          `Rolling summary BOŞ — beklenmedi (rows=${rows.length}, dev server ENABLE_ROLLING_SUMMARY kapalı olabilir)`,
        );
      }
    }

    // 2. Chapter transition olduysa bridgeSummaries dolu olmalı
    const transitions = rows.filter((r) => r.isTransition).length;
    if (transitions > 0) {
      const bridgeCount = finalSnap?.bridgeKeys?.length || 0;
      if (bridgeCount >= transitions) {
        summaryPasses.push(
          `Chapter bridges üretilmiş: ${bridgeCount} bridge / ${transitions} transition`,
        );
      } else {
        summaryFails.push(
          `Bridge eksik — ${transitions} transition oldu ama ${bridgeCount} bridge var`,
        );
      }
    }

    // 3. Snapshot'lar arasında rolling summary büyüyor mu / güncelleniyor mu?
    const updatedSteps = summarySnapshots
      .map((s) => s.rollingUpdatedAtStep || 0)
      .filter((x) => x > 0);
    const uniqueUpdates = Array.from(new Set(updatedSteps));
    if (rows.length >= 10 && uniqueUpdates.length >= 1) {
      summaryPasses.push(
        `Rolling summary update'leri: ${uniqueUpdates.length} farklı step'te yenilendi (${uniqueUpdates.join(',')})`,
      );
    }

    console.log('\n[summary assertions]');
    summaryPasses.forEach((p) => console.log('  ✓ ' + p));
    summaryFails.forEach((f) => console.log('  ✗ ' + f));

    fails.push(...summaryFails);
    passes.push(...summaryPasses);
  }

  // 6) Cleanup
  if (CLEANUP) {
    try {
      await call('DELETE', `/api/story-sessions/${sessionId}`, undefined, headers);
      console.log(`\n[cleanup] session ${sessionId} silindi`);
    } catch (err) {
      console.warn(`[cleanup] silinemedi: ${(err as Error).message}`);
    }
  } else {
    console.log(`\n[cleanup] atlandı — sid=${sessionId} DB'de kalıyor (CLEANUP=1 ile sil)`);
  }

  if (mongoClient) {
    await mongoClient.close();
  }

  if (fails.length > 0) {
    console.log(`\n❌ ${fails.length} assertion fail`);
    process.exit(1);
  }
  console.log(`\n✅ tüm assertion'lar pass (${passes.length})`);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
