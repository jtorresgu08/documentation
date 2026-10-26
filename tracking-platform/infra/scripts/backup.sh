#!/usr/bin/env bash
# Copia de seguridad de PostgreSQL. Programar con cron (ejemplo diario a las 03:15):
#   15 3 * * * cd /opt/rastreo/tracking-platform/infra && ./scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

RETENTION="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="traccar-${STAMP}.dump"
mkdir -p backups

docker compose exec -T db pg_dump -U traccar -d traccar -Fc -f "/backups/${FILE}"
echo "$(date -Is) copia creada: backups/${FILE} ($(du -h "backups/${FILE}" | cut -f1))"

find backups -name 'traccar-*.dump' -mtime "+${RETENTION}" -delete

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "backups/${FILE}" "${RCLONE_REMOTE}" && echo "$(date -Is) copia externa subida a ${RCLONE_REMOTE}"
fi
