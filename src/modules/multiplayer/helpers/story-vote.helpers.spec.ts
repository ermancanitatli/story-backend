import {
  categoryKeyOf,
  pickDiverseCandidates,
  resolveStoryVote,
  shuffle,
} from './story-vote.helpers';

/**
 * Hikaye oylamasının saf çekirdeği.
 *
 * Bu iki kural bozulursa ürün iki yönden birden zarar görür:
 *   - aday seçimi bozulursa oyuncuya tek tip katalog gösterilir (oylamanın amacı kaybolur)
 *   - sonuç çözümü bozulursa oylama kilitlenir ve eşleşme sonsuza kadar asılı kalır
 */

/** Deterministik rng: verilen değerleri sırayla döner, tükenince başa sarar. */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const story = (id: string, genre?: string, tags?: string[]) => ({
  _id: id,
  genre,
  tags,
});

describe('categoryKeyOf', () => {
  it('genre varsa normalize edip kullanır', () => {
    expect(categoryKeyOf({ genre: '  Romance ' })).toBe('romance');
  });

  it('genre yoksa ilk dolu tag`e düşer', () => {
    expect(categoryKeyOf({ tags: ['', '  ', 'Thriller'] })).toBe('thriller');
  });

  it('hiçbiri yoksa ortak kategorisiz kovasına düşer', () => {
    expect(categoryKeyOf({})).toBe('__uncategorized');
    expect(categoryKeyOf({ genre: '   ', tags: [] })).toBe('__uncategorized');
  });
});

