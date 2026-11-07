# Mise en production

## Avant tout déploiement

- Configurez un nom de domaine et terminez TLS/HTTPS au niveau du load balancer ou du reverse proxy géré. Redirigez HTTP vers HTTPS et activez HSTS au niveau de ce proxy après validation.
- Configurez APP_ORIGIN avec l’origine HTTPS exacte, sans chemin.
- Fournissez SESSION_SECRET comme secret aléatoire d’au moins 32 caractères via le gestionnaire de secrets de l’hébergeur. Ne commitez jamais de secret réel.
- Fournissez PASSWORD_RESET_WEBHOOK_URL en HTTPS et PASSWORD_RESET_WEBHOOK_TOKEN. Le service doit accepter un POST JSON avec email, resetUrl et expiresInMinutes puis envoyer le message. L’application échoue volontairement au démarrage en production si cette intégration manque.
- Configurez STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET dans le gestionnaire de secrets. Créez un webhook Stripe ciblant `POST https://shop.example.com/api/webhooks/stripe` et abonnez-le à `checkout.session.completed`, `checkout.session.async_payment_succeeded` et `checkout.session.expired`. Utilisez le secret de signature `whsec_...` de cet endpoint précis ; ne le confondez pas avec la clé API. En local, le Stripe CLI peut transmettre les événements vers `http://localhost:3001/api/webhooks/stripe`.
- Configurez DATABASE_URL vers un volume persistant. SQLite convient à une instance unique ; utilisez PostgreSQL pour plusieurs instances ou une forte concurrence, après migration et test de restauration.
- Si l’application est derrière un proxy de confiance, activez TRUST_PROXY=true uniquement lorsque le proxy écrase correctement les en-têtes forwarded.
- Exécutez npm run db:generate puis npm run db:deploy comme étape de déploiement contrôlée, avec sauvegarde préalable et procédure de rollback.
- L’image Docker actuelle sert le frontend via Nginx non privilégié. Elle ne lance pas l’API Fastify ni la base de données : déployez l’API comme service séparé, configurez le proxy /api vers ce service, et gardez l’API inaccessible directement depuis Internet.
- Configurez les sauvegardes chiffrées, les alertes, la rétention des journaux, les limites réseau et les mises à jour de dépendances.
- Configurez un Redis compatible Upstash REST avec `RATE_LIMIT_REDIS_REST_URL` (URL HTTPS) et `RATE_LIMIT_REDIS_REST_TOKEN`. Le démarrage de l'API en production échoue si ces paramètres manquent. Le rate limiting utilise alors le compteur atomique Redis partagé entre instances et un identifiant client HMAC dérivé de `SESSION_SECRET`, sans stocker l'adresse IP brute comme clé.
- Le frontend Nginx applique une CSP same-origin stricte : polices, images, scripts et connexions externes sont bloqués. Hébergez les images et polices sur votre propre origine avant déploiement ; les URL Unsplash/Google Fonts distantes ne fonctionneront plus.

## Confidentialité et interdiction de géolocalisation

L'application n'utilise pas la géolocalisation de l'appareil et interdit les API navigateur correspondantes :

- L'en-tête `Permissions-Policy` refuse `geolocation`, caméra, microphone et capteurs de mouvement/orientation.
- Les réponses Fastify et les serveurs Vite (développement/preview) envoient cette politique et la politique `Referrer-Policy: no-referrer`.
- Nginx applique la même politique, interdit le partage du référent HTTP et désactive les journaux d'accès qui conserveraient les adresses IP et les URL des visiteurs.
- Fastify désactive les journaux automatiques de requêtes et les erreurs serveur sont journalisées sans sérialiseur réseau de requête.
- La politique CSP de Nginx limite les connexions réseau du navigateur à l'origine de l'application.

Cette protection bloque la géolocalisation par GPS/Wi-Fi/cellulaire exposée via le navigateur et évite la conservation des IP dans les journaux d'accès de cette configuration Nginx. Elle ne peut pas empêcher le fournisseur d'hébergement, le CDN, le pare-feu ou l'opérateur réseau de traiter une adresse IP pour acheminer les connexions. Configurez également ces services pour désactiver ou anonymiser les journaux IP et leur rétention. Les adresses postales saisies volontairement pour la livraison restent nécessaires au commerce et ne sont pas une géolocalisation GPS.

## Comptes de test

Le seed `npm run db:seed:test-users` et l'option 17 du menu PowerShell sont exclusivement réservés au développement local. Le script bloque les marqueurs d'environnement production, préproduction et staging et exige une origine `APP_ORIGIN` locale. N'exécutez jamais ce seed contre une base de préproduction ou de production : il crée/réinitialise des comptes privilégiés avec un mot de passe de démonstration connu et révoque leurs sessions existantes.

## Attribution du rôle administrateur / vendeur

Les inscriptions publiques créent uniquement des comptes CUSTOMER. Exécutez cette commande depuis un environnement d’administration autorisé pour promouvoir un compte existant et révoquer ses sessions :

```bash
npx tsx server/scripts/set-user-role.ts vendeur@example.com SELLER
npx tsx server/scripts/set-user-role.ts admin@example.com ADMIN
```

Ne rendez jamais ce script accessible par HTTP. L’API d’administration permet ensuite à un compte ADMIN de promouvoir ou rétrograder un utilisateur entre CUSTOMER et SELLER.

## Parcours commerciaux et limites restantes

Le catalogue, le panier, les adresses, les commandes, les favoris et les états vendeur sont persistés. Stripe Checkout et la validation des signatures webhook sont intégrés : les commandes ne passent à `PAID` qu’après un événement signé confirmant le paiement ; les sessions impayées expirées annulent les commandes en attente et libèrent le stock. Les requêtes de paiement doivent rester accessibles uniquement via l’API, et le secret webhook doit correspondre à l’endpoint configuré.

Avant d’encaisser en production, exécutez les tests de bout en bout en mode Stripe test, vérifiez les cas de double événement, annulation, expiration, paiement réussi et indisponibilité du fournisseur, puis configurez les remboursements, le suivi transporteur, les e-mails transactionnels, les obligations légales et la surveillance opérationnelle. Le déploiement de l’API et du frontend doit être vérifié ensemble ; le seul build Docker frontend ne déploie pas le serveur Fastify.

## Validation avant mise en ligne

La CI du dépôt vérifie automatiquement le typage, ESLint, Prettier, les seuils de couverture frontend/backend, les builds frontend/serveur, les parcours Playwright Chromium et la construction de l'image Docker (sans publication). Consultez [CI.md](CI.md) pour le détail et l'historique de validation.

Avant une mise en ligne, exécutez depuis la racine :

```bash
npm ci --legacy-peer-deps
npm run db:generate
npm run check
npm run test:e2e
npm run db:deploy
```

Le passage de la CI est nécessaire mais ne constitue ni un audit de sécurité, ni un test de charge, ni une validation du parcours Stripe en production. Effectuez ces vérifications en préproduction avec les services et secrets de test.

Exécutez aussi `npm run test:load:smoke`, puis `npm run test:load:stress` du répertoire `tests/load` dans un environnement de préproduction isolé et une revue de sécurité manuelle. Les scripts k6 vérifient uniquement la disponibilité et le catalogue public ; ils ne simulent pas encore les parcours authentifiés, les commandes ou les paiements. Aucun test de charge ni audit externe n’est réputé exécuté simplement parce que les scripts sont présents.
