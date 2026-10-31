# Mise en production

## Avant tout déploiement

- Configurez un nom de domaine et terminez TLS/HTTPS au niveau du load balancer ou du reverse proxy géré. Redirigez HTTP vers HTTPS et activez HSTS au niveau de ce proxy après validation.
- Configurez APP_ORIGIN avec l’origine HTTPS exacte, sans chemin.
- Fournissez SESSION_SECRET comme secret aléatoire d’au moins 32 caractères via le gestionnaire de secrets de l’hébergeur. Ne commitez jamais de secret réel.
- Fournissez PASSWORD_RESET_WEBHOOK_URL en HTTPS et PASSWORD_RESET_WEBHOOK_TOKEN. Le service doit accepter un POST JSON avec email, resetUrl et expiresInMinutes puis envoyer le message. L’application échoue volontairement au démarrage en production si cette intégration manque.
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

## Parcours commerciaux incomplets

Le catalogue, le panier, les adresses, les commandes, les favoris et les états vendeur sont persistés. Le paiement réel, les webhooks de paiement signés, les remboursements automatisés, les transporteurs, les e-mails transactionnels et les statistiques de conversion (analytics/visites) ne sont pas intégrés. Le chiffre d’affaires du tableau de bord ne compte que les commandes marquées PAID ; aucune route publique ne doit marquer un paiement comme payé. Connectez un prestataire et validez sa signature webhook avant d’autoriser les ventes réelles.

## Validation avant mise en ligne

```bash
npm run check
npm run test:e2e
npm run build:server
npm run db:deploy
```

Exécutez aussi les tests de charge du répertoire tests/load dans un environnement de préproduction et une revue de sécurité manuelle. Aucun test de charge ni audit externe n’est réputé exécuté simplement parce que les scripts sont présents.
