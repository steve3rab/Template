# Qualité et guide d'exploitation

Ce document décrit les contrôles à exécuter avant livraison, les vérifications FR/EN, les tests multi-écrans et les opérations courantes. Il complète [CI.md](CI.md), [PRODUCTION.md](PRODUCTION.md) et [CODING_STANDARDS.md](CODING_STANDARDS.md).

## 1. Contrat qualité

Une modification fonctionnelle doit être accompagnée du niveau de test adapté :

| Changement | Vérification attendue |
| --- | --- |
| Fonction utilitaire, validation ou traduction | Test unitaire Vitest |
| Composant ou interaction React | Test React Testing Library |
| Route API, session ou permission | Test API : anonyme, rôle interdit, rôle autorisé et propriétaire distinct |
| Parcours client, vendeur ou administrateur | Test Playwright sur le parcours concerné |
| Mise en page responsive | Playwright desktop, mobile et tablette |
| Schéma ou transaction | Migration vérifiée et test d'intégration ; PostgreSQL pour les courses concurrentes |
| Texte visible ou navigation | Contrôle FR et EN, attribut `html[lang]` et noms accessibles |

Toute correction de régression doit ajouter un test qui reproduit le défaut. Les tests doivent vérifier le comportement visible et les réponses serveur, pas seulement les détails internes de l'implémentation.

## 2. Couverture des tests

Les planchers de couverture sont configurés dans `vite.config.ts` et contrôlés séparément pour le frontend et le backend :

- Global : 55 % statements, 45 % branches, 50 % functions, 55 % lines.
- Backend : 75 % statements, 60 % branches, 80 % functions, 77 % lines.

Ces valeurs sont des seuils minimaux anti-régression, pas une cible finale. Après chaque évolution, consultez les rapports texte et LCOV produits dans `coverage/`. Identifiez les modules métier peu couverts, ajoutez des tests sur les branches réellement atteignables, puis augmentez progressivement les seuils. Ne baissez pas un seuil pour contourner un échec ; documentez toute exception temporaire.

Commandes :

```bash
npm run test:coverage
npm run test:coverage:server
npm run test:integration
npm run test:e2e
```

Priorités de couverture : authentification et sessions, permissions et isolation des données, panier, commandes, stock, paiements/remboursements, adresses, favoris, écrans vendeur et administration.

## 3. Tests mobiles et accessibilité

Playwright exécute les scénarios sur Chromium desktop, Pixel 7 et iPad Mini. Les tests de qualité contrôlent notamment :

- absence de débordement horizontal à 320 px ;
- visibilité du contenu principal et des zones de navigation ;
- présence d'un titre principal ;
- nom accessible des boutons ;
- attribut `alt` présent sur les images ;
- changement de langue sans perte de navigation ;
- ouverture et fermeture clavier du panier.

Commandes :

```bash
npx playwright install chromium
npm run test:e2e
```

Ces contrôles sont des tests de fumée. Avant une mise en production, compléter par une revue manuelle clavier (Tab, Maj+Tab, Entrée, Espace, Échap), zoom 200 %, contrastes, focus visible, VoiceOver/NVDA et vérification des formulaires/erreurs. Ils ne constituent pas une certification WCAG.

## 4. Contrôle français / anglais

Le catalogue de traductions se trouve dans `src/shared/i18n.ts`. Les libellés métier de la boutique sont également traduits au niveau des composants qui les affichent.

Pour chaque nouvelle page ou fonctionnalité :

1. Ajouter les textes français et anglais au même changement.
2. Ne pas afficher de clé technique, de texte de débogage ou de libellé de base de données.
3. Vérifier les boutons, champs, placeholders, validations, toasts, états vides, erreurs API, confirmations et contenus légaux.
4. Vérifier le changement de langue sur une page déjà ouverte.
5. Vérifier que `document.documentElement.lang` vaut `fr` ou `en` selon la langue active.
6. Vérifier que la langue choisie reste cohérente après navigation et rechargement.

