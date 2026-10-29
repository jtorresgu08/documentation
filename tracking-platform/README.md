# Plataforma de rastreo GPS (base Traccar)

Plataforma comercializable de rastreo GPS con jerarquía multinivel de gerentes y marca blanca, construida sobre
[Traccar](https://www.traccar.org) 6.9.1 (Apache 2.0). Incluye **todas las funciones de Traccar** (más de 200
protocolos GPS, mapa en vivo, historial, reportes, geocercas, alertas, comandos, mantenimiento, conductores…) más
lo que hace falta para venderla a revendedores y clientes finales.

```
tracking-platform/
├── server/            Parche del servidor Traccar + Dockerfile + configuración
│   ├── patches/       Parches sobre Traccar v6.9.1: jerarquía multinivel, dashcams JT808/JT1078 e
│   │                  inicio del periodo detenido / en movimiento
│   └── tests/         Pruebas de extremo a extremo (jerarquía: 28, dashcams JT808: 20, Jimi GT06: 16, estado: 11)
│                      y simuladores de dashcam
├── web/               Panel web (fork de traccar-web 6.9.1) con el nuevo diseño
└── infra/             docker-compose (PostgreSQL + Traccar + Caddy HTTPS), scripts y guía de despliegue
```

## Roles y visibilidad

| Rol | Ve | Puede |
|---|---|---|
| **Superadministrador** | Todo | Todo: servidor, límites, dominios de marca blanca, métricas, auditoría |
| **Gerente** (límite de usuarios ≠ 0) | Él mismo y **todo lo que está debajo** (usuarios, subgerentes, dispositivos, geocercas, alertas…) | Crear usuarios y subgerentes, dispositivos, personalizar la apariencia de su rama |
| **Subgerente** | Su propia rama | Lo mismo que un gerente, dentro de los límites que le dio su gerente |
| **Usuario** | Solo los dispositivos asignados | Mapa, historial, reportes, alertas… (según sus restricciones) |

Lo que el parche añade al servidor Traccar estándar (que solo tiene un nivel de gerentes):

- **Jerarquía multinivel.** Cada permiso que recibe un usuario se replica en todos sus gerentes superiores. Un
  gerente ve y administra toda su rama, y nunca a sus superiores ni a otras ramas. Como los permisos son filas
  reales, funcionan sin cambios las consultas, la caché, las posiciones en vivo y las notificaciones.
- **Subgerentes con límites.** Un gerente puede crear subgerentes, pero sin darles más usuarios ni más dispositivos
  de los que él tiene. El límite de dispositivos de un gerente cuenta toda su rama (por ejemplo, "490/1148").
- **Protección contra ciclos** en la jerarquía.
- **Marca blanca heredable.** Logo, nombre y colores por gerente: cada usuario ve la marca de su gerente más
  cercano. La pantalla de inicio de sesión toma la marca según el dominio (`brandDomains`, solo editable por el
  superadministrador).
- **Endpoints nuevos:** `GET /api/hierarchy/parents`, `GET /api/hierarchy/brand`, `POST /api/hierarchy/sync`.

## Dashcams y MDVR (JT/T 808 + 1078 y Jimi GT06)

Traccar solo guardaba el número de alarma ADAS/DMS de las cámaras JT808. El parche `0002` añade:

- Alarmas **ADAS** (colisión frontal, salida de carril, distancia insegura, peatón, cambio de carril frecuente,
  señal de tránsito, obstáculo) y **DMS** (fatiga, celular, fumar, distracción, conductor ausente) con nombre,
  listas para usarse en notificaciones.
- **Adjuntos de alarma**: el servidor pide las fotos y videos de cada alarma (0x9208) y los recibe en un servidor
  de adjuntos propio (puerto 5261, mensajes 0x1210/0x1211/0x1212 y flujo de datos). Cada archivo queda vinculado a
  su alarma.
- **Fotos** (0x0801 en varios paquetes) y comando **Tomar foto** (0x8801).
- **Video en vivo** por canal (0x9101 / 0x9102) hacia un servidor de video JT/T 1078, reproducido en el
  navegador con mpegts.js (HTTP-FLV).
