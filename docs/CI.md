# Intégration continue et stratégie de tests

## Déclenchement et jobs

Le job qualité commence par analyser la syntaxe de tous les fichiers PowerShell du dossier `scripts/` avec PowerShell Core. Une erreur de parsing bloque la CI avant l'installation des dépendances.

Le workflow [CI](../.github/workflows/ci.yml) s'exécute lors d'un push sur `main`, d'une pull request et à la demande (`workflow_dispatch`). Les jobs s'exécutent sur Ubuntu avec Node.js 22.16.0 et npm 10.9.4.

- **`quality`** : installation, génération Prisma, migrations, TypeScript, ESLint, Prettier, couverture frontend, couverture backend, build frontend et build serveur.
- **`e2e`** : installation, génération Prisma, migrations, installation de Chromium et tests Playwright desktop, mobile et tablette. La suite `e2e/quality.spec.ts` contrôle le changement FR/EN, la navigation légale, les landmarks, les noms accessibles des boutons, les attributs `alt` et l'utilisation clavier du panier.
- **`postgres-concurrency`** : démarre PostgreSQL 16, génère le client Prisma dédié, pousse le schéma PostgreSQL et vérifie les réservations de stock et transitions de commande concurrentes.
- **`docker`** : construction de l'image avec Buildx, sans publication (`push: false`).
- **`windows-scripts`** : exécute réellement les helpers PowerShell sur Windows, vérifie les outils et la parité Prisma, démarre frontend/API puis vérifie leurs endpoints et arrête l'arbre des processus.

Les jobs `quality` et `e2e` utilisent une base SQLite éphémère ; le job `postgres-concurrency` utilise un service PostgreSQL 16 éphémère. Les secrets de session et identifiants de base sont réservés aux tests et ne doivent jamais être réutilisés en production.

## Commandes locales

Depuis la racine du dépôt :

```bash
npm ci --legacy-peer-deps
npm run db:generate
npm run db:deploy
npm run typecheck
npm run lint
npm run format:check
npm run test:coverage
npm run test:coverage:server
npm run build
npm run build:server
npm run db:seed:test-users
npm run test:e2e
```

La commande `npm run check` regroupe typecheck, lint, format, couverture frontend et backend, puis les deux builds. Les tests E2E restent séparés.

Sous Windows, le menu interactif `.\\scripts\\menu.ps1` est organisé en rubriques : démarrage/arrêt, qualité et build, tests et charge, base de données, Docker et maintenance. Il appelle les mêmes scripts PowerShell que les commandes directes, avec un retour au menu après chaque action.

- `setup.ps1` utilise `npm ci` pour une installation reproductible, vérifie les versions Node/npm, contrôle les processus Node du dépôt, génère les deux clients Prisma, applique les migrations puis vérifie leur statut et la parité des schémas.
- `dev-all.ps1` contrôle les ports, démarre l'API puis le frontend dans le terminal courant, dans des processus séparés, et vérifie que les ports deviennent actifs.
- `stop-dev-all.ps1` retrouve les processus démarrés par les scripts du dépôt et arrête leurs arbres de processus (Node inclus).
- `seed-test-users.ps1` demande un mot de passe masqué et ne l'écrit pas dans les arguments de commande ni dans un fichier.
- `test.ps1 -Mode` propose `All`, `Unit`, `Integration`, `Coverage`, `E2E`, `LoadSmoke` et `LoadStress`.

Avant une préparation Prisma sous Windows, arrêtez les serveurs et tests encore actifs. `setup.ps1` recherche les processus `node.exe` dont la ligne de commande référence le dépôt et interrompt la préparation en affichant leurs PID ; cela évite que le moteur natif Prisma chargé provoque `EPERM: operation not permitted, rename`. Utilisez `.\\scripts\\stop-dev-all.ps1` pour les serveurs démarrés par le menu ; fermez manuellement les autres processus Node du dépôt.

Le seed charge d'abord `server/.env`, puis le fichier `.env` à la racine en repli. Il refuse les environnements de production, préproduction et staging, exige une origine locale `APP_ORIGIN` et vérifie que `DATABASE_URL` désigne un fichier SQLite ou une base dont l'hôte est local. Le mot de passe masqué fourni au script PowerShell est transmis via `TEST_USERS_PASSWORD` uniquement pour le processus du seed ; ne créez jamais ces comptes sur un environnement distant.

## Accessibilité et tests de charge

