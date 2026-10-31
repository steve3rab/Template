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

Le refus d'inscription pour une adresse déjà utilisée utilise un message générique, mais la différence entre création réussie et refus peut encore permettre l'énumération d'adresses. Pour un produit public, ajoutez une vérification d'e-mail avec réponse uniforme. Le frontend n'accède jamais au secret de session : il est transmis automatiquement par cookie. Configurez `APP_ORIGIN`, `SESSION_SECRET` et `DATABASE_URL` en production. Utilisez HTTPS et un gestionnaire de secrets en production. La réinitialisation du mot de passe et la gestion des rôles métier sont implémentées ; la vérification d'e-mail et le MFA restent à prévoir selon les besoins du produit.

### Comptes de test (développement local uniquement)

Le script `npm run db:seed:test-users` crée ou réinitialise trois comptes dans la base configurée par `DATABASE_URL` :

| Rôle | Identifiant |
| --- | --- |
| Client (`CUSTOMER`) | `test.customer@example.com` |
| Vendeur (`SELLER`) | `test.seller@example.com` |
| Administrateur (`ADMIN`) | `test.admin@example.com` |

Choisissez un mot de passe de test (12 à 128 caractères), puis lancez ces commandes dans PowerShell depuis la racine du dépôt :

```powershell
$env:ALLOW_TEST_USER_SEED = "true"
$env:TEST_USERS_PASSWORD = "Local-Test-Password-2026!"
npm run db:seed:test-users
Remove-Item Env:ALLOW_TEST_USER_SEED
Remove-Item Env:TEST_USERS_PASSWORD
```

Le mot de passe indiqué est un exemple à remplacer. Les trois comptes utilisent le mot de passe fourni dans `TEST_USERS_PASSWORD`. Le script hache le mot de passe avec Argon2id et invalide les sessions existantes de ces comptes. Il refuse de s'exécuter si `NODE_ENV=production`, mais vérifiez aussi que `DATABASE_URL` pointe bien vers votre base locale avant de le lancer. **Ne réutilisez pas ces comptes ni ce mot de passe en production.**

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

## Architecture et standards de code

Les conventions d'architecture, de TypeScript strict, de validation des entrées, de tests et de commits sont décrites dans [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md). ESLint, Prettier, `.editorconfig` et la CI font partie du contrat du dépôt.

- `src/shared/api/client.ts` centralise les requêtes HTTP, les erreurs API et la validation Zod des réponses. Les écrans ne doivent pas faire confiance à `response.json()` avec une simple assertion TypeScript.
- `src/shared/utils/` contient les utilitaires transverses testés, comme le formatage des montants et le stockage local défensif.
- `server/src/commerce.ts` est le point de composition des routes. Les implémentations sont séparées dans `server/src/routes/` par domaine : catalogue, administration, vendeur, panier, favoris, adresses, commandes, réinitialisation du mot de passe et paiements.
- `server/src/auth/requireUser.ts` centralise la vérification de session et des rôles ; les schémas Zod de requête sont définis dans `server/src/schemas/commerce.ts`.

Toute nouvelle logique réutilisable doit avoir un module et des tests ciblés.

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
  app/                  # composition de l'application et navigation
  features/             # écrans et logique propres à chaque domaine
  shared/
    utils/              # utilitaires transverses testés
    i18n.ts             # traductions et langage
server/
  prisma/               # schéma et migrations
  src/
    app.ts               # configuration Fastify et routes d'authentification
    commerce.ts          # enregistrement des routes commerce
    schemas/             # schémas Zod réutilisables des entrées API
    index.ts             # démarrage du serveur
scripts/                 # commandes PowerShell
.github/workflows/       # CI
```

## Sécurité et production

Le projet fournit une base sécurisée, pas une certification de sécurité. Les limites à traiter avant une exposition publique sont : vérification/récupération d'e-mail, MFA si le risque le justifie, autorisations métier explicites, limitation de débit distribuée (le stockage mémoire est local à chaque instance), journalisation/alerting, sauvegardes et tests de charge. En production, `APP_ORIGIN` doit être une origine HTTPS exacte et `SESSION_SECRET` doit être un secret aléatoire d'au moins 32 caractères. Avant une mise en production réelle : configurer secrets et HTTPS, ajouter journalisation/monitoring et sauvegardes, effectuer des tests de sécurité et de charge, définir les règles d'autorisation, et mettre en place les parcours de récupération de compte. Ne jamais exposer le port de développement directement sur Internet.


## Boutique, clients et vendeurs

Les données de catalogue, panier client authentifié, favoris, adresses et commandes sont maintenant persistées via Prisma. Le catalogue de démonstration est inséré par migration. Les clients peuvent consulter l'historique et le statut de leurs commandes ; les vendeurs autorisés disposent d'un tableau de bord calculé à partir des commandes, peuvent créer/modifier/masquer leurs produits et mettre à jour les statuts de commande. Les commandes multi-vendeurs sont séparées par vendeur pour éviter d'exposer les articles d'un autre vendeur.

Principales routes :
- Public : `GET /api/products`
- Administration : `POST /api/admin/users/:id/role` (ADMIN uniquement, rôles CUSTOMER/SELLER)
- Vendeur : `GET /api/seller/dashboard?days=7|30|90`, `GET/POST /api/seller/products`, `PATCH/DELETE /api/seller/products/:id`, `GET /api/seller/orders`, `PATCH /api/seller/orders/:id/status`
- Client connecté : `GET/PUT /api/customer/cart`, `GET/POST/DELETE /api/customer/favorites`, `GET/POST /api/customer/addresses`, `GET/POST /api/customer/orders`
- Mot de passe oublié : `POST /api/auth/password-reset/request` puis `POST /api/auth/password-reset/complete`

Les comptes publics sont toujours créés en CUSTOMER. Pour attribuer un rôle depuis un environnement opérateur, utilisez `npx tsx server/scripts/set-user-role.ts adresse@example.com SELLER`. Pour initialiser le premier administrateur, exécutez la même commande avec le rôle ADMIN. Ce script ne doit jamais être exposé sur le web ; il invalide les sessions existantes.

## Configuration de production et tests commerciaux

Voir [docs/PRODUCTION.md](docs/PRODUCTION.md) et [server/.env.production.example](server/.env.production.example). En production, l’application exige une origine HTTPS, un secret de session fort et un webhook de livraison de réinitialisation de mot de passe en HTTPS. Le cookie de session couvre désormais les routes API d'authentification et de commerce.

Les pages CGV, confidentialité et retours/remboursements sont des **modèles à compléter et faire valider** avant toute vente. Les coordonnées de l'entreprise, du médiateur, les durées de conservation, les prestataires et les modalités de livraison doivent être exacts.

**Paiement :** Stripe Checkout et les webhooks signés sont implémentés, mais doivent être configurés avec `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` avant utilisation. Le webhook doit écouter `checkout.session.completed`, `checkout.session.async_payment_succeeded` et `checkout.session.expired`. Les commandes ne passent à `PAID` qu'après confirmation signée ; une session impayée expirée annule la commande et libère le stock. Les remboursements, le suivi transporteur et les e-mails transactionnels restent à implémenter. Ne mettez pas en production avant que la CI soit verte et que le flux Stripe ait été testé en mode test puis validé pour l'environnement réel.

Un smoke test de charge k6 est disponible dans `tests/load/k6-smoke.js`. Il nécessite k6 et doit être exécuté contre une préproduction isolée, par exemple `BASE_URL=https://staging.example.com k6 run tests/load/k6-smoke.js`. Ce script n'est pas une preuve qu'un test de charge ou un audit de sécurité a déjà été exécuté.
