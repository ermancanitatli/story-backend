import { UnlocksService } from './unlocks.service';
import { isEntitlementPermanent } from './schemas/story-unlock.schema';

/**
 * Entitlement kurallarının saf (DB'siz) çekirdeği.
 * Fiyat ve premium kararı tek noktada toplandığı için burada test edilebiliyor —
 * bu üç kural bozulursa ya ücretli içerik bedavaya gider ya da ödeyen kilitlenir.
 */
describe('UnlocksService — entitlement kuralları', () => {
  describe('priceOf', () => {
    it('isPaid false ise creditCost dolu olsa bile ücretsizdir', () => {
      // Panel tutarsızlığına karşı: isPaid tek yetkili bayrak.
      expect(UnlocksService.priceOf({ isPaid: false, creditCost: 100 } as any)).toBe(0);
    });

    it('isPaid true ama creditCost yoksa ücretsizdir', () => {
      expect(UnlocksService.priceOf({ isPaid: true } as any)).toBe(0);
      expect(UnlocksService.priceOf({ isPaid: true, creditCost: 0 } as any)).toBe(0);
    });

    it('negatif veya sayı olmayan creditCost kredi ÜRETMEZ', () => {
      expect(UnlocksService.priceOf({ isPaid: true, creditCost: -50 } as any)).toBe(0);
      expect(UnlocksService.priceOf({ isPaid: true, creditCost: NaN } as any)).toBe(0);
    });

    it('geçerli fiyatı tam sayıya indirir', () => {
      expect(UnlocksService.priceOf({ isPaid: true, creditCost: 100 } as any)).toBe(100);
      expect(UnlocksService.priceOf({ isPaid: true, creditCost: 99.9 } as any)).toBe(99);
    });
  });

  describe('isPremiumActive', () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    it('premium alanı yoksa false', () => {
      expect(UnlocksService.isPremiumActive({} as any)).toBe(false);
      expect(UnlocksService.isPremiumActive({ premium: {} } as any)).toBe(false);
    });

    it('expiresAt yoksa isPremium bayrağına güvenir', () => {
      expect(UnlocksService.isPremiumActive({ premium: { isPremium: true } } as any)).toBe(true);
    });

    it('expiresAt gelecekteyse aktif', () => {
      expect(
        UnlocksService.isPremiumActive({ premium: { isPremium: true, expiresAt: future } } as any),
      ).toBe(true);
    });

    it('expiresAt geçmişse isPremium true olsa bile AKTİF DEĞİL', () => {
      // Abonelik bitişini işleyen arka plan işi yok — bu kontrol onun yerine geçiyor.
      expect(
        UnlocksService.isPremiumActive({ premium: { isPremium: true, expiresAt: past } } as any),
      ).toBe(false);
    });
  });

  describe('isEntitlementPermanent', () => {
    it('krediyle ve admin tarafından açılanlar kalıcıdır', () => {
      expect(isEntitlementPermanent('credit')).toBe(true);
      expect(isEntitlementPermanent('admin')).toBe(true);
    });

    it('premium ile açılanlar kalıcı DEĞİLDİR — üyelik bitince erişim düşer', () => {
      expect(isEntitlementPermanent('premium')).toBe(false);
    });
  });
});
