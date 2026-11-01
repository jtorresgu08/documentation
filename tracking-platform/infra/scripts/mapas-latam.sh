#!/usr/bin/env bash
# Mapas propios de Safe Connection: descarga solo Latinoamérica del mapa mundial diario de Protomaps (datos de
# OpenStreetMap) a un único archivo PMTiles, más las tipografías e íconos del estilo, en infra/maps (Caddy lo
# publica en /maps). Se puede volver a ejecutar cada mes para actualizar: el archivo nuevo reemplaza al anterior
# solo cuando terminó bien, sin cortar el servicio.
#
# Uso:  ./scripts/mapas-latam.sh            (Latinoamérica, zoom máximo 15)
#       REGION=peru ./scripts/mapas-latam.sh   (solo Perú, para probar)
#       MAXZOOM=14 ./scripts/mapas-latam.sh    (más liviano, menos detalle de calles)
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="$PWD/maps"
TOOLS="$PWD/maps/.tools"
mkdir -p "$OUT/assets" "$TOOLS"

case "${REGION:-latam}" in
  latam) BBOX="-118.5,-56.2,-26.0,33.0" ;;   # México, Centroamérica, Caribe y Sudamérica
  peru)  BBOX="-81.5,-18.5,-68.5,0.1" ;;
  *)     BBOX="$REGION" ;;                  # o un recuadro propio: oeste,sur,este,norte
esac
MAXZOOM="${MAXZOOM:-15}"

# 1. herramienta pmtiles (go-pmtiles), última versión publicada
if [ ! -x "$TOOLS/pmtiles" ]; then
  ARCH=$(uname -m); [ "$ARCH" = "aarch64" ] && ARCH=arm64
  URL=$(curl -fsSL https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
    | grep -o "https://[^\"]*Linux_${ARCH}[^\"]*\.tar\.gz" | head -1)
  echo "Descargando $URL"
  curl -fsSL "$URL" | tar -xz -C "$TOOLS" pmtiles
fi

# 2. extracto de la región desde el mapa mundial más reciente (solo baja las partes necesarias)
BUILD=""
for days in 1 2 3 4 5 6 7; do
  DATE=$(date -u -d "-$days day" +%Y%m%d)
  if curl -fsI "https://build.protomaps.com/$DATE.pmtiles" >/dev/null; then BUILD="https://build.protomaps.com/$DATE.pmtiles"; break; fi
done
[ -n "$BUILD" ] || { echo "No se encontró un mapa mundial reciente en build.protomaps.com"; exit 1; }
echo "Extrayendo $BBOX (zoom 0-$MAXZOOM) de $BUILD ..."
"$TOOLS/pmtiles" extract "$BUILD" "$OUT/latam.new.pmtiles" --bbox="$BBOX" --maxzoom="$MAXZOOM" --download-threads=8
"$TOOLS/pmtiles" show "$OUT/latam.new.pmtiles" | head -20
mv -f "$OUT/latam.new.pmtiles" "$OUT/latam.pmtiles"

# 3. tipografías e íconos del estilo (Protomaps basemaps-assets)
curl -fsSL https://github.com/protomaps/basemaps-assets/archive/refs/heads/main.tar.gz \
  | tar -xz -C "$OUT/assets" --strip-components=1 basemaps-assets-main/fonts basemaps-assets-main/sprites

echo
du -sh "$OUT/latam.pmtiles" "$OUT/assets"
echo "Listo: los mapas propios se usan al recargar la plataforma."