- Corrección: los archivos recibidos en el mismo segundo ya no se sobrescriben.

Dashcams **Jimi con protocolo GT06** (JC400, JC261): el mismo parche añade un servidor HTTP (puerto 5262) que
recibe las fotos y videos de cada evento (`UPLOAD,http://servidor:5262/upload/IMEI`) y los vincula con la alarma
JC400 que los anunció. El video en vivo y las fotos se piden con comandos de texto configurables por dispositivo.

Los puertos van **por protocolo, no por marca**: 5023 para GT06 (incluidas las Jimi JC400/JC261), 5015 para
cualquier cámara o MDVR JT808 (Jimi JC450/JC181/JC371, Howen, genéricos), 5261 para los adjuntos JT808 y 5262
para las subidas Jimi. Cada dispositivo se configura como dashcam o MDVR con **1 a 12 canales**, protocolo y
nombres de canal.

En el panel, el menú **Cámaras** muestra los eventos agrupados por alarma (miniatura, tipo, foto y video) y una
cuadrícula de video en vivo de 4 canales. Ver la sección *Dashcams* de [infra/DEPLOY.md](infra/DEPLOY.md).

## Alta de unidades y estado del servidor

- **Agregar unidad** (botón ＋ de la lista): una sola ventana con pestañas *Principal / Usuarios / Icono / Cámara*.
  Se elige el **modelo del equipo** de un catálogo (Concox, Jimi, Teltonika, Coban, Sinotrack, Queclink, Suntech,
  Meitrack, Ruptela, MDVR JT808, app móvil…) y la plataforma muestra **servidor, puerto y SMS de configuración**
  listos para copiar. Permite **agregar varias unidades a la vez** (una por línea: `IMEI, nombre`) y asignarlas a
  usuarios en el mismo paso. El formulario completo de Traccar sigue disponible para la edición avanzada.
- **Estado del sistema** (solo superadministrador, parche `0004`): tiempo activo, memoria, CPU, disco, latencia de la
  base de datos, equipos conectados, mensajes por minuto y **monitoreo de los 295 puertos** (escuchando o con error,
  conexiones, equipos y mensajes por minuto/hora). Muestra los **equipos desconocidos** que intentan conectarse
  (IMEI no registrado, protocolo, puerto e IP) con un botón para darlos de alta con el IMEI y el modelo ya cargados.
  Se actualiza cada 10 segundos.
- El servidor que se muestra en las instrucciones es el atributo `deviceHost` de *Configuración del servidor*
  (por defecto, el dominio del panel).
- **Teltonika FMB y plataforma FT** (FTC920, FTC921, FTC961, FTC965, FTC968, FTM880…; parche `0006`): todos usan
  el protocolo `teltonika` en el **puerto 5027** (Codec 8 / 8 Extended). El catálogo guarda el código exacto del
  modelo (p. ej. `FTC920`), que es lo que activa en el servidor los parámetros por modelo: batería %, ICCID,
  entradas analógicas, OBD/CAN, temperaturas, etc. En los FT el **voltaje externo llega en el AVL 800** (mV, 4 bytes)
  en lugar del 66, y se muestra como *Alimentación*. En unidades ya creadas, basta con poner el código en *Modelo*.
- **SMS de Teltonika** (parche `0007`): los SMS llevan delante las credenciales SMS del equipo. En **FMB** son
  `login contraseña ` (**2 espacios** si están vacías) y en la **plataforma FT** solo `contraseña ` (**1 espacio**).
  Los comandos por GPRS no llevan prefijo. El alta muestra el SMS de configuración con el número correcto de
  espacios (␣), y al enviar un comando por SMS desde *Enviar comando* el servidor añade el prefijo según el modelo
  y los atributos `smsLogin` / `smsPassword` de la unidad. Si el texto empieza con un espacio, se envía tal cual.
  Requiere un gateway SMS configurado (`sms.http.url` en `traccar.xml`).
