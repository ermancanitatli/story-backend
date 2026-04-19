/**
 * Chapter Transition Test — single + multiplayer mod'da rasgele choice
 * seçerek pacing, rolling summary ve bridge summary davranışlarını gözlemler.
 *
 * Usage (single player):
 *   STORY_ID=69e13e00312e6ba98b92db0a MAX_STEPS=20 LANGUAGE=tr \
 *     npx ts-node scripts/test-chapter-transition.ts
 *
 * Usage (multiplayer — matchmaking ile):
 *   MODE=multi STORY_ID=... MAX_STEPS=20 LANGUAGE_HOST=tr LANGUAGE_GUEST=en \
 *     npx ts-node scripts/test-chapter-transition.ts
 *
 * ENV:
 *   MODE           — 'single' (default) veya 'multi'
 *   BASE_URL       — default http://localhost:3000
 *   STORY_ID       — zorunlu (her iki modda da)
 *   MAX_STEPS      — default 30 (multi'de turn sayısı)
 *   LANGUAGE       — single mod: default 'tr'
 *   LANGUAGE_HOST  — multi mod: default 'tr'
 *   LANGUAGE_GUEST — multi mod: default 'en' (bilingual test için farklı dil)
 *   SEED           — deterministic rasgelelik
 *   DRY_PRINT      — 'full' tüm scene, default 'short' (140 char)
 *   CLEANUP        — '1' ise session silinir
 *   INSPECT_SUMMARY — '1' (default) DB'den rolling/bridge summary basılır
 *   MONGO_URI      — prod default
 *
 * Exit code: pacing/summary assertion fail ise 1, pass ise 0.
 */

import { MongoClient, ObjectId } from 'mongodb';
import { io as ioClient, Socket } from 'socket.io-client';

type ApiHeaders = Record<string, string>;

const MODE = (process.env.MODE || 'single').toLowerCase();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const STORY_ID = process.env.STORY_ID;
const MAX_STEPS = parseInt(process.env.MAX_STEPS || '30', 10);
const LANGUAGE = process.env.LANGUAGE || 'tr';
const LANGUAGE_HOST = process.env.LANGUAGE_HOST || 'tr';
const LANGUAGE_GUEST = process.env.LANGUAGE_GUEST || 'en';
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

