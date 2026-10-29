# Sécurité — revue et exploitation

Ce document décrit les protections présentes et les contrôles restant nécessaires. Il ne constitue pas un audit externe ni une garantie de sécurité.

## Protections actuellement implémentées

- Validation des données d'inscription et de connexion côté serveur avec Zod.
- Mots de passe hachés avec Argon2id ; aucun mot de passe en clair n'est conservé.
- Jetons de session cryptographiquement aléatoires ; seule leur empreinte HMAC est stockée en base.
- Cookie de session `HttpOnly`, `SameSite=Lax`, limité à `/api/auth`, et marqué `Secure` en production.
- Expiration des sessions côté serveur, révocation à la déconnexion et suppression des sessions expirées à leur utilisation.
- Vérification stricte de l'origine des requêtes qui modifient l'état ; CORS limité à l'origine configurée.
- En-têtes de sécurité via Helmet, réponses API non mises en cache, taille de requête limitée, erreurs internes masquées.
- Limitation de débit globale et limites plus strictes sur inscription/connexion.
- Vérification de la configuration de production : secret de session de 32 caractères minimum et origine HTTPS exacte.

## Points sensibles et actions requises avant une mise en production publique

### Critique — configuration et infrastructure

- Définir `NODE_ENV=production`, `APP_ORIGIN=https://votre-domaine-exact` et un `SESSION_SECRET` aléatoire d'au moins 32 caractères via un gestionnaire de secrets. Ne jamais committer de secrets.
- Terminer TLS au niveau d'un reverse proxy fiable. Ne définir `TRUST_PROXY=true` que derrière un proxy maîtrisé ; sinon l'adresse IP utilisée pour la limitation de débit peut être falsifiée.
- Ne pas exposer directement les serveurs Vite ou Fastify de développement à Internet.
- Conserver le fichier SQLite sur un disque persistant, restreindre les permissions et sauvegarder la base avant chaque migration.

### Élevé — identité et sessions

- Ajouter vérification d'adresse e-mail et récupération/réinitialisation de mot de passe avec jetons à usage unique, expirables et stockés sous forme de hash.
- Le message d'inscription en doublon est générique, mais le résultat de création peut encore permettre de déduire si une adresse est déjà enregistrée. Pour une application publique, utiliser un parcours de confirmation d'e-mail avec réponse uniforme.
- Définir une politique de durée de session, de révocation globale, de nombre maximal de sessions et de rotation du secret. Changer le secret invalide les sessions existantes.
- Ajouter MFA si le niveau de risque du produit le requiert.

### Élevé — autorisation et montée en charge

- L'authentification n'est pas une autorisation métier. Chaque nouvelle route privée doit vérifier côté serveur l'identité, les rôles et l'accès à chaque ressource.
- Le rate limiting actuel utilise le stockage mémoire local de Fastify : il n'est pas partagé entre plusieurs instances et se réinitialise au redémarrage. En déploiement multi-instance, utiliser un stockage partagé, par exemple Redis, et configurer les limites selon le risque.
- SQLite est adapté au développement et aux petites installations mono-instance. Pour plusieurs instances ou un débit d'écriture élevé, migrer vers PostgreSQL, prévoir la stratégie de migration et tester la concurrence.

### Opérations continues

- Surveiller les erreurs 5xx, les pics d'échecs de connexion, les refus de rate limiting et l'espace disque, sans journaliser mots de passe, cookies, jetons ni corps d'authentification.
- Mettre à jour les dépendances, examiner les alertes de sécurité, effectuer des tests de charge et une revue de sécurité avant une exposition publique.
- Tester régulièrement la restauration des sauvegardes SQLite et la procédure de déploiement/rollback des migrations.

## Tests

La suite comprend des tests frontend et des tests d'API couvrant les parcours d'authentification, les cookies, l'expiration/révocation de session, les origines, le rate limiting et la non-divulgation des erreurs internes. Les tests API utilisent un faux dépôt Prisma ; ils ne remplacent pas des tests d'intégration avec une base SQLite réelle ni un audit de sécurité indépendant.

Exécuter avant une livraison :

```bash
npm run check
npm run test:e2e
```

## Signalement

Ne publiez pas de détails exploitables dans une issue publique. Utilisez un canal privé avec le propriétaire du dépôt afin de coordonner l'analyse et la correction.