- El **superadministrador es la raíz de la jerarquía** (parche `0005`): los usuarios que crea quedan bajo él, así
  que ve todas las unidades en el mapa y en vivo, no solo en los listados de administración.

## Sensores, ficha de la unidad y combustible (parche `0008`)

- **Sensores estilo WOX** (Editar unidad → *Sensores*): combustible (tanque), temperatura, voltaje, digital
  (encendido, puerta… con textos propios) y numérico. Cada sensor lee un parámetro del equipo (`io201` de una sonda
  LLS, `adc1`, `fuel`, `temp1`…; el editor lista los que la unidad está enviando con su valor actual) y lo convierte
  con **multiplicador y suma** o con una **tabla de calibración** (valor del equipo → litros, con interpolación; se
  puede pegar desde Excel). El valor queda en cada posición (`sensor.<id>`) y se ve en la ventana del mapa; el primer
  sensor de combustible llena además el nivel estándar `fuel`.
- **Detección de llenado y descarga/robo** por sensor de combustible: **llenado mínimo**, **descarga mínima**,
  **tiempo de espera** (el cambio debe mantenerse ese tiempo), **filtro** (mediana de N lecturas contra el oleaje),
  velocidad de detenido y **solo con la unidad detenida** (activado por defecto: nunca se detecta en movimiento).
  Una carga gradual en la bomba se cuenta como una sola, y el consumo en ralentí no se toma como robo. Las alertas en
  vivo usan los eventos *Carga de combustible* y *Descarga / robo de combustible*, así que se pueden notificar desde
  *Alertas* (web, correo, Telegram…), con litros antes, después y cantidad.
- **Reportes de combustible** (menú lateral, Reportes y menú ⋮ de la unidad): periodo (hoy, ayer, 6/12/24 h, 7 días,
  mes o personalizado) y unidad en la cabecera; tarjetas de nivel inicial, final, cargado, descargado/robado y
  consumo total; gráfica del nivel filtrado con degradado, lectura cruda y velocidad de fondo, cargas y descargas
  marcadas con su cantidad y vista en **litros o porcentaje** (con la capacidad del tanque); **resumen del periodo**
  con distancia recorrida, consumo cada 100 km y **rendimiento estimado (km/L)**; tabla de eventos con búsqueda,
  filtro por tipo, dirección (geocodificación bajo demanda), paginación y **estado de revisión** (*Pendiente*,
  *Válido* o *Falsa alarma*, que se excluye de los totales; se guarda en la unidad); **mapa** con la ruta y los
  eventos; exportación a **Excel (CSV)** e impresión a **PDF**. Se recalcula desde los datos crudos
  (`GET /api/sensors/fuel`), así que un cambio de calibración o de umbrales también se aplica al historial.
- **Información de la unidad estilo Wialon** (Editar unidad → *Información de la unidad*): número de SIM, ICCID,
  operador, placa, número económico, VIN, marca, modelo, año, color, tipo, número de motor, combustible, capacidad
  del tanque, rendimiento, fecha de instalación, instalador, póliza y notas (atributos `info.*`). Se consulta en una
  **ventana flotante translúcida sobre el mapa** (menú ⋮ de la unidad → *Información de la unidad*, o el botón ⓘ de
  la ventana del mapa): velocidad, encendido, última posición y sensores en vivo arriba, y debajo equipo, SIM,
  vehículo e instalación en secciones plegables. Se puede arrastrar, minimizar, copiar y deja el mapa usable.

## Seguridad, WhatsApp y evidencia (parche `0009`)

- **Corte de motor seguro**: el servidor solo envía el corte si la unidad va a la velocidad permitida o menos (20 km/h
  por defecto, `engineStop.maxSpeed` por servidor o unidad). Si va más rápido lo rechaza, o lo deja **programado para
  cuando se detenga** (se puede cancelar; vence a las 12 h y se pierde si el servidor reinicia, que es lo seguro).
  Diálogo con la velocidad actual y confirmación explícita desde la tarjeta de la unidad o *Enviar comando*; queda
  registrado quién lo ordenó y el resultado llega como alerta.
