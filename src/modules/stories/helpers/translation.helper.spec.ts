import { getTranslation } from './translation.helper';

describe('getTranslation', () => {
  it('returns localized translation when available', () => {
    const story: any = {
      title: 'EN flat',
      translations: {
        en: { title: 'Hello' },
        tr: { title: 'Merhaba' },
      },
    };

    expect(getTranslation(story, 'tr', 'title')).toBe('Merhaba');
  });

  it('falls back to en translation when locale missing', () => {
    const story: any = {
      title: 'EN flat',
      translations: {
        en: { title: 'Hello' },
      },
    };

    expect(getTranslation(story, 'tr', 'title')).toBe('Hello');
  });

  it('falls back to flat story field when en translation missing', () => {
    const story: any = {
      title: 'Flat EN Title',
      summary: 'Flat summary',
      summarySafe: 'Flat safe',
    };

    expect(getTranslation(story, 'tr', 'title')).toBe('Flat EN Title');
    expect(getTranslation(story, 'de', 'summary')).toBe('Flat summary');
    expect(getTranslation(story, 'fr', 'summarySafe')).toBe('Flat safe');
  });

  it('returns empty string when nothing is defined', () => {
    const story: any = {};
    expect(getTranslation(story, 'tr', 'title')).toBe('');
  });

  it('prefers locale over en when both exist for summary/summarySafe', () => {
    const story: any = {
      translations: {
        en: { summary: 'en-summary', summarySafe: 'en-safe' },
        de: { summary: 'de-summary', summarySafe: 'de-safe' },
      },
    };

    expect(getTranslation(story, 'de', 'summary')).toBe('de-summary');
    expect(getTranslation(story, 'de', 'summarySafe')).toBe('de-safe');
  });

  it('handles missing translations object gracefully', () => {
    const story: any = { title: 'only flat' };
    expect(getTranslation(story, 'en', 'title')).toBe('only flat');
  });
});
