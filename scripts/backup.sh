#!/usr/bin/env bash
# Резервна копія: база даних + завантажені фото товарів.
# Використання:  ./scripts/backup.sh [каталог]     (типово ./backups)
# Результат:     backups/svizhe-РРРРММДД-ГГХХСС/{db.sql.gz, uploads.tar.gz}
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

DEST="${1:-backups}/svizhe-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

echo "→ База даних"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip > "$DEST/db.sql.gz"

echo "→ Фото товарів"
docker compose exec -T backend tar -czf - -C /app/uploads . > "$DEST/uploads.tar.gz"

echo "Готово: $DEST ($(du -sh "$DEST" | cut -f1))"
