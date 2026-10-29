# API

API REST Fastify en TypeScript, Prisma + SQLite.

```bash
npm run db:generate
npm run db:migrate
npm run dev:server
```

Les routes d'authentification sont documentées dans le README racine. Les sessions sont stockées côté serveur ; seul un jeton aléatoire dans un cookie HttpOnly est remis au navigateur.