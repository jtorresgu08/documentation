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
| huabao (JT808) | 5015 | Dashcams y MDVR JT/T 808 / 1078 (Jimi, Howen, Streamax en modo JT808, genéricos) |

Configura el equipo con `IP o dominio : puerto` y da de alta el IMEI como *Identificador* del dispositivo.
Si usas puertos fuera de `GPS_PORTS`, amplía el rango en `.env` y en el firewall (`ufw allow 5200:5300/tcp`).

## 6. Dashcams (JT/T 808 + 1078)

La plataforma recibe de las dashcams y MDVR que hablan JT/T 808 (el estándar de la mayoría de cámaras chinas):

- **Alarmas ADAS** (colisión frontal, salida de carril, distancia insegura, peatón, cambio de carril frecuente,
  señal de tránsito, obstáculo) y **DMS** (fatiga, celular, fumar, distracción, conductor ausente). Aparecen como
  alarmas normales: puedes crear notificaciones por correo, web o Telegram para cada una.
- **Fotos y videos de cada alarma.** El servidor los pide automáticamente y la cámara los sube al puerto **5261**.
  Se ven en el menú **Cámaras** agrupados por alarma.
- **Foto bajo demanda** (botón *Tomar foto* o el comando *Solicitar foto*).
- **Video en vivo por canal** (comandos *Video en vivo* / *Detener video en vivo*), con un servidor de video
  JT/T 1078 (más abajo).

Configuración de la cámara (por SMS, app o software del fabricante):

1. Servidor: IP pública del VPS (`PUBLIC_HOST` en `.env`), puerto **5015**, protocolo JT808 / TCP.
2. El "número de teléfono" o "ID de terminal" que configures (12 dígitos, p. ej. `013912345678`) es el
   **Identificador** del dispositivo en la plataforma.
3. Activa ADAS/DMS y la "subida de adjuntos de alarma" (en algunas marcas: *active safety*, *Su-standard*).

### Video en vivo

Las cámaras envían el video por el protocolo JT/T 1078 a un servidor de video, que lo publica como HTTP-FLV para el
navegador. Traccar no incluye ese servidor; opciones de código abierto:

- [JT1078Gateway](https://gitee.com/ldming/JT1078Gateway) (C#, MIT, FLV por HTTP y WebSocket)
- [jtt1078-video-server](https://gitee.com/hushup/jtt1078-video-server) (Java, Apache 2.0, FLV)
- [m7s + plugin jt1078](https://hub.docker.com/r/cdcddcdc/m7s-jt1078) (Go, imagen Docker)

Pasos:

1. Instala el servidor de video escuchando JT/T 1078 en `VIDEO_PORT` (7611 por defecto) y su HTTP-FLV en un
   puerto interno; abre `VIDEO_PORT` en el firewall.
2. Publica el HTTP-FLV bajo `https://tu-dominio/live/` (bloque comentado en el `Caddyfile`), para que el
   navegador lo cargue por HTTPS.
3. En *Configuración del servidor > Atributos* añade `dashcam.playUrl` con la dirección de reproducción. Admite
   `{uniqueId}`, `{channel}` y `{deviceId}`, por ejemplo `https://tu-dominio/live/{uniqueId}_{channel}.flv`
   (el formato exacto depende del servidor de video elegido).

Al pulsar *Iniciar* en un canal, la plataforma envía el comando 0x9101 a la cámara con la dirección de
`HUABAO_VIDEO_SERVER` y empieza a reproducir el FLV.

### Probar sin cámara

`server/tests/dashcam_simulator.py` simula una dashcam completa (alarmas, adjuntos, fotos y peticiones de video):

```bash
python3 server/tests/dashcam_simulator.py --host IP_DEL_VPS --port 5015 --phone 013912345678 \
    --image foto.jpg --video clip.mp4 --alarm adas:1 --alarm dms:2
```

Da de alta antes el dispositivo con identificador `013912345678`.

## 7. Copias de seguridad

```bash
crontab -e
15 3 * * * cd /opt/rastreo/tracking-platform/infra && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Las copias se guardan en `infra/backups/` (14 días por defecto). Para sacarlas del servidor, configura `rclone`
(OVH Object Storage, Contabo Object Storage, Backblaze…) y define `RCLONE_REMOTE` en `.env`.
Para restaurar: `./scripts/restore.sh backups/traccar-AAAAMMDD-HHMMSS.dump`.

**Prueba una restauración al menos una vez** antes de tener clientes.

## 8. Mantenimiento

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

## 9. Marcas blancas con dominio propio

1. El revendedor apunta su dominio (p. ej. `gps.cliente.com`) a la IP del VPS.
2. Añade un bloque al `Caddyfile` con ese dominio y el mismo `reverse_proxy traccar:8082`, y luego `docker compose restart caddy`.
3. En *Administración > Apariencia > Dominios de marca blanca* añade `gps.cliente.com=ID_DEL_GERENTE`.

La pantalla de inicio de sesión de ese dominio mostrará el logo y los colores del gerente.
