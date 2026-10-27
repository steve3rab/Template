import { useState } from 'react';

export function App() {
  const [count, setCount] = useState<number>(0);

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Template React, accueil">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>Template React</span>
        </a>
        <span className="status-pill"><span className="status-dot" aria-hidden="true" /> Prêt à démarrer</span>
      </header>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">VOTRE NOUVEAU PROJET</p>
        <h1 id="page-title">Une base solide.<br /><span>Prête à évoluer.</span></h1>
        <p className="intro">Une fondation React fortement typée, testée et automatisée pour construire votre produit sereinement.</p>
        <div className="demo-card">
          <div className="demo-card-copy">
            <span className="card-label">COMPTEUR DE DÉMONSTRATION</span>
            <p className="count-value" aria-live="polite" data-testid="counter-value">{count}</p>
            <p className="count-description">Un exemple interactif couvert par des tests.</p>
          </div>
          <button className="primary-button" onClick={() => setCount((value: number) => value + 1)}>
            Incrémenter <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="next-steps">
          <div className="step-number" aria-hidden="true">01</div>
          <div>
            <h2>Prêt pour la suite</h2>
            <p>Le code applicatif est dans <code>src/app</code>. Ajoutez vos domaines fonctionnels dans <code>src/features</code>.</p>
          </div>
        </div>
      </section>
      <footer className="footer">
        <span>React · TypeScript · Vite</span>
        <span>Qualité vérifiée automatiquement.</span>
      </footer>
    </main>
  );
}
