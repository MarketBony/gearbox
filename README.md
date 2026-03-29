# Gearbox - Team Management App

Application de gestion d'équipe multi-utilisateurs avec temps réel.

## Architecture

- **Frontend** : React, Vite, Tailwind CSS.
- **Backend** : Node.js, Express, Socket.IO.
- **Database** : PostgreSQL, Prisma.
- **Infrastructure** : Docker Compose, Caddy (Reverse Proxy + SSL).

## Développement Local

1. **Backend** :
   ```bash
   cd backend
   npm install
   # Créer un .env local avec DATABASE_URL
   npm run dev
   ```

2. **Frontend** :
   ```bash
   npm install
   npm run dev
   ```

## Déploiement

Voir [DEPLOIEMENT.md](./DEPLOIEMENT.md).
