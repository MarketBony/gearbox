# Guide de Déploiement Gearbox sur OVH (VPS Ubuntu)

Ce guide décrit le déploiement de GEARBOX sur un VPS Ubuntu, tel qu'appliqué en
production le 8 juillet 2026 (gearbox.bonyauto-mobile.com, VPS OVH 51.83.75.181).

Architecture : 3 conteneurs Docker Compose — `api` (Express/Prisma), `web` (nginx
servant le build Vite), `caddy` (reverse-proxy + HTTPS automatique). **La base de
données est Supabase (PostgreSQL managé)** : aucun Postgres local sur le VPS.

## Prérequis

- Un VPS Ubuntu (22.04 ou plus récent) avec accès SSH par clé et sudo NOPASSWD.
- Un nom de domaine pointant vers l'IP du VPS (ex : `gearbox.bonyauto-mobile.com`).
- Un projet Supabase provisionné avec les migrations Prisma déjà appliquées et le
  premier compte créé (voir « Premier accès » plus bas si l'instance est vierge).
- Le VPS doit pouvoir sortir vers Supabase sur les ports **5432** (migrations) et
  **6543** (runtime) — c'est le cas par défaut sur un VPS OVH.

## 1. Deploy key GitHub (repo privé)

Le repo `MarketBony/gearbox` est **privé** : le clone se fait en SSH via une deploy
key dédiée, en lecture seule. Sur le VPS :

```bash
# Clé dédiée au déploiement, sans passphrase
ssh-keygen -t ed25519 -C "gearbox-deploy-readonly" -f ~/.ssh/gearbox_deploy_key -N ""

# Dire à git d'utiliser cette clé pour github.com
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/gearbox_deploy_key
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

cat ~/.ssh/gearbox_deploy_key.pub
```

Ajouter la clé publique affichée sur
**github.com/MarketBony/gearbox/settings/keys** → « Add deploy key », en laissant
« Allow write access » **décoché** (lecture seule). Puis vérifier :

```bash
ssh -T git@github.com
# Attendu : "Hi MarketBony/gearbox! You've successfully authenticated..."
```

## 2. Installation de Docker & Docker Compose

```bash
# Mettre à jour les paquets
sudo apt update && sudo apt upgrade -y

# Installer les dépendances
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Ajouter la clé GPG Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Ajouter le dépôt Docker
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Installer Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Vérifier l'installation
sudo docker compose version
```

## 3. Installation de l'application

```bash
git clone git@github.com:MarketBony/gearbox.git ~/gearbox
cd ~/gearbox
```

## 4. Configuration

Créer `~/gearbox/.env` (jamais committé, `chmod 600`) avec **exactement 5
variables** — modèle dans `.env.example` :

| Variable | Contenu |
|---|---|
| `DOMAIN` | Le domaine **sans** `https://` (ex : `gearbox.bonyauto-mobile.com`) — Caddy gère le protocole et le certificat |
| `ADMIN_EMAIL` | Email Let's Encrypt (notifications de certificat) |
| `JWT_SECRET` | Secret de session, propre à la prod : `openssl rand -hex 32` |
| `DATABASE_URL` | Pooler **transaction** Supabase, port 6543, avec `?pgbouncer=true` |
| `DIRECT_URL` | Pooler **session** Supabase, port 5432, sans `?pgbouncer=true` (utilisé par `prisma migrate deploy`) |

Il n'y a **plus** de `POSTGRES_PASSWORD` : aucun Postgres local, la base est
Supabase. Les URLs se récupèrent dans le dashboard Supabase (Connection pooling).

## 5. Lancement

```bash
sudo docker compose up -d --build
```

Docker lance les **3 services** :

1. `api` — build du backend (Dockerfile multi-stage), puis au démarrage
   **`npx prisma migrate deploy`** (applique les migrations manquantes sur
   Supabase — pas de `db push`) et `node dist/index.js`.
2. `web` — build Vite du frontend, servi par nginx (interne).
3. `caddy` — reverse-proxy : `/api/*`, `/socket.io/*` et `/uploads/*` vers l'api,
   tout le reste vers le web. Obtient et renouvelle automatiquement le certificat
   HTTPS Let's Encrypt.

Seul caddy expose des ports publics (80/443). Les uploads sont persistés dans le
volume Docker `uploads_data` (ils survivent aux rebuilds).

## 6. Premier accès

Accéder à `https://votre-domaine.com` et se connecter avec un compte existant.

**Note pour une TOUTE NOUVELLE instance (base entièrement vierge)** : la route
`/api/seed` est **volontairement bloquée en production** (403) car elle
réinitialise les mots de passe à des valeurs de démo. Le premier compte Master
doit donc être créé **avant** la mise en prod :

- soit en lançant une fois le backend en local/dev (`NODE_ENV` différent de
  `production`) contre la base cible et en déclenchant `/api/seed` une seule fois ;
- soit par insertion directe en base (Prisma Studio ou SQL) d'un utilisateur avec
  `passwordHash` bcrypt.

Dans les deux cas, **changer immédiatement le mot de passe** de ce compte après la
première connexion.

## Maintenance

- **Mise à jour** : `cd ~/gearbox && git pull && sudo docker compose up -d --build`
  — cibler un seul service quand la modif ne touche qu'un côté :
  `sudo docker compose up -d --build api` (backend seul) ou `--build web`
  (frontend seul), pour éviter un rebuild inutile de l'autre.
- **Cache navigateur** : aucune purge manuelle à prévoir. `nginx.conf` sert
  `/assets/` (noms hashés par Vite) en `immutable` 1 an, et `index.html` en
  `no-cache, must-revalidate` — un rechargement sert donc toujours le dernier
  build. Attention : un onglet **déjà ouvert** continue de tourner sur l'ancien
  bundle jusqu'à son rechargement, c'est normal et sans rapport avec le cache
  HTTP. Si `nginx.conf` est modifié, valider la syntaxe avant de déployer :
  `sudo docker run --rm -v /chemin/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine nginx -t`
  (une config invalide empêche `web` de démarrer, donc coupe le site).
- **Logs** : `sudo docker compose logs -f` (ou `logs -f api`)
- **État des conteneurs** : `sudo docker compose ps`
- **Base de données** : gérée par Supabase (backups/PITR côté dashboard Supabase —
  pas de `pg_dump` local, il n'y a pas de conteneur db).
