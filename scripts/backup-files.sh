#!/bin/sh
# =====================================================================
# Copie nocturne des FICHIERS de Gearbox, SUR LE VPS (02/10/2026, correctif 66).
#
# Décision de Théo : pas de copie hors du VPS. Cette copie protège donc des ERREURS (fichier supprimé, volume
# effacé par `docker compose down -v`, mauvaise manipulation) mais PAS d'une panne du disque ni de la perte du VPS.
# Volumes copiés : gearbox_uploads_data (projets, avatars, Chat) et gearbox_bonyforms_files (répondants Forms Bony).
# Données personnelles : dossier lisible par root seulement. 7 jours gardés.
#
# Installé dans la crontab de root (voir DEPLOIEMENT.md) :
#   30 3 * * * /home/ubuntu/gearbox/scripts/backup-files.sh >> /var/log/gearbox-backup-files.log 2>&1
# Restaurer un volume (exemple) :
#   docker compose stop api && tar -C /var/lib/docker/volumes/gearbox_uploads_data/_data -xzf <archive> && docker compose start api
# =====================================================================
set -eu
DEST=/var/backups/gearbox-fichiers
DAY=$(date +%F)
mkdir -p "$DEST" && chmod 700 "$DEST"
for v in gearbox_uploads_data gearbox_bonyforms_files; do
  SRC=/var/lib/docker/volumes/$v/_data
  [ -d "$SRC" ] || { echo "$(date -Is) $v absent, ignoré"; continue; }
  tar -C "$SRC" -czf "$DEST/$v-$DAY.tar.gz.part" . && mv "$DEST/$v-$DAY.tar.gz.part" "$DEST/$v-$DAY.tar.gz"
  echo "$(date -Is) $v : $(du -h "$DEST/$v-$DAY.tar.gz" | cut -f1)"
done
find "$DEST" -name '*.tar.gz' -mtime +7 -delete
find "$DEST" -name '*.part' -mtime +1 -delete
