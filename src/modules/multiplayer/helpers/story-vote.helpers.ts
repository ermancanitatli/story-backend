/**
 * Hikaye oylamasının saf (DB'siz, IO'suz) çekirdeği.
 *
 * Buradaki iki fonksiyon oylamanın tüm karar mantığını taşır:
 *   - pickDiverseCandidates: hangi 3 hikaye teklif edilir
 *   - resolveStoryVote:      hangi hikaye kazanır ve bu nasıl anlatılır
 *
 * Saf tutulmalarının sebebi test edilebilirlik: bu iki kural bozulursa ya
 * oyuncuya tek tip katalog gösterilir ya da oylama kilitlenir. rng parametresi
 * enjekte edilebilir olduğu için testler deterministik çalışır.
 */

/** Oylamada kaç aday sunulur. Havuz daha küçükse olan kadarı sunulur. */
export const STORY_VOTE_CANDIDATE_COUNT = 3;

/**
 * Oylama penceresi. 20-30 sn aralığı ürün kararı: 3 kapağı okuyup seçmeye yeter,
 * ama karşı taraf oy vermezse bekleyen oyuncuyu yormaz.
 */
export const STORY_VOTE_WINDOW_MS = 25_000;

/**
 * Sonucun istemciye NASIL anlatılacağını belirler. İstemci bunu doğrudan
 * kullanıcıya çevirir — "ortak karar" gibi göstermek yasak, dürüst olmalı.
 *
 *   agreement   → ikisi de aynı hikayeyi seçti
 *   tiebreak    → farklı seçtiler, ikisinden biri rastgele belirlendi
 *   timeout     → en az biri süresinde oy vermedi, eksik oy rastgele atandı
 *   only-option → iki oyuncuya da açık tek hikaye vardı, oylama yapılmadı
 */
export type StoryVoteResolution = 'agreement' | 'tiebreak' | 'timeout' | 'only-option';

export interface StoryVoteOutcome {
  storyId: string;
  resolution: StoryVoteResolution;
  hostVote: string;
  guestVote: string;
  /** true ise bu oy oyuncunun değil, süre dolduğu için sunucunun attığı rastgele oydur. */
  hostVoteAuto: boolean;
  guestVoteAuto: boolean;
}

export type Rng = () => number;

/** Fisher-Yates — orijinal diziyi bozmaz. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface CategorizedStory {
  genre?: string;
  tags?: string[];
}

/**
 * Çeşitlilik anahtarı: önce genre, yoksa ilk tag, o da yoksa ortak "kategorisiz"
 * kovası. Kategorisizler tek kovada toplanır — bu istenen davranış: aynı kovadan
 * tur başına yalnızca bir hikaye alındığı için kategorisizler de dağılır.
 */
export function categoryKeyOf(story: CategorizedStory): string {
  const genre = story.genre?.trim().toLowerCase();
  if (genre) return genre;
  const tag = story.tags?.find((t) => t && t.trim().length > 0);
  if (tag) return tag.trim().toLowerCase();
  return '__uncategorized';
}

/**
 * Havuzdan `count` adet ÇEŞİTLİ aday seç.
 *
 * Algoritma: kategoriye göre kovala, kovalar arasında round-robin dolaş.
 * 0. turda her kategoriden en fazla bir hikaye alınır → "aynı kategoriden 3 tane"
 * ancak katalogda o kadar kategori yoksa mümkün olur.
 *
 * Havuz `count`tan küçükse olan kadarı (karıştırılmış) döner.
 */
export function pickDiverseCandidates<T extends CategorizedStory>(
  stories: readonly T[],
  count: number = STORY_VOTE_CANDIDATE_COUNT,
  rng: Rng = Math.random,
): T[] {
  if (count <= 0 || stories.length === 0) return [];
  const shuffled = shuffle(stories, rng);
  if (shuffled.length <= count) return shuffled;

  const buckets = new Map<string, T[]>();
  for (const story of shuffled) {
    const key = categoryKeyOf(story);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(story);
    else buckets.set(key, [story]);
  }

  // Kova sırası da rastgele — aynı katalogla her eşleşmede aynı üçlü çıkmasın.
  const order = shuffle([...buckets.keys()], rng);
  const picked: T[] = [];

  for (let round = 0; picked.length < count; round++) {
    let progressed = false;
    for (const key of order) {
      const bucket = buckets.get(key)!;
      if (bucket.length <= round) continue;
      picked.push(bucket[round]);
      progressed = true;
      if (picked.length === count) break;
    }
    if (!progressed) break; // tüm kovalar tükendi
  }

  return picked;
}

/**
 * Oyları sonuca çevir. KİLİTLENME YOK: her girdi kombinasyonu bir hikaye döndürür.
 *
 * - Adaylar arasında olmayan bir oy (eski istemci / manipülasyon) hiç oy
 *   verilmemiş sayılır; sessizce kabul edilip yanlış hikaye başlatılmaz.
 * - Süre dolduğunda eksik oy(lar) rastgele atanır ve `*VoteAuto` ile işaretlenir;
 *   istemci "senin yerine seçildi" diyebilsin.
 */
export function resolveStoryVote(input: {
  candidateStoryIds: readonly string[];
  hostVote?: string | null;
  guestVote?: string | null;
  rng?: Rng;
}): StoryVoteOutcome {
  const { candidateStoryIds } = input;
  if (candidateStoryIds.length === 0) {
    throw new Error('resolveStoryVote: candidate list is empty');
  }
  const rng = input.rng ?? Math.random;
  const valid = new Set(candidateStoryIds);
  const randomCandidate = () =>
    candidateStoryIds[Math.floor(rng() * candidateStoryIds.length)];

  // Tek aday varsa oylama zaten yapılmamıştır — oyları dikkate alma.
  if (candidateStoryIds.length === 1) {
    const only = candidateStoryIds[0];
    return {
      storyId: only,
      resolution: 'only-option',
      hostVote: only,
      guestVote: only,
      hostVoteAuto: true,
      guestVoteAuto: true,
    };
  }

  const rawHost = input.hostVote && valid.has(input.hostVote) ? input.hostVote : null;
  const rawGuest = input.guestVote && valid.has(input.guestVote) ? input.guestVote : null;

  if (rawHost && rawGuest) {
    if (rawHost === rawGuest) {
      return {
        storyId: rawHost,
        resolution: 'agreement',
        hostVote: rawHost,
        guestVote: rawGuest,
        hostVoteAuto: false,
        guestVoteAuto: false,
      };
    }
    return {
      storyId: rng() < 0.5 ? rawHost : rawGuest,
      resolution: 'tiebreak',
      hostVote: rawHost,
      guestVote: rawGuest,
      hostVoteAuto: false,
      guestVoteAuto: false,
    };
  }

  // En az biri oy vermedi → eksikler rastgele doldurulur, sonuç 'timeout'.
  const hostVote = rawHost ?? randomCandidate();
  const guestVote = rawGuest ?? randomCandidate();
  return {
    storyId: rng() < 0.5 ? hostVote : guestVote,
    resolution: 'timeout',
    hostVote,
    guestVote,
    hostVoteAuto: rawHost === null,
    guestVoteAuto: rawGuest === null,
  };
}
