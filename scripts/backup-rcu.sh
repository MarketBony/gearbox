#!/bin/sh
# =====================================================================
# Sauvegarde nocturne de la base du RCU (CRM), SUR LE VPS (12/10/2026, lot 1 du CRM).
#
# La base `rcu-db` ne quitte jamais le VPS (décision R1 de RCU-CADRAGE.md) : ni Supabase, ni GitHub, ni
# copie externe. Cette copie protège des ERREURS (volume effacé, mauvaise manipulation), pas d'une panne du
# disque. Ce que DCS envoie se réimporte ; ce que les équipes Bony saisissent (lots 3 et suivants), non.
# Données nominatives : dossier lisible par root seulement. 14 jours gardés.
#
# Installé dans la crontab de root (voir DEPLOIEMENT.md) :
#   45 3 * * * /home/ubuntu/gearbox/scripts/backup-rcu.sh >> /var/log/gearbox-backup-rcu.log 2>&1
# Restaurer (exemple, base vidée au préalable) :
#   gunzip -c <archive> | docker compose -f /home/ubuntu/gearbox/docker-compose.yml exec -T rcu-db psql -U rcu -d rcu
# =====================================================================
set -eu
DEST=/var/backups/rcu
DAY=$(date +%F)
mkdir -p "$DEST" && chmod 700 "$DEST"
docker compose -f /home/ubuntu/gearbox/docker-compose.yml exec -T rcu-db pg_dump -U rcu -d rcu --no-owner \
  | gzip > "$DEST/rcu-$DAY.sql.gz.part"
mv "$DEST/rcu-$DAY.sql.gz.part" "$DEST/rcu-$DAY.sql.gz"
echo "$(date -Is) rcu : $(du -h "$DEST/rcu-$DAY.sql.gz" | cut -f1)"
find "$DEST" -name '*.sql.gz' -mtime +14 -delete
find "$DEST" -name '*.part' -mtime +1 -delete
