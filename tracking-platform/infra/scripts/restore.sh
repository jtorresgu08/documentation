#!/usr/bin/env bash
# Restaura una copia: ./scripts/restore.sh backups/traccar-AAAAMMDD-HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Indica el archivo .dump a restaurar}"
[ -f "$FILE" ] || { echo "No existe $FILE"; exit 1; }

read -r -p "Esto reemplaza TODOS los datos actuales por ${FILE}. Escribe RESTAURAR para continuar: " answer
[ "$answer" = "RESTAURAR" ] || exit 1

docker compose stop traccar
docker compose exec -T db pg_restore -U traccar -d traccar --clean --if-exists --no-owner "/backups/$(basename "$FILE")"
docker compose start traccar
echo "Restauración completada."
