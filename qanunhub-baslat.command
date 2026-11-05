#!/bin/sh
# macOS: double-click; Linux: run ./qanunhub-baslat.command
cd "$(dirname "$0")/release" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js tapılmadı. https://nodejs.org saytından LTS versiyasını qurun, sonra bu faylı yenidən açın."
  exit 1
fi
exec node server.mjs
