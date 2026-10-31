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
| huabao (JT808) | 5015 | Dashcams y MDVR JT/T 808 / 1078 (Jimi JC450/JC181/JC371, Howen, Streamax en modo JT808, genéricos) |
| jt808attach | 5261 | Fotos y videos de alarmas ADAS/DMS de las cámaras JT808 (los pide el servidor) |
| jimiupload | 5262 | Fotos y videos de eventos de las dashcams Jimi GT06 (JC400 / JC261), por HTTP |

**Los puertos van por protocolo, no por marca.** Todos los equipos que hablan el mismo protocolo comparten
puerto: un rastreador Concox GT06 y una dashcam Jimi JC400 usan ambos el 5023, y una JC450 de Jimi, una Howen o
un MDVR genérico JT808 usan todos el 5015. La marca y el modelo solo cambian qué funciones tiene cada equipo, y
eso se configura por dispositivo (sección *Cámara / MDVR*).

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

### Cámaras y canales por dispositivo

En *Dispositivos > editar > Cámara / MDVR* se indica para cada equipo:

- **Tipo**: dashcam o MDVR (solo estos equipos aparecen en el menú *Cámaras*).
- **Cantidad de canales**: de 1 a 12. La pantalla de video en vivo muestra un recuadro por canal.
- **Protocolo**: automático (según el puerto por el que se conecta), JT/T 808 / 1078 o Jimi GT06.
- **Nombres de los canales** (opcional), p. ej. `Frontal, Cabina, Trasera, Puerta`.
- **Dirección del video en vivo** (opcional) si ese equipo usa un servidor de video distinto.

### Dashcams Jimi con protocolo GT06 (JC400, JC261)

Estas cámaras envían el GPS y las alarmas por TCP con el protocolo GT06 y suben las fotos y videos de cada evento
por HTTP. Configuración por SMS (o con la herramienta de Jimi), con la IP pública del VPS:

```
SERVER,1,IP_DEL_VPS,5023,0#
UPLOAD,http://IP_DEL_VPS:5262/upload/IMEI_DEL_EQUIPO
UPLOADSW,SOS,ON          (activa la subida de video por tipo de evento: SOS, choque, frenado…)
RSERVICE,rtmp://IP_DEL_VPS:1935/live     (servidor de video en vivo, ver abajo)
```

La plataforma vincula cada archivo con su alarma: la alarma JC400 trae la lista de archivos del evento
(`EVENT_<IMEI>_..._F_1.mp4` frontal, `..._I_2.mp4` cabina) y el servidor los asocia al recibirlos.

