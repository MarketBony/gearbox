# ÉTAT PROJET GEARBOX — synthèse au 9 juillet 2026

> Mémoire de référence sur l'état actuel du projet, à mettre à jour à chaque
> session (comme ETAT-BACKEND.md l'est pour le backend).

## Déploiement
- En ligne : https://gearbox.bonyauto-mobile.com (VPS OVH, vps-58e5eff3.vps.ovh.net,
  51.83.75.181)
- Architecture : 3 conteneurs Docker (api / web / caddy), HTTPS auto via Caddy/Let's
  Encrypt, base Supabase (pas de Postgres local)
- Repo GitHub privé : MarketBony/gearbox — clone sur VPS via deploy key SSH dédiée
  (lecture seule)
- master = prod, synchronisés (SHA actuel : `cb7669b` — Merge fix/responsive-mobile)
- Procédure complète de déploiement à jour dans DEPLOIEMENT.md

## Historique des correctifs post-déploiement (par ordre chronologique)
1. Prep déploiement : Supabase branché dans docker-compose, Dockerfile backend créé,
   Caddyfile route /uploads, volume uploads_data, server.ts (monolithe mort) supprimé
2. Fix Dockerfile : openssl/ca-certificates manquants (Prisma schema engine crashait)
3. Fix logos : logo-white.svg/logo-color.svg déplacés de la racine vers public/ (non
   copiés par vite build sinon)
4. Fix droits Director : aligné sur Administrator partout sauf Jeux (règle métier
   stricte) — projects, campaigns, fixedExpenses, contacts, tags, equipment, users
   (backend + frontend) + bug bonus DigitalManager/Digital Manager dans tags.ts
5. Nettoyage : guard 400 sur /api/auth/login (évite un 500 Prisma sur body vide),
   suppression du <link> /index.css mort, DEPLOIEMENT.md réaligné sur l'archi réelle
6. Audit + fix responsive mobile complet : h-screen→h-full (pattern transversal),
   tableaux scrollables (Projects, Settings), rows empilées (Digital), headers
   wrap (Budget, FixedExpenses, Material, Agenda, Expenses), vue liste mobile pour
   les calendriers (Agenda + Material), zones tactiles agrandies (jeux, Settings)

## Comptes
- Comptes de démo du seed (theo/admin, admin/password, etc.) recréés par Bastien
  avec de vrais comptes/mots de passe via la Gestion des Utilisateurs
- Route /api/seed bloquée en production (403) — ne peut plus être redéclenchée

## Backlog en attente (rien d'urgent, le site fonctionne)
- PWA (manifest.json + service worker) — prévu "juste avant déploiement" dans le
  brief d'origine, jamais fait, toujours pertinent (HTTPS dispo, condition remplie)
- Nettoyage des branches locales déjà mergées : chore/deploy-vps-prep,
  fix/dockerfile-openssl, fix/logos-public, fix/director-roles,
  chore/post-deploy-cleanup, fix/responsive-mobile (+ docs/etat-projet une fois
  mergée)
- Réactions emoji du Chat non accessibles sur mobile (masquées au survol) — laissé
  de côté volontairement lors du lot responsive, nécessite un appui long ou un menu
- Vues Trimestre/Semestre/Année de l'Agenda : pas de vue mobile dédiée (contrairement
  à Semaine/Mois) — les barres Gantt compressent sans déborder, jugé acceptable
- Point technique à garder en tête : Tailwind est chargé en CDN Play → les variantes
  md:/lg: ne fonctionnent pas sur les classes custom (gx-*, glass-*), seulement sur
  les utilitaires Tailwind standards

## Contraintes d'environnement toujours actives
- Réseau bureau bloque les ports sortants 22 (SSH) et 5432/6543 (Postgres/Supabase)
  → hotspot 4G obligatoire pour toute opération VPS ou DB depuis ce poste
