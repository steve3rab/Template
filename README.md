# Template React

Point de départ React avec Vite, en JavaScript et JSX.

## Prérequis

- Node.js `20.19+` (ou `22.12+`)
- npm

## Installation et démarrage

```bash
npm install
npm run dev
```

Vite affiche l'adresse locale dans le terminal (par défaut `http://localhost:5173`).

## Commandes

```bash
npm run dev      # serveur de développement
npm run build    # compilation de production dans dist/
npm run preview  # aperçu local de la compilation
```

## Structure

```text
.
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── App.jsx
    ├── main.jsx
    └── styles.css
```

Le composant de départ se trouve dans `src/App.jsx`. Les styles globaux sont dans `src/styles.css`.
