import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { translateText, translations, useTranslation } from './i18n';

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: 'fr-FR',
  });
});

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

  it('uses a valid saved language before the browser language', () => {
    window.localStorage.setItem('template-react-language', 'en');

    const { result } = renderHook(() => useTranslation());

    expect(result.current.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to the browser language when no valid preference is saved', () => {
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'en-GB',
    });
    window.localStorage.setItem('template-react-language', 'de');

    const { result } = renderHook(() => useTranslation());

    expect(result.current.language).toBe('en');
  });

  it('persists language changes and updates the document language', () => {
    const { result } = renderHook(() => useTranslation());

    act(() => result.current.setLanguage('en'));

    expect(result.current.language).toBe('en');
    expect(window.localStorage.getItem('template-react-language')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps the supported language names available in both catalogs', () => {
    expect(translations.fr.languageNames.fr).toBe('Français');
    expect(translations.fr.languageNames.en).toBe('Anglais');
    expect(translations.en.languageNames.fr).toBe('Français');
    expect(translations.en.languageNames.en).toBe('Anglais');
  });
});
