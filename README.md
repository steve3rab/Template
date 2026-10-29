# Template React — socle full-stack TypeScript

Socle full-stack construit avec React, TypeScript strict, Vite, Fastify et Prisma. Le frontend utilise une API HTTP typée et un backend modulaire. SQLite est configuré pour le démarrage local ; Prisma permet d'évoluer vers PostgreSQL, MySQL et d'autres moteurs pris en charge en adaptant le provider et la migration.

## Prérequis

- Node.js 22.12+
- npm 10.9+
- Docker (optionnel)

## Installation et démarrage

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\setup.ps1
.\scripts\dev-all.ps1
```

Le frontend est disponible sur http://localhost:5173 et l'API sur http://localhost:3001. Le proxy Vite transmet automatiquement les requêtes `/api` vers le backend.

Pour démarrer séparément :

```powershell
.\scripts\dev.ps1
.\scripts\backend.ps1
```

## Authentification

- Inscription et connexion par e-mail/mot de passe.
- Mots de passe hachés avec Argon2id ; aucun mot de passe en clair n'est stocké.
- Sessions opaques persistées en base, jetons stockés sous forme de hash.
- Cookie de session HttpOnly, SameSite=Lax et Secure en production.
- Validation d'entrée avec Zod, limitation de débit sur les routes d'authentification, CORS limité à l'origine configurée et vérification de l'origine des requêtes mutantes.
- Routes : `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

Le refus d'inscription pour une adresse déjà utilisée utilise un message générique, mais la différence entre création réussie et refus peut encore permettre l'énumération d'adresses. Pour un produit public, ajoutez une vérification d'e-mail avec réponse uniforme. Le frontend n'accède jamais au secret de session : il est transmis automatiquement par cookie. Configurez `APP_ORIGIN`, `SESSION_SECRET` et `DATABASE_URL` en production. Utilisez HTTPS et un gestionnaire de secrets en production. Les flux de réinitialisation de mot de passe, vérification d'e-mail, MFA et gestion des rôles métier restent à ajouter selon les besoins du produit.

## Base de données Prisma + SQLite

Le fichier SQLite local est créé dans `server/prisma/dev.db` par défaut. Les migrations versionnées sont sous `server/prisma/migrations`.

```powershell
npm run db:generate
npm run db:migrate
npm run db:deploy
```

- `db:migrate` crée/applique une migration en développement.
- `db:deploy` applique les migrations existantes, notamment en déploiement.
- `DATABASE_URL=file:./dev.db` est relatif au fichier de schéma Prisma.

SQLite convient au développement et aux déploiements simples sur disque persistant. Pour une API multi-instance ou une forte concurrence d'écritures, préférez PostgreSQL et configurez le provider Prisma correspondant ; le code d'accès aux données reste isolé dans Prisma.

## Contrôles qualité

Les tests couvrent les scénarios d'API (inscription, connexion, déconnexion, expiration de session, validation, cookies, origine, limitation de débit et erreurs internes) ainsi que les interactions du formulaire frontend. Les tests API utilisent un faux dépôt Prisma pour rester rapides et déterministes ; ajoutez en complément des tests d'intégration contre une base SQLite temporaire avant les déploiements majeurs.

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test:coverage
npm run test:e2e
npm run build
npm run build:server
npm run check
```

Installer les navigateurs Playwright lors de la première utilisation E2E :

```bash
npx playwright install chromium
```

## Scripts PowerShell (Windows)

```powershell
.\scripts\setup.ps1
.\scripts\dev-all.ps1
.\scripts\dev.ps1 -Port 5173
.\scripts\backend.ps1 -Port 3001
.\scripts\preview.ps1
.\scripts\test.ps1
.\scripts\test.ps1 -Coverage
.\scripts\test.ps1 -E2E -InstallBrowser
.\scripts\check.ps1
.\scripts\docker.ps1 -Action Build
.\scripts\clean.ps1
```

Le menu interactif est disponible via `.\scripts\menu.ps1`.

## Architecture

```text
src/
  app/
  features/auth/        # interface d'authentification
  shared/               # i18n et composants partagés
server/
  prisma/               # schéma et migrations
  src/
    app.ts               # routes et plugins HTTP
    index.ts             # démarrage du serveur
scripts/                 # commandes PowerShell
.github/workflows/       # CI
```

## Sécurité et production

Le projet fournit une base sécurisée, pas une certification de sécurité. Les limites à traiter avant une exposition publique sont : vérification/récupération d'e-mail, MFA si le risque le justifie, autorisations métier explicites, limitation de débit distribuée (le stockage mémoire est local à chaque instance), journalisation/alerting, sauvegardes et tests de charge. En production, `APP_ORIGIN` doit être une origine HTTPS exacte et `SESSION_SECRET` doit être un secret aléatoire d'au moins 32 caractères. Avant une mise en production réelle : configurer secrets et HTTPS, ajouter journalisation/monitoring et sauvegardes, effectuer des tests de sécurité et de charge, définir les règles d'autorisation, et mettre en place les parcours de récupération de compte. Ne jamais exposer le port de développement directement sur Internet.
