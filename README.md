# Gearbox — ERP marketing du groupe Bony

Application interne de pilotage marketing : budget, projets, campagnes, digital,
agenda, matériel, chat et jeux. En production sur
**https://gearbox.bonyauto-mobile.com**.

## Architecture

- **Frontend** : React + Vite, Tailwind (chargé en **CDN Play**, pas de build CSS).
- **Backend** : Node/Express + Prisma, Socket.IO pour le temps réel.
- **Base** : **Supabase** (PostgreSQL managé) — il n'y a **pas** de Postgres local ni
  sur le VPS.
- **Fichiers** : volume Docker `gearbox_uploads_data` sur le VPS. Rien dans Supabase,
  aucun S3.
- **Infra** : 3 conteneurs Docker Compose — `api`, `web` (nginx), `caddy`
  (reverse-proxy + HTTPS automatique).

## Par où commencer

**Lisez `CLAUDE.md` en premier** : il décrit la méthodologie de travail, les règles
métier non négociables et les garde-fous. Puis, selon le besoin :

| Fichier | Contenu |
|---|---|
| `CLAUDE.md` | **Méthode de travail**, règles métier, rôles cloisonnés |
| `ETAT-PROJET.md` | État global, historique des correctifs, backlog |
| `ETAT-BACKEND.md` | État détaillé du backend et de ses invariants |
| `BUGS-CONNUS.md` | Bugs ouverts et corrigés, avec leur cause réelle |
| `DEPLOIEMENT.md` | Procédure VPS |
| `RAPPORT-IMPORT.md` | Audit de la reprise des données 2026 |
| `THEME-LIQUID-GLASS.md`, `AMELIORATION-VISUELLE.md` | Charte et contraintes visuelles |
| `BACKEND-AUDIT.md` | ⛔ Historique (juillet 2026), **pas** l'état courant |

## Développement local

Les serveurs se lancent **par nom** depuis `.claude/launch.json` :
`gearbox-web` (port 3000) et `gearbox-api` (port 3001).

À défaut :

```bash
npm install && npm run dev              # frontend, port 3000
npm install --prefix backend && npm run dev --prefix backend   # backend, port 3001
```

⚠️ **Le backend local pointe sur la base Supabase de PRODUCTION** : il n'y a pas de
base de développement. Tout test local écrit dans les vraies données et est visible
des utilisateurs connectés. Créer une entité clairement nommée, la supprimer juste
après, vérifier qu'il ne reste aucun résidu.

⚠️ Le réseau du bureau bloque les ports **22** (SSH/VPS) et **5432/6543**
(Supabase) : toute opération sur la base ou le serveur exige le **hotspot 4G**.

## Déploiement

Voir [DEPLOIEMENT.md](./DEPLOIEMENT.md). En résumé : push sur `master`, puis sur le
VPS `git pull && sudo docker compose up -d --build <service>` — `web` seul si le lot
ne touche que le frontend, `api` **et** `web` dès que `backend/prisma/schema.prisma`
bouge.