Tests automatiques disponibles :

- `src/shared/i18n.test.ts` vérifie la parité des clés et l'absence de chaînes vides dans le catalogue.
- `e2e/quality.spec.ts` vérifie le changement FR/EN sur la boutique et le compte client, la navigation légale, les landmarks, les noms de boutons et un parcours clavier mobile.

La vérification automatique ne peut pas garantir la qualité éditoriale de chaque traduction. Une relecture humaine reste nécessaire, en particulier pour les conditions contractuelles et les messages de paiement.

## 5. Démarrage et arrêt en local

Prérequis : Node.js 22.16 ou supérieur, npm 10.9 ou supérieur. Depuis la racine :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\setup.ps1
.\scripts\dev-all.ps1
```

Le frontend est servi sur `http://localhost:5173`, l'API sur `http://localhost:3001`. Contrôler la disponibilité avec `GET /api/health`. Arrêter les processus lancés par le script avec :

```powershell
.\scripts\stop-dev-all.ps1
```

Si Prisma ne peut pas remplacer son moteur natif sous Windows, arrêter les processus Node.js du dépôt avant de relancer `setup.ps1`. Ne pas supprimer la base locale sans sauvegarde si elle contient des données utiles.

## 6. Vérifications avant livraison

Exécuter dans cet ordre et corriger chaque erreur avant de poursuivre :

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

La commande `npm run check` regroupe le typage, ESLint, Prettier, les couvertures frontend/backend et les builds ; les tests Playwright restent une étape séparée. Sur GitHub, vérifier tous les jobs du commit concerné, et pas seulement le badge global. Un commit sans statut ou sans exécution de workflow n'est pas une validation CI.

## 7. Exploitation et diagnostic

| Symptôme | Contrôles à effectuer |
| --- | --- |
| Frontend inaccessible | Vérifier le port frontend, le processus Vite et les logs du terminal |
| API indisponible | Appeler `/api/health`, vérifier le port backend, les variables d'environnement et les logs Fastify |
| Erreur de connexion DB | Vérifier `DATABASE_URL`, l'existence du volume/fichier et `npm run db:status` |
| Migration en attente | Sauvegarder la base, examiner la migration, puis exécuter `npm run db:deploy` |
| Session refusée | Vérifier le cookie, HTTPS/SameSite, `APP_ORIGIN` et `SESSION_SECRET` sans jamais journaliser les secrets |
| Erreur 403 | Vérifier le rôle et la propriété de la ressource côté serveur ; ne pas contourner le contrôle dans l'interface |
| Erreur 429 | Vérifier la fréquence d'appel et les limites configurées ; le stockage rate-limit mémoire n'est pas partagé entre plusieurs instances |
| Paiement en attente | Vérifier la livraison du webhook Stripe et sa signature ; ne jamais marquer manuellement une commande payée sans confirmation fiable |

## 8. Sauvegarde et retour arrière

Avant toute migration de production :

1. Confirmer qu'une sauvegarde récente est disponible et restaurable.
2. Déployer le code et les migrations dans une fenêtre contrôlée.
3. Vérifier la santé API, l'accès catalogue, la connexion client et les journaux.
4. Surveiller les erreurs API, les paiements, les temps de réponse et la base.
5. En cas d'incident, arrêter les changements, conserver les journaux et appliquer une procédure de restauration testée.

SQLite est adapté à une instance unique avec stockage persistant. Pour plusieurs instances ou des écritures concurrentes soutenues, utiliser PostgreSQL et vérifier le comportement sur une base de préproduction. Ne jamais effectuer de test de charge sur la production sans autorisation et plan de test.

## 9. Limites connues

Les tests automatiques ne remplacent pas un audit de sécurité, une revue éditoriale bilingue, un test complet des prestataires externes ou une validation de capacité en production. Les scénarios k6 doivent être exécutés explicitement contre une préproduction isolée. Les tests clavier automatisés ne remplacent pas les essais avec lecteur d'écran.
