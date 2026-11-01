# Mapas propios de Safe Connection

Esta carpeta se publica en `https://<tu dominio>/maps/` (ver `Caddyfile`). La llena `scripts/mapas-latam.sh`:

- `latam.pmtiles`: mapa vectorial de Latinoamérica (México a Tierra del Fuego y el Caribe), datos de OpenStreetMap
  en el esquema de Protomaps.
- `assets/fonts` y `assets/sprites`: tipografías e íconos del estilo.

Mientras `latam.pmtiles` no exista, la plataforma usa OpenFreeMap automáticamente.