- **Enlace de seguimiento para el cliente final**: en *Compartir ubicación* se puede indicar un destino (coordenadas y
  nombre); el enlace abre una página simple con la marca, la unidad en vivo, el destino, la distancia y la **hora
  estimada de llegada**, sin entrar a la plataforma.
- **WhatsApp**: canal de alertas **WhatsApp** (Cloud API de Meta, plantilla aprobada) y **bot de consultas**: "ABC-123",
  "dónde está la cisterna 7", "lista". Responde solo a números registrados y solo sobre sus unidades, con estado,
  velocidad, combustible, dirección y enlace al mapa. Configuración en [infra/DEPLOY.md](infra/DEPLOY.md), sección 10.
- **Evidencia de robo de combustible**: al confirmarse una descarga, la plataforma pide automáticamente una **foto por
  cámara** a la dashcam / MDVR de la unidad (JT808 o Jimi; `fuel.drainPhotos=false` lo desactiva). Desde *Reportes de
  combustible* → ⋯ → **Generar evidencia (PDF)** se obtiene un informe imprimible con datos de la unidad, litros, hora,
  lugar, gráfica antes/después, mapa, fotos de la cámara del intervalo y espacio para firmas.

## Grabaciones, puntaje de conducción y gastos (parche `0010`)

- **Reproducción de grabaciones de la MDVR a pedido (JT/T 1078)**: pestaña *Grabaciones* en la página de cámaras.
  Se elige el día y el canal, la plataforma consulta al equipo lo guardado en su tarjeta o disco (0x9205 → 0x1205) y
  muestra una **línea de tiempo de 24 h por canal** (los tramos con alarma, en rojo) y la lista con duración y tamaño.
  Un clic en la línea de tiempo reproduce desde ese minuto (0x9201) con **pausa, avance x2/x4/x8, salto a un minuto y
  detener** (0x9202). Requiere el equipo en línea y el servidor de video (el mismo del video en vivo); la dirección
  de reproducción sale de `dashcam.playbackUrl` (unidad o servidor) y, si no existe, de `dashcam.playUrl`.
- **Grabaciones de las Jimi JC400 / JC261** (parche `0011`): la misma pestaña lista los archivos de la tarjeta
  (`FILELIST`, subida HTTP), los reproduce por nombre (`REPLAYLIST`, 8 minutos por pedido, continuando solo) y permite
  **descargar un minuto** a la galería (`HVIDEO`). Configuración en [infra/DEPLOY.md](infra/DEPLOY.md).
- **Puntaje de conducción** (*Reportes → Puntaje de conducción*): 0–100 por unidad y por **conductor** (iButton /
  RFID), con frenadas, aceleraciones y curvas bruscas, excesos de velocidad sostenidos (20 s o más), alertas ADAS y de
  fatiga/distracción. Los eventos bruscos se toman de las alarmas del equipo o se calculan del GPS. Penalidad por cada
  100 km (mínimo 10 km), clasificación *Excelente / Bueno / Regular / Riesgoso*, ranking, y detalle con cada
  incidente, hora, velocidad y lugar. Límite: el de la unidad (`speedLimit`), si no `driving.speedLimit` del
  servidor (km/h), si no 90 km/h.
- **Gastos y mantenimiento** (*Reportes → Gastos y mantenimiento*): registro por unidad de combustible (con litros),
  peajes, mantenimiento, reparaciones, llantas, seguro/SOAT, multas, estacionamiento, lavado y otros, con proveedor,
  comprobante y odómetro. Indicadores de **gasto total, costo por km** (con el recorrido GPS del periodo), precio
  promedio por litro, taller y peajes; gráficas por mes y por tipo; costo por unidad; exportación CSV; y
  **próximos mantenimientos** (los de *Mantenimiento*, propios o heredados del grupo) con barra de avance y botón
  *Registrar servicio*. La moneda se toma del atributo de servidor `currencySymbol` (por defecto `S/`). Los usuarios
  de solo lectura pueden ver pero no registrar.

