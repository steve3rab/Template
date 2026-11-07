import { describe, expect, it } from 'vitest';
import { translateText, translations } from './i18n';

describe('translation catalog', () => {
  it('provides the same translation keys in French and English', () => {
    expect(Object.keys(translations.en).sort()).toEqual(Object.keys(translations.fr).sort());
  });

  it.each(['fr', 'en'] as const)(
    'has non-empty string values for every %s translation',
    (language) => {
      for (const [key, value] of Object.entries(translations[language])) {
        if (typeof value === 'string') {
          expect(value.trim(), `${language}.${key} must not be empty`).not.toBe('');
        }
      }
    },
  );

  it('selects the requested language without changing the source values', () => {
    expect(translateText('fr', 'Panier', 'Cart')).toBe('Panier');
    expect(translateText('en', 'Panier', 'Cart')).toBe('Cart');
  });

  it('keeps the supported language names available in both catalogs', () => {
    expect(translations.fr.languageNames.fr).toBe('Français');
    expect(translations.fr.languageNames.en).toBe('Anglais');
    expect(translations.en.languageNames.fr).toBe('Français');
    expect(translations.en.languageNames.en).toBe('Anglais');
  });
});
