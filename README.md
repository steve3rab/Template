# Template React — socle professionnel

Socle frontend orienté production, construit avec React, TypeScript strict et Vite. Le domaine métier n'est volontairement pas préjugé : les fonctionnalités et dépendances métier seront ajoutées lorsque l'objectif du produit sera défini.

## Prérequis
- Node.js 22.12+
- npm 10+
- Docker (optionnel)

## Démarrage local
```bash
npm install
npm run dev
```

## Contrôles qualité
```bash
npm run typecheck       # TypeScript strict
npm run lint            # ESLint
npm run format:check    # Prettier
npm run test            # tests unitaires / composants
npm run test:coverage   # couverture avec seuils
npm run test:e2e        # tests navigateur Playwright
npm run build           # contrôle types + build production
npm run check           # typecheck, lint, format, tests et build
```

Installer les navigateurs Playwright lors de la première utilisation E2E :
```bash
npx playwright install chromium
```

## Scripts PowerShell (Windows)

Les scripts du dossier `scripts/` simplifient les tâches courantes. Depuis la racine du dépôt, ouvrez PowerShell et lancez :

```powershell
# Si nécessaire, autoriser les scripts pour cette session uniquement
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Installer les dépendances
.\scripts\setup.ps1

# Démarrer le serveur de développement
.\scripts\dev.ps1

# Construire l'application pour la production
.\scripts\build.ps1

# Exécuter les tests unitaires, avec couverture ou E2E
.\scripts\test.ps1
.\scripts\test.ps1 -Coverage
.\scripts\test.ps1 -E2E -InstallBrowser

# Exécuter les contrôles qualité (types, lint, format, tests et build)
.\scripts\check.ps1

# Construire puis prévisualiser le build
.\scripts\build.ps1 -Preview

# Construire une image Docker, puis la lancer dans un autre terminal
.\scripts\docker.ps1 -Action Build
.\scripts\docker.ps1 -Action Run

# Nettoyer les fichiers générés ; ajouter -Dependencies pour supprimer node_modules
.\scripts\clean.ps1
.\scripts\clean.ps1 -Dependencies
```

Pour ouvrir le menu interactif regroupant les commandes, exécutez `.\scripts\menu.ps1`.

Options utiles :
- `.\scripts\dev.ps1 -Port 3000` choisit un autre port pour le serveur de développement.
- `.\scripts\dev.ps1 -Expose` rend le serveur accessible depuis le réseau local.
- `.\scripts\build.ps1 -Preview -Port 5000` prévisualise le build sur un autre port.
- `.\scripts\docker.ps1 -Action Stop` arrête le conteneur nommé `template-react-local`.
- `.\scripts\docker.ps1 -Action Logs` suit ses journaux.

Les commandes Docker nécessitent Docker Desktop (ou un moteur Docker compatible). Les scripts utilisent les commandes npm déjà définies dans `package.json` et s'arrêtent lorsqu'une commande échoue.

## Docker
```bash
docker build -t template-react .
docker run --rm -p 8080:8080 template-react
```
L'image finale sert les fichiers statiques avec Nginx, tourne sans privilèges root, définit des en-têtes de sécurité et expose un endpoint de santé sur `/health`.

## Internationalisation

L’interface propose le français et l’anglais. Le sélecteur de langue est accessible au clavier, la préférence est conservée dans `localStorage`, et l’attribut `lang` du document est mis à jour. La langue du navigateur est utilisée au premier chargement lorsque le français ou l’anglais est détecté ; le français reste la langue de repli. Les traductions typées sont centralisées dans `src/shared/i18n.ts`.

## Architecture
```text
src/
  app/                 # composition et composants racine
  features/            # domaines fonctionnels isolés
  shared/
    components/        # composants UI réutilisables
    lib/               # utilitaires transverses
  test/                # configuration des tests
  main.tsx             # point d'entrée
  styles.css           # styles globaux
e2e/                   # scénarios navigateur Playwright
.github/workflows/     # CI
```

### Principes
- **TypeScript strict** : `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, pas de `any` explicite dans le lint.
- **Architecture par fonctionnalité** : placer chaque domaine dans `src/features/<domaine>`, avec composants, modèles, services et tests. Éviter les imports circulaires.
- **Frontières explicites** : isoler les accès réseau, la configuration et la validation des données externes. Ne jamais considérer les données serveur comme fiables sans validation.
- **Sécurité** : pas de secrets dans le bundle client ; CSP et en-têtes HTTP via Nginx ; dépendances suivies par Dependabot ; permissions minimales dans la CI.
- **Performance** : build optimisé, assets statiques cachables, découpage par route/feature lorsque nécessaire et mesure avant optimisation.
- **Résilience** : tests des comportements critiques, endpoint de santé et échecs CI bloquants.

## Stratégie de tests
- **Unitaires / composants** : Vitest, Testing Library et user-event.
- **Couverture** : seuils initiaux de 80 % lignes/instructions/fonctions et 75 % branches.
- **End-to-end** : Playwright sur Chromium, avec traces et captures sur échec.
- **Anti-régression** : contrôles exécutés en CI sur pull requests et pushs vers `main`.

## Avant une mise en production réelle
Le niveau de sécurité final dépend du produit et de son contexte. Ajouter avant production : validation de schémas pour toutes les entrées externes, stratégie d'authentification/autorisation adaptée, gestion des secrets, scans SAST et de dépendances, sauvegardes/restauration si des données sont persistées, supervision/alerting et tests de charge. Une application frontend seule ne remplace jamais les contrôles de sécurité du backend.

## Reproductibilité des dépendances
Le dépôt ne contient pas encore de lockfile npm. Après installation et validation de l'environnement, générer et committer `package-lock.json`, puis remplacer `npm install` par `npm ci` dans CI et Docker pour des builds reproductibles.