Les tests Playwright incluent des contrôles de fumée pour le changement de langue FR/EN, les zones sémantiques, le titre principal, les noms accessibles des boutons, les attributs `alt` des images et l'ouverture/fermeture clavier du panier. Ils ne remplacent pas un audit WCAG complet avec lecteur d'écran et outils spécialisés. Le catalogue de traduction est également contrôlé par `src/shared/i18n.test.ts`. Le scénario bilingue couvre la boutique, le compte client, l'espace vendeur, l'administration et la navigation légale. Pour lancer localement ces tests de rôle, exécuter d'abord `npm run db:seed:test-users` sur une base locale ; le mot de passe de test de repli est réservé au développement.

Deux profils k6 sont disponibles, mais ne sont pas exécutés automatiquement dans la CI :

- `npm run test:load:smoke` : montée courte jusqu'à 25 utilisateurs virtuels, seuil p95 de 500 ms.
- `npm run test:load:stress` : montée progressive jusqu'à 100 utilisateurs virtuels, seuils p95 de 800 ms et p99 de 1 500 ms.

Exécutez-les uniquement contre une préproduction isolée, jamais contre la production sans autorisation et fenêtre de test. Exemple : `BASE_URL=https://staging.example.test npm run test:load:stress`. Les seuils sont des objectifs de test initiaux, pas une capacité garantie ; surveillez aussi CPU, mémoire, pool de connexions et latence de la base.

Pour installer Chromium la première fois :

```bash
npx playwright install chromium
```

## Seuils de couverture

Les seuils sont définis dans `vite.config.ts` et sont bloquants :

- **Ensemble du projet** : statements 55 %, branches 45 %, functions 50 %, lines 55 %.
- **Backend (`server/src/**`)** : statements 75 %, branches 60 %, functions 80 %, lines 77 %.

Ces seuils ont été relevés après observation du dernier rapport CI (couverture globale : 68,16 % statements / 61,21 % branches / 61,57 % functions / 70,12 % lines ; backend isolé : 81,82 % / 73,59 % / 86,50 % / 84,14 %). Ils restent des planchers et doivent être augmentés par étapes, sans masquer les fichiers insuffisamment couverts.

Le contrôle frontend inclut les fichiers de test configurés par Vitest ; le backend est également exécuté séparément avec `npm run test:coverage:server`. Les seuils constituent un plancher anti-régression, pas un objectif de couverture finale. Augmentez-les progressivement lorsque de nouveaux tests sont ajoutés. Ne diminuez jamais un seuil pour faire passer une CI sans justification documentée.

## Règles de prévention des régressions

- Toute correction de bug doit inclure un test qui échoue avant la correction et passe après.
- Toute route protégée doit tester l'absence de session, le rôle incorrect et l'accès autorisé.
- Les limites de débit doivent vérifier le nombre de requêtes autorisées puis la réponse `429`, avec une clé client déterministe dans les tests.
- Les flux de paiement doivent tester les signatures webhook, les événements répétés, les expirations, les remboursements partiels/complets, les reprises idempotentes et le rapprochement externe.
- Les opérations sensibles aux courses doivent avoir des tests PostgreSQL réels, pas uniquement des mocks Prisma ou SQLite.
- Les changements de schéma doivent inclure une migration Prisma et une vérification sur une base temporaire.
- La CI exécute `prisma migrate status` après déploiement des migrations SQLite et compare les modèles Prisma SQLite/PostgreSQL pour empêcher leur dérive. Le job PostgreSQL exécute séparément le schéma PostgreSQL sur un service éphémère ; il ne prétend pas valider une chaîne de migrations PostgreSQL de production tant que celle-ci n'est pas versionnée séparément.
- Les parcours critiques doivent être couverts par Playwright, sur desktop et mobile lorsque l'interface est concernée.
- Ne pas modifier les attentes d'un test uniquement pour masquer une régression ; corriger le comportement ou expliquer précisément le contrat attendu.

## Lecture du résultat CI

Un job vert signifie uniquement que les commandes de ce job ont réussi sur le commit testé et dans l'environnement CI. Il ne prouve pas à lui seul la conformité réglementaire, la sécurité de production, la capacité en charge, la délivrabilité des e-mails, ni le bon fonctionnement des intégrations externes en environnement réel.

Le job Docker construit l'image frontend Nginx sans la publier. Selon `docs/PRODUCTION.md`, l'API Fastify doit être déployée comme un service séparé ; le succès de la construction Docker ne signifie donc pas que toute l'application a été déployée.