async function runSinglePlayer() {
  console.log(`[mode] SINGLE PLAYER`);
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
    // choiceText bazen bilingual response'ta object olabilir veya boş gelebilir — normalize et
    const extractText = (c: any): string | null => {
      if (!c) return null;
      if (typeof c.text === 'string' && c.text.trim().length > 0) return c.text.trim();
      if (typeof c.text === 'object' && c.text) {
        const found = Object.values(c.text).find(
          (v) => typeof v === 'string' && (v as string).trim().length > 0,
        );
        if (found) return found as string;
      }
      return null;
    };

    // Önce geçerli text'i olan choice'ları filtrele
    const validChoices = choices
      .map((c: any, idx: number) => ({ c, idx, text: extractText(c) }))
      .filter((x: any) => x.text);

    if (validChoices.length === 0) {
      // Backend artık her zaman geçerli choice döndürüyor olmalı (retry + enforce)
      console.error(
        `[step ${step}] 🔴 TÜM CHOICE'LAR BOZUK — backend retry mekanizması başarısız olmuş.`,
      );
      console.error(`  payload=${JSON.stringify(choices).substring(0, 300)}`);
      break;
    }

    // Geçerli choice'lardan birini rasgele seç
    const pickFromValid = validChoices[Math.floor(rand() * validChoices.length)];
    const pick = pickFromValid.c;
    const pickIdx = pickFromValid.idx;
    const choiceText: string = pickFromValid.text as string;

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

// =============================================================================
// MULTIPLAYER MODE
// =============================================================================

interface Player {
  userId: string;
  token: string;
  name: string;
  gender: 'male' | 'female';
  language: string;
  headers: ApiHeaders;
}

async function authenticatePlayer(label: string, gender: 'male' | 'female', language: string): Promise<Player> {
  const deviceId = `test-mp-${label}-${Date.now()}-${Math.floor(rand() * 10000)}`;
  const auth = await call('POST', '/api/auth/anonymous', { deviceId });
  const token: string | undefined = auth.accessToken || auth.access_token;
  const userId = auth.userId || auth.user?._id;
  if (!token) throw new Error(`[${label}] token alınamadı`);
  return {
    userId,
    token,
    name: label === 'host' ? 'Alice' : 'Bob',
    gender,
    language,
    headers: { Authorization: `Bearer ${token}` },
  };
}

async function matchmakingFlow(host: Player, guest: Player, storyId: string): Promise<string> {
  // Socket.IO bağlantısı — iki ayrı client
  const hostSocket: Socket = ioClient(BASE_URL, {
    auth: { token: host.token },
    transports: ['websocket'],
  });
  const guestSocket: Socket = ioClient(BASE_URL, {
    auth: { token: guest.token },
    transports: ['websocket'],
  });

  // Her iki client bağlantıyı bekle
  await Promise.all([
    new Promise<void>((res) => hostSocket.on('connect', () => res())),
    new Promise<void>((res) => guestSocket.on('connect', () => res())),
  ]);
  console.log(`[mp] socket bağlandı — host=${hostSocket.id?.substring(0, 8)} guest=${guestSocket.id?.substring(0, 8)}`);

  // Join matchmaking
  const matchedPromise = Promise.all([
    new Promise<any>((res) => hostSocket.once('matchmaking:matched', (data) => res(data))),
    new Promise<any>((res) => guestSocket.once('matchmaking:matched', (data) => res(data))),
  ]);

  hostSocket.emit('matchmaking:join', {
    storyId,
    playerGender: host.gender,
    languageCode: host.language,
  });
  // Kısa gecikme — host queue'ya girsin, sonra guest gelsin (eşleşme tetiklenir)
  await new Promise((r) => setTimeout(r, 500));
  guestSocket.emit('matchmaking:join', {
    storyId,
    playerGender: guest.gender,
    languageCode: guest.language,
  });

  const [hostMatched, guestMatched] = await Promise.race([
    matchedPromise,
    new Promise<any>((_, rej) => setTimeout(() => rej(new Error('matchmaking timeout 20s')), 20000)),
  ]);
  console.log(`[mp] matched! host partnerId=${hostMatched?.partnerId?.substring(0, 8)} guest partnerId=${guestMatched?.partnerId?.substring(0, 8)}`);

  // Her iki oyuncu accept
  const sessionCreatedPromise = new Promise<string>((res) => {
    const onUpdate = (data: any) => {
      if (data?.session?._id) {
        hostSocket.off('multiplayer:session-update', onUpdate);
        guestSocket.off('multiplayer:session-update', onUpdate);
        res(data.session._id);
      }
    };
    hostSocket.on('multiplayer:session-update', onUpdate);
    guestSocket.on('multiplayer:session-update', onUpdate);
  });

  hostSocket.emit('matchmaking:accept');
  await new Promise((r) => setTimeout(r, 300));
  guestSocket.emit('matchmaking:accept');

  // Alternatif: REST GET /multiplayer ile sürekli kontrol et
  let sessionId: string | null = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const sessions: any[] = await call('GET', '/api/multiplayer', undefined, host.headers);
      const active = sessions.find((s) => s.phase === 'playing' || s.phase === 'character-selection');
      if (active) {
        sessionId = active._id;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  hostSocket.disconnect();
  guestSocket.disconnect();

  if (!sessionId) throw new Error('matchmaking session oluşturulamadı (15s timeout)');
  return sessionId;
}

async function runMultiplayer() {
  console.log(`[mode] MULTIPLAYER — bilingual test`);
  console.log(`[config] BASE=${BASE_URL} STORY=${STORY_ID} MAX=${MAX_STEPS} LANG_HOST=${LANGUAGE_HOST} LANG_GUEST=${LANGUAGE_GUEST} SEED=${SEED ?? 'random'}`);

  // Mongo client
  let mongoClient: MongoClient | null = null;
  if (INSPECT_SUMMARY) {
    try {
      mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
      await mongoClient.connect();
      console.log(`[inspect] mongo bağlandı`);
    } catch (err) {
      console.warn(`[inspect] mongo bağlanamadı: ${(err as Error).message}`);
    }
  }

  // İki oyuncu auth
  const host = await authenticatePlayer('host', 'male', LANGUAGE_HOST);
  const guest = await authenticatePlayer('guest', 'female', LANGUAGE_GUEST);
  console.log(`[auth] host=${host.userId.substring(0, 8)} (${host.language}) guest=${guest.userId.substring(0, 8)} (${guest.language})`);

  // Matchmaking ile eşleştir
  let sessionId: string;
  try {
    sessionId = await matchmakingFlow(host, guest, STORY_ID!);
  } catch (err) {
    console.error(`[mp] matchmaking başarısız: ${(err as Error).message}`);
    console.error(`    socket matchmaking prod-only olabilir veya fake match devrede olabilir`);
    if (mongoClient) await mongoClient.close();
    process.exit(1);
  }
  console.log(`[session] sid=${sessionId}`);

  // Session state ready mi?
  let session: any;
  for (let i = 0; i < 10; i++) {
    session = await call('GET', `/api/multiplayer/${sessionId}`, undefined, host.headers);
    if (session.phase === 'playing') break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (session.phase !== 'playing') {
    console.error(`[mp] session playing'e ulaşamadı (phase=${session.phase})`);
    if (mongoClient) await mongoClient.close();
    process.exit(1);
  }

  const totalChapters = session.storyClone?.chapters?.length || 0;
  const storyTitle = session.storyClone?.title || '(unknown)';
  console.log(`[session] story="${storyTitle}" totalChapters=${totalChapters} phase=${session.phase}`);
  console.log('─'.repeat(140));
  console.log(' turn  active  ch  suggst tr end scene (by active player language)');
  console.log('─'.repeat(140));

  const summarySnapshots: SummarySnapshot[] = [];
  const turnLogs: Array<{ turn: number; activeId: string; chapter: number; suggest?: boolean; transition: boolean; scene: string }> = [];
  let currentActiveId: string = session.activePlayerId;

  // İlk progress çek
  let lastProgress: any = await call(
    'GET',
    `/api/multiplayer/${sessionId}/progress`,
    undefined,
    currentActiveId === host.userId ? host.headers : guest.headers,
  );
  const firstTurn = lastProgress?.turnOrder || 1;
  turnLogs.push({
    turn: firstTurn,
    activeId: currentActiveId,
    chapter: lastProgress?.currentChapter || 1,
    transition: !!lastProgress?.isChapterTransition,
    scene: lastProgress?.currentScene || '',
  });
  const firstActiveLabel = currentActiveId === host.userId ? 'HOST' : 'GUEST';
  console.log(
    `  ${String(firstTurn).padStart(3)}  ${firstActiveLabel.padEnd(5)}    ${String(lastProgress?.currentChapter || 1).padStart(2)}    -          ${truncate(lastProgress?.currentScene, 100)}`,
  );

  // Turn döngüsü
  for (let turnNum = firstTurn + 1; turnNum <= MAX_STEPS; turnNum++) {
    const isHostTurn = currentActiveId === host.userId;
    const activePlayer = isHostTurn ? host : guest;
    const activeLabel = isHostTurn ? 'HOST' : 'GUEST';

    // Aktif oyuncu son progress'i kendi dilinde çeker
    try {
      lastProgress = await call(
        'GET',
        `/api/multiplayer/${sessionId}/progress`,
        undefined,
        activePlayer.headers,
      );
    } catch (err) {
      console.error(`[turn ${turnNum}] progress fetch err: ${(err as Error).message}`);
      break;
    }

    if (lastProgress?.isEnding) {
      console.log('[loop] isEnding=true — story ended');
      break;
    }

    const choices = lastProgress?.choices || [];
    const validChoices = choices
      .map((c: any, idx: number) => ({ c, idx, text: extractChoiceText(c) }))
      .filter((x: any) => x.text);
    if (validChoices.length === 0) {
      console.error(`[turn ${turnNum}] tüm choice'lar bozuk: ${JSON.stringify(choices).substring(0, 200)}`);
      break;
    }
    const pick = validChoices[Math.floor(rand() * validChoices.length)];

    try {
      const result: any = await call(
        'POST',
        `/api/multiplayer/${sessionId}/choice`,
        { choiceId: String(pick.c.id || pick.idx + 1), choiceText: pick.text, choiceType: pick.c.type || 'action' },
        activePlayer.headers,
      );
      turnLogs.push({
        turn: turnNum,
        activeId: currentActiveId,
        chapter: result?.currentChapter || 1,
        suggest: result?.effects?.suggestChapterTransition,
        transition: !!result?.isChapterTransition,
        scene: result?.currentScene || '',
      });

      const sug = result?.effects?.suggestChapterTransition === true ? 'YES' : result?.effects?.suggestChapterTransition === false ? 'no ' : '???';
      const tr = result?.isChapterTransition ? '✨ TR' : '  ';
      const end = result?.isEnding ? '🏁' : ' ';
      console.log(
        `  ${String(turnNum).padStart(3)}  ${activeLabel.padEnd(5)}    ${String(result?.currentChapter || 1).padStart(2)}    ${sug.padEnd(4)}  ${tr}  ${end}  ${truncate(result?.currentScene, 100)}`,
      );

      // Turn swap — server yaptı, biz sadece takip ediyoruz
      // activePlayerId response'ta dönmüyor — session'dan tekrar çek
      if (turnNum % 3 === 0 || result?.isChapterTransition) {
        const sess = await call('GET', `/api/multiplayer/${sessionId}`, undefined, host.headers);
        currentActiveId = sess.activePlayerId;
      } else {
        // Tahmin: basit swap
        currentActiveId = isHostTurn ? guest.userId : host.userId;
      }

      // Özet inspection
      if (mongoClient && turnNum % 5 === 0) {
        await new Promise((r) => setTimeout(r, 2500));
        const db = mongoClient.db();
        const s: any = await db.collection('multiplayer_sessions').findOne({ _id: new ObjectId(sessionId) });
        if (s) {
          const snap: SummarySnapshot = {
            atStep: turnNum,
            rollingText: s.rollingSummary?.text || '',
            rollingUpdatedAtStep: s.rollingSummary?.updatedAtStep || 0,
            bridgeKeys: Object.keys(s.bridgeSummaries || {}),
            bridgesFull: s.bridgeSummaries || {},
          };
          summarySnapshots.push(snap);
          printSummarySnapshot(snap);
        }
      }

      if (result?.isEnding) break;
    } catch (err) {
      console.error(`[turn ${turnNum}] choice submit err: ${(err as Error).message}`);
      break;
    }
  }

  console.log('─'.repeat(140));

  // Özet
  const hostTurns = turnLogs.filter((t) => t.activeId === host.userId).length;
  const guestTurns = turnLogs.filter((t) => t.activeId === guest.userId).length;
  const transitions = turnLogs.filter((t) => t.transition).length;
  console.log(`\n[mp summary]`);
  console.log(`  Host turn: ${hostTurns}, Guest turn: ${guestTurns}, Toplam: ${turnLogs.length}`);
  console.log(`  Transitions: ${transitions}`);
  console.log(`  Host lang: ${host.language}, Guest lang: ${guest.language} (bilingual test)`);

  // Final summary inspection
  if (mongoClient) {
    await new Promise((r) => setTimeout(r, 2000));
    const db = mongoClient.db();
    const s: any = await db.collection('multiplayer_sessions').findOne({ _id: new ObjectId(sessionId) });
    if (s) {
      const snap: SummarySnapshot = {
        atStep: turnLogs.length,
        rollingText: s.rollingSummary?.text || '',
        rollingUpdatedAtStep: s.rollingSummary?.updatedAtStep || 0,
        bridgeKeys: Object.keys(s.bridgeSummaries || {}),
        bridgesFull: s.bridgeSummaries || {},
      };
      console.log(`\n[mp summary] FINAL STATE:`);
      printSummarySnapshot(snap);
    }
    await mongoClient.close();
  }

  // Cleanup
  if (CLEANUP) {
    try {
      await call('POST', '/api/multiplayer/batch-delete', { sessionIds: [sessionId] }, host.headers);
      console.log(`[cleanup] session silindi`);
    } catch (err) {
      console.warn(`[cleanup] silinemedi: ${(err as Error).message}`);
    }
  } else {
    console.log(`\n[cleanup] atlandı — sid=${sessionId}`);
  }

  console.log(`\n✅ multiplayer test tamamlandı (${turnLogs.length} turn)`);
}

function extractChoiceText(c: any): string | null {
  if (!c) return null;
  if (typeof c.text === 'string' && c.text.trim().length > 0) return c.text.trim();
  if (typeof c.text === 'object' && c.text) {
    const found = Object.values(c.text).find(
      (v) => typeof v === 'string' && (v as string).trim().length > 0,
    );
    if (found) return (found as string).trim();
  }
  return null;
}

// =============================================================================
// ENTRY POINT
// =============================================================================

async function main() {
  if (MODE === 'multi' || MODE === 'multiplayer') {
    await runMultiplayer();
  } else {
    await runSinglePlayer();
  }
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
