#!/usr/bin/env bash
# Відновлення з резервної копії. УВАГА: поточні дані буде замінено.
# Використання:  ./scripts/restore.sh backups/svizhe-20261114-180000
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

SRC="${1:?Вкажіть каталог з резервною копією}"
[ -f "$SRC/db.sql.gz" ] || { echo "У $SRC немає db.sql.gz"; exit 1; }

read -r -p "Поточні дані буде замінено копією з $SRC. Продовжити? [y/N] " answer
[ "$answer" = "y" ] || { echo "Скасовано"; exit 0; }

echo "→ Зупинка API на час відновлення"
docker compose stop backend

echo "→ База даних"
gunzip -c "$SRC/db.sql.gz" | docker compose exec -T db psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 > /dev/null

echo "→ Запуск API"
docker compose start backend

if [ -f "$SRC/uploads.tar.gz" ]; then
  echo "→ Фото товарів"
  docker compose exec -T backend sh -c 'rm -rf /app/uploads/* && tar -xzf - -C /app/uploads' < "$SRC/uploads.tar.gz"
fi
echo "Готово"