## Almacenamiento con historial de 1 año (parche `0012`)

Tarea nocturna que mantiene el disco acotado sin perder lo que se muestra: borra lo mayor a **365 días** (posiciones,
eventos, fotos y videos), **compacta** el recorrido de más de 30 días (−90 % o más, conservando curvas, paradas,
alarmas, eventos y distancias), **recomprime** fotos y videos de más de 7 días (JPEG / H.264 con ffmpeg) y, si se fija
un tope en GB, **sobrescribe lo más antiguo**. Resultado y botón *Ejecutar ahora* en *Estado del servidor*.
Configuración en [infra/DEPLOY.md](infra/DEPLOY.md), sección 12.

## Video flotante y estilo suave (parche `0013`)

- **Ventana de video flotante** sobre el mapa (desde la tarjeta de la unidad → *Video* o el menú de la lista):
  cuadrícula de 1, 4, 9 o 16 canales, cada panel con sus propios controles (reproducir/detener, foto, sonido,
  ver solo ese canal, pantalla completa), reproducir o detener todos, **SD/HD** (subflujo o flujo principal JT/T
  1078), encendido/corte de motor seguro, minimizar, maximizar, mover y cambiar el tamaño. Se pueden abrir hasta
  4 ventanas (una por unidad) y siguen abiertas al cambiar de página.
- **Estilo más suave** en toda la plataforma: esquinas más redondeadas, sombras ligeras, botones sin mayúsculas y
  textos un punto más pequeños.

## Panel web

Basado en tus capturas de referencia:

- Menú lateral contraíble (iconos ↔ iconos con texto), en móvil y en escritorio, con el logo de la marca.
- Menú de usuario: Dispositivos, Eventos, Historial, Alertas, Compartir ubicación, Enviar comando, Reportes,
  Geocercas, Mantenimiento, Conductores, Grupos y Configuración.
- Menú de **Administración** (gerentes y superadministrador): Descripción general con contadores, Usuarios (con
  contador y columna *Gerente*), Dispositivos (en línea/total), Métricas, Configuración del servidor, Apariencia,
  Anuncios, Calendarios, Atributos calculados, Comandos guardados, Registros y Auditoría.
- **Mapa en vivo** (diseño actualizado): lista en un panel flotante translúcido con esquinas redondeadas y filas tipo tarjeta; filtros rápidos con contador sobre la lista (*Todos*, *En movimiento*,
  *Detenidos*, *Sin conexión*), que filtran también el mapa; resumen flotante "N vehículos · N en movimiento"; filas
  compactas con el icono del vehículo en el color de su estado (verde en movimiento, ámbar detenido, rojo sin
  conexión), estado con duración, encendido y velocidad; **marcadores rellenos con el mismo color** y la velocidad
  en la etiqueta cuando se mueve; tarjeta de la unidad seleccionada con estado, velocidad, "hace X", dirección,
  mosaicos de sensores (o encendido, combustible, voltaje y distancia), *Ver historial*, *Reportes*, *Centrar*,
  *Seguir*, *Editar* y el menú ⋯ (ficha, comando, geocerca, mapas externos, compartir, eliminar).
- Lista de dispositivos al estilo de tus capturas: agrupada por grupo con contador, casillas para mostrar u ocultar
  en el mapa (por vehículo o por grupo), hora del último reporte, "Detenido 5h 20min" / "En movimiento" /
  "Desconectado" / "Vencido", velocidad con punto de color y menú por vehículo (mapa, historial, cámaras, comando,
  compartir, editar).
- Barra de herramientas azul en el mapa: ver todos, geocercas, nombres, agrupar, seguir vehículo, medir distancia
  y pantalla completa.
- Español por defecto, con los 61 idiomas de Traccar disponibles.

## Correspondencia con las capturas

