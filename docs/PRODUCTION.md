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

```bash
npm run check
npm run test:e2e
npm run build:server
npm run db:deploy
```

Exécutez aussi les tests de charge du répertoire tests/load dans un environnement de préproduction et une revue de sécurité manuelle. Aucun test de charge ni audit externe n’est réputé exécuté simplement parce que les scripts sont présents.