El video en vivo y la foto bajo demanda se envían como comandos de texto. Por defecto la plataforma usa
`RTMP,ON,OUT` / `RTMP,ON,IN` (canal 1 frontal, canal 2 cabina), `RTMP,OFF,...` y `PICTURE,...`. **Verifica estos
textos con la lista de comandos de tu firmware**: se pueden cambiar por dispositivo en *Cámara / MDVR*. Las Jimi
transmiten por RTMP, así que necesitan un servidor que lo convierta a HTTP-FLV, por ejemplo
[SRS](https://github.com/ossrs/srs) (código abierto, imagen Docker `ossrs/srs`). En *Configuración del servidor >
Atributos*, `dashcam.playUrlJimi` define la dirección de reproducción, p. ej.
`https://tu-dominio/live/{channel}/{uniqueId}.flv`.

**Grabaciones de la tarjeta (JC400, JC261)**: la pestaña *Grabaciones* también funciona con estas cámaras. La
plataforma envía `FILELIST,http://IP_DEL_VPS:5262/filelist/IMEI` y luego `FILELIST`; la cámara sube por HTTP la lista
de sus archivos de 1 minuto (`2026_10_27_14_05_00_01.mp4`, 01 frontal / 02 cabina) y la plataforma los muestra en la
línea de tiempo. Al reproducir se envía `REPLAYLIST` con hasta 8 minutos y se continúa sola cada 8 minutos; la
cámara los transmite por RTMP al mismo servidor del video en vivo. Define la dirección de reproducción en
*Configuración del servidor > Atributos* con `dashcam.playbackUrlJimi`, p. ej.
`https://tu-dominio/live/replay/{uniqueId}.flv` (si no existe se usa `dashcam.playUrlJimi`). El botón de descarga
envía `HVIDEO` y el minuto llega a *Eventos de cámara* por la subida HTTP (no necesita servidor de video).

- La dirección de la lista sale de `JIMI_FILE_LIST_URL` (en `docker-compose.yml`, con `PUBLIC_HOST`); el puerto 5262
  ya está abierto para las subidas.
- Los nombres de archivo están en la hora local de la cámara: pon en la unidad el atributo `decoder.timezone`
  (p. ej. `America/Lima`) para que la línea de tiempo coincida; sin él se asume UTC.
- Jimi no permite pausar ni cambiar la velocidad en el equipo: la pausa es local y para saltar se pide la
  reproducción desde ese minuto.

Las Jimi JC450, JC181, JC371, JC182 y JC451 usan JT/T 808 / 1078: van al puerto 5015 como el resto de cámaras
JT808.

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

**Grabaciones (reproducción remota)**: la pestaña *Grabaciones* usa el mismo servidor de video. Si tu servidor publica
la reproducción con otra dirección que el vivo, añade `dashcam.playbackUrl` (mismos marcadores) en el servidor o en
la unidad. La hora de las grabaciones se convierte con la zona del equipo (`decoder.timezone`, por defecto GMT+8 en
JT808; ajústala por unidad si tus MDVR están en hora de Perú).

### Probar sin cámara

`server/tests/dashcam_simulator.py` simula una dashcam completa (alarmas, adjuntos, fotos y peticiones de video):

```bash
python3 server/tests/dashcam_simulator.py --host IP_DEL_VPS --port 5015 --phone 013912345678 \
    --image foto.jpg --video clip.mp4 --alarm adas:1 --alarm dms:2
```

Da de alta antes el dispositivo con identificador `013912345678`. Para las Jimi GT06 está
`server/tests/jimi_simulator.py` (`--imei 862798052429087 --front clip.mp4 --cabin cabina.jpg`).

### Alta de unidades y monitoreo

- En *Configuración del servidor > Atributos* añade `deviceHost` con la IP pública o el dominio que deben usar los
  equipos (aparece en las instrucciones de la ventana *Agregar unidad*).
- *Administración > Estado del sistema* muestra si cada puerto está escuchando, cuántos equipos y mensajes recibe, y
  los IMEI desconocidos que intentan conectarse. Si un equipo "no aparece", revisa primero esa lista: si su IMEI
  está ahí, el equipo llega bien al servidor y solo falta darlo de alta (o el IMEI cargado está mal escrito).

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
- Limpieza de posiciones antiguas: automática, ver la sección 12.
- Si importas usuarios o cambias la jerarquía directamente en la base de datos, reconstruye los permisos heredados:
  `POST /api/hierarchy/sync` (como administrador).
- Monitorización: `docker compose ps`, `docker stats`, y un servicio externo (UptimeRobot, BetterStack) contra
  `https://tu-dominio/`.

## 9. Marcas blancas con dominio propio

1. El revendedor apunta su dominio (p. ej. `gps.cliente.com`) a la IP del VPS.
2. Añade un bloque al `Caddyfile` con ese dominio y el mismo `reverse_proxy traccar:8082`, y luego `docker compose restart caddy`.
3. En *Administración > Apariencia > Dominios de marca blanca* añade `gps.cliente.com=ID_DEL_GERENTE`.

La pantalla de inicio de sesión de ese dominio mostrará el logo y los colores del gerente.

## 10. WhatsApp: alertas y consultas

La plataforma usa la **WhatsApp Cloud API de Meta**. Meta cobra por conversación; revisa su tarifa para Perú.

1. En [developers.facebook.com](https://developers.facebook.com) crea una app de tipo *Business*, agrega el producto
   **WhatsApp** y registra tu número. Copia el **Phone number ID**, genera un **token permanente** (usuario del
   sistema con permiso `whatsapp_business_messaging`) y copia el **App secret** (Configuración → Básica).
2. Crea y aprueba una **plantilla** de categoría *Utilidad* con un solo parámetro en el cuerpo, por ejemplo
   `alerta_gps`: «Alerta de tu flota: {{1}}». Sin plantilla, las alertas solo llegan a quien escribió al número en las
   últimas 24 horas.
3. En `infra/.env` completa `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`, un
   `WHATSAPP_VERIFY_TOKEN` inventado por ti y `WHATSAPP_APP_SECRET`, y agrega `whatsapp` a `NOTIFICATOR_TYPES`.
   Reinicia: `docker compose up -d`.
4. En Meta → WhatsApp → Configuración, registra el webhook `https://TU_DOMINIO/api/whatsapp/webhook` con el mismo
   token de verificación y suscríbete al campo **messages**.
5. A cada usuario que quiera alertas o consultas, ponle su número en *Cuenta → Atributos → WhatsApp* (con código de
   país, p. ej. +51 987 654 321) y crea la alerta en *Alertas* con el canal **WhatsApp**.

Consultas: el usuario escribe la placa o el nombre ("ABC-123", "dónde está la cisterna 7"), `lista` o `ayuda`, y
recibe estado, velocidad, combustible, dirección y enlace al mapa **solo de sus propias unidades**. Los números que no
están registrados no reciben datos, y los mensajes sin la firma de Meta se rechazan.

**Corte de motor seguro**: por defecto el corte solo se envía a 20 km/h o menos. Cámbialo en *Configuración del
servidor → Atributos* (o por unidad) con `engineStop.maxSpeed` (km/h; 0 = sin límite).

## 11. Puntaje de conducción y gastos

- **Puntaje**: el límite de velocidad para los excesos es el de la unidad (*Velocidad límite*), si no el atributo de
  servidor `driving.speedLimit` (km/h), si no 90 km/h. Para calcular frenadas y curvas del GPS conviene que el equipo
  reporte cada 1–2 s en movimiento; si el equipo envía sus propias alarmas de conducción brusca, se usan esas.
- **Gastos**: la moneda se muestra con el atributo de servidor `currencySymbol` (por defecto `S/`). Los gastos se
  guardan en la tabla `tc_expenses`, creada automáticamente al actualizar y respaldada junto con la base de datos.

## 12. Almacenamiento: historial de 1 año que se sobrescribe

Cada noche (`RETENTION_HOUR`, por defecto 8 = 08:00 UTC = 03:00 en Perú, porque el contenedor usa UTC) la plataforma mantiene el espacio acotado. Los
valores se definen en `infra/.env`:

| Variable | Por defecto | Qué hace |
|---|---|---|
| `RETENTION_DAYS` | 365 | Borra posiciones, eventos, fotos y videos más antiguos; lo nuevo va ocupando ese espacio. |
| `RETENTION_COMPACT_DAYS` | 30 | Compacta el recorrido de más de 30 días: quita puntos redundantes y conserva inicio y fin, curvas, paradas, cambios de encendido, alarmas, eventos, fotos y la posición actual. Un día típico baja más del 90 %. |
| `RETENTION_COMPACT_INTERVAL` | 30 | En el historial compactado queda un punto cada 30 s en movimiento (y uno cada 30 min detenido). |
| `RETENTION_MEDIA_COMPRESS_DAYS` | 7 | Recomprime fotos (JPEG calidad 70, máx. 1280 px) y videos (H.264, máx. 720p/1280 px) con más de 7 días; mantiene el nombre y la fecha, así siguen apareciendo en los eventos. |
| `MEDIA_MAX_GB` | 0 | Tope de la carpeta de fotos y videos. Al superarlo borra lo más antiguo hasta quedar en el 90 %. |

Así el historial, los reportes, las rutas y los eventos se pueden consultar durante todo el año; las distancias de
los reportes no cambian porque se conservan los odómetros. El puntaje de conducción calculado por GPS necesita los
puntos de cada segundo, así que para periodos ya compactados solo cuenta las alarmas del equipo y los excesos;
sube `RETENTION_COMPACT_DAYS` (p. ej. 90) si quieres más margen.

En *Administración → Estado del servidor* se ven la política, el resultado de la última ejecución (posiciones
compactadas y vencidas, archivos comprimidos, espacio ahorrado, archivos sobrescritos) y el botón *Ejecutar ahora*.
La primera ejecución sobre una base grande avanza hasta 62 días de historial por noche.

PostgreSQL reutiliza el espacio de lo borrado (autovacuum), así que la base deja de crecer; para devolver espacio
al disco de una sola vez después de la primera limpieza: `docker compose exec db vacuumdb -U traccar -d traccar --full`
(bloquea las tablas unos minutos; hazlo de madrugada).

## 13. Operación inteligente: prioridades y recordatorios

- **Prioridad de alertas**: cada tipo trae una prioridad por defecto (SOS, corte de energía, manipulación,
  fatiga = crítica; exceso de velocidad, frenadas, geocerca prohibida = alta; …). Para cambiarla, en
  *Configuración → Servidor → Atributos* agregue `alerts.severity` con pares `tipo=prioridad` separados por coma:

  ```
  alerts.severity = alarm:overspeed=critical, deviceOffline=high, alarm:door=low
  ```

  Las claves son el tipo de evento (`deviceOffline`, `geofenceEnter`, `maintenance`…) o `alarm:<alarma>`; las
  prioridades válidas son `critical`, `high`, `medium` y `low`.
- **Aviso previo de mantenimiento**: cada plan de mantenimiento acepta el atributo `notice`, que indica cuándo pasa a
  *Próximo*: una fracción del periodo (`0.1` = 10 %, valor por defecto) o un valor absoluto en la unidad del plan
  (metros, ms de horas de motor o ms para planes por fecha).
- **Recordatorios**: una tarea revisa cada hora todos los planes y genera un evento `maintenance` (estado *próximo*
  o *vencido*) una sola vez por ciclo. Para recibirlo, cree una notificación del tipo *Se requiere mantenimiento*
  con el canal deseado. Los administradores pueden forzar la revisión con `POST /api/maintenance-plans/check`.
- **Calidad de conexión**: hueco = silencio mayor a 10 min (o 5× el intervalo habitual) con la unidad en marcha, o
  mayor a 6 h en cualquier caso; un equipo con menos de 10 reportes por día queda como máximo en *Regular*.
- **Servicios (*Añadir servicio*)**: se guardan como planes de mantenimiento con los atributos `renew` (renovar al
  expirar), `notice` (aviso previo, en metros, ms de horas de motor o ms), `description` y `emails`. Los correos
  adicionales usan el SMTP del servidor (`mail.smtp.*` en `traccar.xml`); sin SMTP solo se envían las alertas por
  los demás canales. Los planes con `renew` los avisa únicamente la tarea horaria (no el aviso nativo de Traccar al
  cruzar cada periodo), para no duplicar eventos.

## 14. Chat con conductores por WhatsApp

- Usa la misma cuenta de WhatsApp Cloud API de la sección 10 (`notificator.whatsapp.*`) y el mismo webhook
  (`/api/whatsapp/webhook` con `whatsapp.appSecret`).
- El número del conductor se toma del atributo `phone` (o `whatsapp`) del **conductor** asignado a la unidad (el de la
  última posición por iButton/RFID o el vinculado a la unidad); si no hay, del atributo `driverPhone` de la unidad.
- Los mensajes de un número de conductor se guardan en el chat de la unidad (no los responde el bot); los de usuarios
  registrados siguen yendo al bot de consultas.
- WhatsApp solo entrega texto libre a quien escribió en las últimas 24 h: para iniciar conversaciones use la plantilla
  aprobada o pida al conductor que escriba primero.