describe('shuffle', () => {
  it('orijinal diziyi bozmaz', () => {
    const input = [1, 2, 3, 4];
    const out = shuffle(input, seededRng([0.9, 0.1, 0.5]));
    expect(input).toEqual([1, 2, 3, 4]);
    expect(out).toHaveLength(4);
    expect(out.sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('pickDiverseCandidates', () => {
  it('havuz istenen sayıdan küçükse olan kadarını döner', () => {
    // Katalogda tek ücretsiz hikaye kalmışsa oylama yine de çökmemeli.
    const picked = pickDiverseCandidates([story('a', 'romance')], 3);
    expect(picked.map((s) => s._id)).toEqual(['a']);
  });

  it('boş havuz için boş döner', () => {
    expect(pickDiverseCandidates([], 3)).toEqual([]);
  });

  it('yeterli kategori varsa AYNI kategoriden iki aday seçmez', () => {
    const pool = [
      story('r1', 'romance'),
      story('r2', 'romance'),
      story('r3', 'romance'),
      story('t1', 'thriller'),
      story('d1', 'drama'),
    ];
    const picked = pickDiverseCandidates(pool, 3, seededRng([0.42]));
    const genres = picked.map((s) => s.genre);
    expect(picked).toHaveLength(3);
    expect(new Set(genres).size).toBe(3);
  });

  it('kategori sayısı yetmiyorsa kalanı doldurur ama dağılımı korur', () => {
    // 1 thriller + çok sayıda romance → 1 thriller + 2 romance beklenir,
    // asla 3 romance değil.
    const pool = [
      story('r1', 'romance'),
      story('r2', 'romance'),
      story('r3', 'romance'),
      story('r4', 'romance'),
      story('t1', 'thriller'),
    ];
    const picked = pickDiverseCandidates(pool, 3, seededRng([0.31, 0.77, 0.12]));
    expect(picked).toHaveLength(3);
    expect(picked.filter((s) => s.genre === 'thriller')).toHaveLength(1);
    expect(picked.filter((s) => s.genre === 'romance')).toHaveLength(2);
  });

  it('tüm hikayeler kategorisizse yine de istenen sayıda aday üretir', () => {
    const pool = [story('a'), story('b'), story('c'), story('d')];
    const picked = pickDiverseCandidates(pool, 3, seededRng([0.5]));
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((s) => s._id)).size).toBe(3);
  });

  it('aynı adayı iki kez döndürmez', () => {
    const pool = Array.from({ length: 12 }, (_, i) =>
      story(`s${i}`, i % 2 === 0 ? 'romance' : undefined),
    );
    for (let seed = 0; seed < 20; seed++) {
      const picked = pickDiverseCandidates(pool, 3, seededRng([seed / 20, 0.5, 0.9]));
      expect(new Set(picked.map((s) => s._id)).size).toBe(picked.length);
    }
  });
});

describe('resolveStoryVote', () => {
  const candidates = ['a', 'b', 'c'];

  it('aday listesi boşsa hata verir', () => {
    expect(() => resolveStoryVote({ candidateStoryIds: [] })).toThrow();
  });

  it('iki oyuncu aynı hikayeyi seçtiyse o hikaye başlar (agreement)', () => {
    const out = resolveStoryVote({ candidateStoryIds: candidates, hostVote: 'b', guestVote: 'b' });
    expect(out).toMatchObject({
      storyId: 'b',
      resolution: 'agreement',
      hostVoteAuto: false,
      guestVoteAuto: false,
    });
  });

  it('farklı seçtilerse ikisinden biri rastgele seçilir ve tiebreak denir', () => {
    const hostWins = resolveStoryVote({
      candidateStoryIds: candidates,
      hostVote: 'a',
      guestVote: 'c',
      rng: () => 0.1,
    });
    expect(hostWins).toMatchObject({ storyId: 'a', resolution: 'tiebreak' });

    const guestWins = resolveStoryVote({
      candidateStoryIds: candidates,
      hostVote: 'a',
      guestVote: 'c',
      rng: () => 0.9,
    });
    expect(guestWins).toMatchObject({ storyId: 'c', resolution: 'tiebreak' });
  });

  it('tiebreak sonucu HER ZAMAN oylanan iki hikayeden biridir', () => {
    // Üçüncü hikaye kimse istemediği hâlde başlarsa oyuncu kandırılmış olur.
    for (let i = 0; i <= 10; i++) {
      const out = resolveStoryVote({
        candidateStoryIds: candidates,
        hostVote: 'a',
        guestVote: 'b',
        rng: () => i / 10,
      });
      expect(['a', 'b']).toContain(out.storyId);
    }
  });

  it('hiç oy gelmezse yine de bir hikaye başlar (kilitlenme yok)', () => {
    const out = resolveStoryVote({ candidateStoryIds: candidates, rng: () => 0.0 });
    expect(candidates).toContain(out.storyId);
    expect(out.resolution).toBe('timeout');
    expect(out.hostVoteAuto).toBe(true);
    expect(out.guestVoteAuto).toBe(true);
  });

  it('tek taraf oy verdiyse eksik oy rastgele atanır ve timeout denir', () => {
    const out = resolveStoryVote({
      candidateStoryIds: candidates,
      hostVote: 'c',
      rng: () => 0.0,
    });
    expect(out.resolution).toBe('timeout');
    expect(out.hostVote).toBe('c');
    expect(out.hostVoteAuto).toBe(false);
    expect(out.guestVoteAuto).toBe(true);
    expect(candidates).toContain(out.guestVote);
  });

  it('aday listesinde olmayan oy YOK sayılır — sahte storyId ile oyun başlatılamaz', () => {
    const out = resolveStoryVote({
      candidateStoryIds: candidates,
      hostVote: 'hacked-story-id',
      guestVote: 'a',
      rng: () => 0.0,
    });
    expect(candidates).toContain(out.storyId);
    expect(out.storyId).not.toBe('hacked-story-id');
    expect(out.resolution).toBe('timeout');
    expect(out.hostVoteAuto).toBe(true);
  });

  it('tek aday varsa oylama yapılmamıştır — only-option döner', () => {
    const out = resolveStoryVote({ candidateStoryIds: ['solo'], hostVote: 'solo' });
    expect(out).toMatchObject({ storyId: 'solo', resolution: 'only-option' });
  });

  it('her girdi kombinasyonu geçerli bir aday döndürür', () => {
    const options: Array<string | null> = ['a', 'b', null, 'bogus'];
    for (const hostVote of options) {
      for (const guestVote of options) {
        for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
          const out = resolveStoryVote({
            candidateStoryIds: candidates,
            hostVote,
            guestVote,
            rng: () => r,
          });
          expect(candidates).toContain(out.storyId);
        }
      }
    }
  });
});
