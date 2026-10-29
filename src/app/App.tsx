import { useTranslation, translations } from '../shared/i18n';
import type { Language } from '../shared/i18n';
import { useState } from 'react';

export function App() {
  const [count, setCount] = useState<number>(0);
  const { language, setLanguage, t } = useTranslation();

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={t('home')}>
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>Template React</span>
        </a>
        <div className="topbar-actions">
          <div className="language-switcher" role="group" aria-label={t('language')}>
            {(['fr', 'en'] as const).map((option: Language) => (
              <button
                className="language-button"
                type="button"
                key={option}
                aria-pressed={language === option}
                aria-label={translations[language].languageNames[option]}
                onClick={() => setLanguage(option)}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="status-pill">
            <span className="status-dot" aria-hidden="true" /> {t('ready')}
          </span>
        </div>
      </header>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h1 id="page-title">
          {t('headingStart')}<br /><span>{t('headingEnd')}</span>
        </h1>
        <p className="intro">{t('intro')}</p>
        <div className="demo-card">
          <div className="demo-card-copy">
            <span className="card-label">{t('counterLabel')}</span>
            <p className="count-value" aria-live="polite" data-testid="counter-value">{count}</p>
            <p className="count-description">{t('counterDescription')}</p>
          </div>
          <button className="primary-button" type="button" onClick={() => setCount((value: number) => value + 1)}>
            {t('increment')} <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="next-steps">
          <div className="step-number" aria-hidden="true">01</div>
          <div>
            <h2>{t('nextTitle')}</h2>
            <p>
              {t('nextDescriptionStart')} <code>src/app</code>. {t('nextDescriptionEnd')}{' '}
              <code>src/features</code>.
            </p>
          </div>
        </div>
      </section>
      <footer className="footer">
        <span>React · TypeScript · Vite</span>
        <span>{t('footerQuality')}</span>
      </footer>
    </main>
  );
}
