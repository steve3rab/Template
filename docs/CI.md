# Intégration continue et stratégie de tests

## Déclenchement et jobs

Le workflow [CI](../.github/workflows/ci.yml) s'exécute lors d'un push sur `main`, d'une pull request et à la demande (`workflow_dispatch`). Les jobs s'exécutent sur Ubuntu avec Node.js 22.16.0 et npm 10.9.4.

- **`quality`** : installation, génération Prisma, migrations, TypeScript, ESLint, Prettier, couverture frontend, couverture backend, build frontend et build serveur.
- **`e2e`** : installation, génération Prisma, migrations, installation de Chromium et tests Playwright.
- **`docker`** : construction de l'image avec Buildx, sans publication (`push: false`).

La CI utilise une base SQLite éphémère et des secrets de session réservés aux tests. Ces valeurs ne doivent jamais être réutilisées en production.

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
npm run test:e2e
```

La commande `npm run check` regroupe typecheck, lint, format, couverture frontend et backend, puis les deux builds. Les tests E2E restent séparés.

Sous Windows, le menu interactif `.\\scripts\\menu.ps1` propose aussi :

- **1** : préparer le projet (installation, génération Prisma et migrations), sans lancer de tests.
- **17** : exécuter les mêmes étapes que l'option 1, puis créer/réinitialiser les comptes de test locaux avec `npm run db:seed:test-users`.

L'option 17 est réservée au développement local. Le seed refuse les environnements de production, préproduction et staging et exige une origine locale `APP_ORIGIN`. Avant de lancer les options 1 ou 17 sous Windows, arrêtez les serveurs frontend/backend et les tests encore actifs. `setup.ps1` recherche les processus `node.exe` dont la ligne de commande référence le dépôt et interrompt la préparation en affichant leurs PID ; cela évite que le moteur natif Prisma chargé provoque `EPERM: operation not permitted, rename` pendant la génération du client. Si l'erreur survient malgré tout, fermez les autres processus Node.js du dépôt puis relancez la commande.

Le seed charge d'abord `server/.env`, puis le fichier `.env` à la racine en repli ; l'origine configurée est conservée afin que le seed puisse refuser une cible distante. Le seed utilise le mot de passe de démonstration documenté dans le README ; ne le réutilisez jamais hors de votre machine de développement.

Pour installer Chromium la première fois :

```bash
npx playwright install chromium
```

## Seuils de couverture

Les seuils sont définis dans `vite.config.ts` et sont bloquants :

- **Ensemble du projet** : statements 45 %, branches 35 %, functions 44 %, lines 47 %.
- **Backend (`server/src/**`)** : statements 25 %, branches 20 %, functions 25 %, lines 25 %.

Le contrôle frontend inclut les fichiers de test configurés par Vitest ; le backend est également exécuté séparément avec `npm run test:coverage:server`. Les seuils constituent un plancher anti-régression, pas un objectif de couverture finale. Augmentez-les progressivement lorsque de nouveaux tests sont ajoutés. Ne diminuez jamais un seuil pour faire passer une CI sans justification documentée.

## Règles de prévention des régressions

- Toute correction de bug doit inclure un test qui échoue avant la correction et passe après.
- Toute route protégée doit tester l'absence de session, le rôle incorrect et l'accès autorisé.
- Les limites de débit doivent vérifier le nombre de requêtes autorisées puis la réponse `429`, avec une clé client déterministe dans les tests.
- Les flux de paiement doivent tester les signatures webhook, les événements répétés, les expirations et les états de commande.
- Les changements de schéma doivent inclure une migration Prisma et une vérification sur une base temporaire.
- Les parcours critiques doivent être couverts par Playwright, sur desktop et mobile lorsque l'interface est concernée.
- Ne pas modifier les attentes d'un test uniquement pour masquer une régression ; corriger le comportement ou expliquer précisément le contrat attendu.

## Lecture du résultat CI

Un job vert signifie uniquement que les commandes de ce job ont réussi sur le commit testé et dans l'environnement CI. Il ne prouve pas à lui seul la conformité réglementaire, la sécurité de production, la capacité en charge, la délivrabilité des e-mails, ni le bon fonctionnement des intégrations externes en environnement réel.

Le job Docker construit l'image frontend Nginx sans la publier. Selon `docs/PRODUCTION.md`, l'API Fastify doit être déployée comme un service séparé ; le succès de la construction Docker ne signifie donc pas que toute l'application a été déployée.
