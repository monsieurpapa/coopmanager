// EN/FR key parity for the translations object. A key present in one language
// but not the other renders as a raw key (or English fallback) in production —
// this catches it at ship time instead of in front of a French-speaking coop.
import { describe, expect, it } from 'vitest';
import { translations } from '../src/contexts/language';

describe('translations EN/FR parity', () => {
  it('en and fr expose exactly the same keys', () => {
    const en = Object.keys(translations.en).sort();
    const fr = Object.keys(translations.fr).sort();
    expect(fr).toEqual(en);
  });

  it('no empty translation values in either language', () => {
    for (const lang of ['en', 'fr'] as const) {
      for (const [key, value] of Object.entries(translations[lang])) {
        expect(typeof value, `${lang}.${key}`).toBe('string');
        expect((value as string).length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });
});
