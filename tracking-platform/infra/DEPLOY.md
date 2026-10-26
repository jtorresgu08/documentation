# Despliegue en Contabo u OVH

Guía para poner la plataforma en producción en un VPS con Ubuntu 24.04.

## 1. Servidor recomendado

| Dispositivos | VPS | RAM | Disco |
|---|---|---|---|
| hasta 1.000 | Contabo Cloud VPS 20 / OVH VPS-2 | 8 GB | 100 GB+ NVMe |
| 1.000 – 5.000 | Contabo Cloud VPS 40 / OVH VPS-4 | 16–24 GB | 200 GB+ NVMe |

Traccar guarda una fila por posición: con 1.000 equipos reportando cada 30 s son ~2,9 M de filas al día. Planifica
el disco y configura la limpieza de datos antiguos (ver apartado 7).

## 2. DNS

Crea un registro **A** del dominio (p. ej. `rastreo.tuempresa.com`) hacia la IP del VPS. Caddy pedirá el
certificado HTTPS automáticamente en cuanto el dominio resuelva.

## 3. Preparar el servidor (una sola vez)

```bash
ssh root@IP_DEL_VPS
git clone https://github.com/<tu-usuario>/<tu-repo>.git /opt/rastreo
cd /opt/rastreo/tracking-platform/infra
GPS_PORTS=5001:5100 bash scripts/setup-server.sh
```

El script actualiza el sistema, activa las actualizaciones de seguridad automáticas, instala Docker, configura el
firewall (UFW: SSH, 80, 443 y el rango de puertos GPS), fail2ban y swap.

Después **desactiva el acceso SSH con contraseña** (`PasswordAuthentication no` en `/etc/ssh/sshd_config`) y
entra solo con claves.

> Docker publica puertos por su cuenta, sin pasar por UFW. Por eso `docker-compose.yml` solo publica 80/443 y los
> puertos GPS: la base de datos (5432) y el puerto interno de Traccar (8082) nunca quedan expuestos.

## 4. Configurar y arrancar

```bash
cp .env.example .env
nano .env                      # DOMAIN, ACME_EMAIL, DB_PASSWORD (openssl rand -base64 32), GPS_PORTS
docker compose up -d --build   # la primera compilación tarda 5-10 minutos
docker compose logs -f traccar
```

Abre `https://tu-dominio`. **El primer usuario que se registra es el superadministrador.** Regístrate de inmediato
y después desactiva el registro público en *Configuración del servidor* (opción *Registro*).

## 5. Puertos de los equipos GPS

Cada protocolo usa un puerto (lista completa en https://www.traccar.org/devices/). Algunos habituales:

| Protocolo | Puerto | Equipos |
|---|---|---|
| gt06 | 5023 | Concox, JimiIoT, muchos genéricos |
| h02 | 5013 | Coban / Sinotrack |
| teltonika | 5027 | Teltonika FMB/FMC |
| osmand | 5055 | App móvil (Traccar Client / app propia) |
| gl200 | 5004 | Queclink GV |

Configura el equipo con `IP o dominio : puerto` y da de alta el IMEI como *Identificador* del dispositivo.
Si usas puertos fuera de `GPS_PORTS`, amplía el rango en `.env` y en el firewall (`ufw allow 5200:5300/tcp`).

## 6. Copias de seguridad

```bash
crontab -e
15 3 * * * cd /opt/rastreo/tracking-platform/infra && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Las copias se guardan en `infra/backups/` (14 días por defecto). Para sacarlas del servidor, configura `rclone`
(OVH Object Storage, Contabo Object Storage, Backblaze…) y define `RCLONE_REMOTE` en `.env`.
Para restaurar: `./scripts/restore.sh backups/traccar-AAAAMMDD-HHMMSS.dump`.

**Prueba una restauración al menos una vez** antes de tener clientes.

## 7. Mantenimiento

- Actualizar la plataforma: `git pull && docker compose up -d --build`.
- Limpieza de posiciones antiguas (ejemplo: más de 180 días):
  ```bash
  docker compose exec db psql -U traccar -d traccar -c \
    "DELETE FROM tc_positions WHERE fixtime < now() - interval '180 days' AND id NOT IN (SELECT positionid FROM tc_devices WHERE positionid IS NOT NULL);"
  ```
- Si importas usuarios o cambias la jerarquía directamente en la base de datos, reconstruye los permisos heredados:
  `POST /api/hierarchy/sync` (como administrador).
- Monitorización: `docker compose ps`, `docker stats`, y un servicio externo (UptimeRobot, BetterStack) contra
  `https://tu-dominio/`.

## 8. Marcas blancas con dominio propio

1. El revendedor apunta su dominio (p. ej. `gps.cliente.com`) a la IP del VPS.
2. Añade un bloque al `Caddyfile` con ese dominio y el mismo `reverse_proxy traccar:8082`, y luego `docker compose restart caddy`.
3. En *Administración > Apariencia > Dominios de marca blanca* añade `gps.cliente.com=ID_DEL_GERENTE`.

La pantalla de inicio de sesión de ese dominio mostrará el logo y los colores del gerente.
