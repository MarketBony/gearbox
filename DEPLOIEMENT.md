# Guide de Déploiement Gearbox sur OVH (VPS Ubuntu)

Ce guide détaille les étapes pour déployer l'application Gearbox sur un VPS OVH vierge.

## Prérequis

- Un VPS Ubuntu 22.04 chez OVH.
- Un nom de domaine pointant vers l'IP du VPS (ex: `gearbox.mon-domaine.com`).
- Accès SSH root au VPS.

## 1. Installation de Docker & Docker Compose

Connectez-vous à votre VPS en SSH :
```bash
ssh ubuntu@votre-ip-vps
```

Exécutez les commandes suivantes pour installer Docker :

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

## 2. Installation de l'application

Clonez le dépôt (ou copiez les fichiers via SCP/SFTP) :

```bash
git clone <votre-repo-url> gearbox
cd gearbox
```

## 3. Configuration

Copiez le fichier d'exemple et éditez-le :

```bash
cp .env.example .env
nano .env
```

Remplissez les variables :
- `DOMAIN` : Votre nom de domaine (ex: `https://gearbox.mon-entreprise.com`). **Important : mettez https://**.
- `ADMIN_EMAIL` : Votre email pour les certificats SSL Let's Encrypt.
- `POSTGRES_PASSWORD` : Choisissez un mot de passe fort pour la base de données.
- `JWT_SECRET` : Une chaîne aléatoire longue pour sécuriser les sessions.

## 4. Lancement

Lancez l'application en mode détaché :

```bash
sudo docker compose up -d --build
```

Docker va :
1. Construire le backend et le frontend.
2. Lancer la base de données Postgres.
3. Appliquer les migrations de base de données.
4. Lancer le serveur web et le proxy Caddy.
5. Caddy va automatiquement générer un certificat HTTPS valide.

## 5. Vérification & Premier Login

Accédez à `https://votre-domaine.com`.

Connectez-vous avec les identifiants par défaut (seed) :
- **Login** : `admin`
- **Mot de passe** : `password` (ou celui défini dans le seed si modifié)

## Maintenance

- **Mise à jour** : `git pull && sudo docker compose up -d --build`
- **Logs** : `sudo docker compose logs -f`
- **Backup DB** : `sudo docker compose exec db pg_dump -U postgres gearbox > backup.sql`