| Función de la captura | Estado |
|---|---|
| Mapa con agrupación, geocercas y capas (Google, OSM, Carto, Yandex…) | ✅ Traccar |
| Dispositivos, Eventos, Historial (reproducción), Reportes, Geocercas | ✅ Traccar |
| Alertas (notificaciones web, correo, SMS, Telegram, push) | ✅ Traccar |
| Compartir ubicación (enlace temporal), Enviar comando | ✅ Traccar |
| Mantenimiento (Herramientas / Servicios), Conductores, Grupos | ✅ Traccar |
| Usuarios con gerente, límite de dispositivos, fecha de vencimiento | ✅ Traccar + jerarquía |
| Dispositivo: IMEI, tipo/icono, vencimiento, usuarios, avanzado, exactitud | ✅ Traccar |
| Administración: contadores, métricas, configuración del servidor, registros | ✅ |
| Apariencia / marca blanca por gerente | ✅ Nuevo |
| Lista agrupada con casillas, "Detenido 55h 42min", menú por vehículo | ✅ Nuevo |
| Barra de herramientas del mapa (medir, seguir, geocercas, nombres…) | ✅ Nuevo |
| Dashcams: alarmas ADAS/DMS, fotos y videos de eventos, foto bajo demanda | ✅ Nuevo (JT/T 808) |
| Dashcams Jimi GT06 (JC400 / JC261): alarmas con sus fotos y videos | ✅ Nuevo |
| Dashcam / MDVR de 1 a 12 canales por dispositivo | ✅ Nuevo |
| Dashcams: video en vivo | ✅ Comandos y reproductor; requiere un servidor de video JT/T 1078 |
| Copias de seguridad / limpieza de datos | ✅ Scripts (`infra/`); 🔜 pantalla en el panel |
| Ecodrive (puntuación de conducción) | 🔜 Fase 2, a partir de los eventos de frenado y aceleración |
| Puntos de interés con icono, Rutas planificadas | 🔜 Fase 2 (hoy: geocercas de círculo o línea) |
| Gastos (combustible, peajes…) | 🔜 Fase 2 (módulo propio) |
| Chat | 🔜 Fase 3 |
| Estado del sistema, cola de comandos | 🔜 Fase 2 |
| App móvil Android/iOS (Expo + EAS Build) | 🔜 Fase 2 |

## Desarrollo local

```bash
# Servidor parcheado
git clone --depth 1 --branch v6.9.1 https://github.com/traccar/traccar.git && cd traccar
git apply ../server/patches/*.patch && ./gradlew assemble -x test
java -jar target/tracker-server.jar debug.xml          # API en http://localhost:8082

# Panel web (proxy a localhost:8082)
cd web && npm ci && npm start                          # http://localhost:3000

# Pruebas (con una base de datos vacía y huabao.attachmentServer / huabao.videoServer configurados)
python3 server/tests/test_hierarchy.py
python3 server/tests/test_dashcam.py foto.jpg clip.mp4 cabina.jpg
python3 server/tests/test_jimi.py clip.mp4 cabina.jpg
python3 server/tests/test_status.py
SMS_CAPTURE_PORT=7620 python3 server/tests/test_teltonika_ft.py   # con sms.http.url=http://127.0.0.1:7620/sms
python3 server/tests/test_fuel.py
python3 server/tests/test_safety.py   # con la configuración de WhatsApp de prueba indicada en el archivo
python3 server/tests/test_video_driving_expenses.py
python3 server/tests/test_jimi_playback.py clip.mp4
python3 server/tests/test_retention.py foto.jpg   # con la configuración retention.* indicada en el archivo
```

## Producción

Ver [infra/DEPLOY.md](infra/DEPLOY.md): Contabo/OVH, HTTPS automático, firewall, copias de seguridad y dominios
de marca blanca.

## Licencias

Traccar y traccar-web se distribuyen bajo la licencia Apache 2.0 (ver `web/LICENSE.txt`). Los cambios de este
repositorio se publican bajo la misma licencia. Para uso comercial puedes cambiar la marca libremente, siempre que
conserves los avisos de licencia.
