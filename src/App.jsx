import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Template React, accueil">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>Template React</span>
        </a>
        <span className="status-pill"><span className="status-dot" /> Prêt à démarrer</span>
      </header>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">VOTRE NOUVEAU PROJET</p>
        <h1 id="page-title">Une base simple.<br /><span>De grandes idées.</span></h1>
        <p className="intro">Votre application React est prête. Modifiez ce composant pour commencer à construire votre projet.</p>
        <div className="demo-card">
          <div className="demo-card-copy">
            <span className="card-label">COMPTEUR DE DÉMONSTRATION</span>
            <p className="count-value" aria-live="polite">{count}</p>
            <p className="count-description">Cliquez pour tester l’interactivité React.</p>
          </div>
          <button className="primary-button" onClick={() => setCount((value) => value + 1)}>
            Incrémenter <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="next-steps">
          <div className="step-number">01</div>
          <div>
            <h2>Pour commencer</h2>
            <p>Modifiez <code>src/App.jsx</code>, puis enregistrez : Vite actualise la page automatiquement.</p>
          </div>
        </div>
      </section>
      <footer className="footer">
        <span>React + Vite</span>
        <span>Construit pour évoluer.</span>
      </footer>
    </main>
  );
}
