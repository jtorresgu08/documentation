# SAFE CONNECTION · Plataforma de rastreo GPS (base Traccar)

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
  muestra **todos los canales asignados a la unidad** (hasta 16; p. ej. 8 en 4×2) o de a 1, 4, 6, 8, 9 o 12, cada panel con sus propios controles (reproducir/detener, foto, sonido,
  ver solo ese canal, pantalla completa), reproducir o detener todos, **SD/HD** (subflujo o flujo principal JT/T
  1078), encendido/corte de motor seguro, minimizar, maximizar, mover y cambiar el tamaño. Se pueden abrir hasta
  4 ventanas (una por unidad) y siguen abiertas al cambiar de página.
  La misma ventana tiene pestañas para las **grabaciones del equipo** (memoria/disco de la MDVR JT/T 1078 o de la
  Jimi: línea de tiempo por canal y reproducción) y los **eventos guardados** en la plataforma (fotos, videos y
  alarmas ADAS/DMS con su visor y descarga).
- **Estilo más suave** en toda la plataforma: esquinas más redondeadas, sombras ligeras, botones sin mayúsculas y
  textos un punto más pequeños.

## Operación inteligente (parche `0014`)

- **Centro de alertas** (*Centro de alertas* en el menú): todo lo que requiere atención con **prioridad**
  (crítica, alta, media, baja), estado (**nueva → en atención → resuelta / falsa alarma**), responsable, notas e
  historial de cada alerta, acciones en lote, KPIs (abiertas, críticas, **tiempo medio de respuesta**, % atendido),
  alertas por hora, tipos y unidades más frecuentes, sonido para nuevas críticas y accesos directos a mapa,
  historial y video. Los eventos rutinarios (encendido, entradas a geocercas…) se ocultan salvo que se pidan.
- **Calidad de conexión** (*Reportes → Calidad de conexión*): puntaje 0–100 por equipo con cobertura, huecos sin
  reportar, GPS válido, satélites, señal GSM, alimentación, reconexiones y reloj desfasado; filtros por problema,
  detalle con reportes por hora, lista de huecos y **qué revisar** en el equipo; exportación CSV.
- **Historial mejorado**: resumen (distancia, en marcha, detenido, velocidad máx.), viajes, paradas y eventos con
  salto directo al momento, marcadores en el mapa, reproducción 1–32×, gráfico de velocidad con clic para ubicarse
  y exportación KML, GPX y CSV. Si el odómetro del equipo retrocede, la distancia se calcula con el recorrido GPS.
- **Mantenimiento de flota** (*Gastos y mantenimiento → Mantenimiento*): estado de cada plan por unidad (al día,
  próximo, vencido) por km, horas de motor o días, avance, fecha estimada según el uso diario, calendario de los
  próximos 90 días, **registro de servicios** (taller, costo, notas) que reinicia el ciclo y puede crear el gasto, y
  **recordatorios automáticos** como evento *Se requiere mantenimiento* (notificable por correo, push o WhatsApp).
- **Reportes configurables** (*Reportes configurables*): elige fuente (resumen, viajes, paradas, eventos,
  conducción, gastos, calidad, mantenimiento), columnas y su orden, filtros, agrupación y totales; guarda
  **plantillas** por usuario, exporta CSV o imprime/PDF.

## Servicios por unidad: aceite, maquinaria y vencimientos (parche `0015`)

*Añadir servicio* (en *Mantenimiento* o en el menú de cada unidad) configura en un solo paso un servicio que
**expira por odómetro (km), horómetro (horas de motor) o fecha (días)**:

- **Plantillas rápidas**: cambio de aceite, llantas, filtro de aire y frenos (vehículos); aceite de motor, engrase,
  filtros hidráulicos y mantenimiento mayor (maquinaria amarilla); SOAT, revisión técnica, póliza y extintor
  (documentos).
- Intervalo, último servicio (o la fecha de vencimiento directamente para SOAT y documentos), **avisar cuando
  falten** X km / horas / días, odómetro y horas actuales de la unidad y vista previa del próximo servicio.
- **Renovar servicio al expirar**: si está activo, al vencer se avisa y el ciclo vuelve a empezar solo; si no, queda
  *vencido* hasta registrar el servicio realizado o la renovación.
- **Alerta configurada automáticamente**: crea (o completa) la notificación *Se requiere mantenimiento* con los
  canales elegidos (web, correo, push, WhatsApp…). Además se pueden indicar **correos adicionales** que reciben el
  aviso aunque no sean usuarios.
- Se puede aplicar a varias unidades a la vez (un servicio por unidad, con la lectura actual de cada una), editar,
  eliminar y ver con el ícono de renovación en la tabla de estado. Los vencimientos por fecha avanzan aunque la
  unidad no reporte.

## Paneles flotantes en el mapa (parche `0016`)

Botón **Paneles** sobre el mapa: abre ventanas flotantes que se mueven, cambian de tamaño, se minimizan, maximizan y
siguen abiertas al cambiar de página (la ventana de video es un panel más). Se pueden abrir varias a la vez.

| Grupo | Panel | Qué hace |
|---|---|---|
| Operación | **Alertas en vivo** | Críticas y altas abiertas de las últimas 24 h, sonido para nuevas críticas, tomar / resolver / falsa alarma, ubicar y video |
| | **Seguimiento de unidad** | Ficha que acompaña a una unidad: estado, velocidad, encendido, conductor, combustible, energía, odómetro, velocidad de la última hora, últimos eventos y accesos (video, historial, combustible, chat, corte seguro, compartir). Se pueden abrir varias para comparar |
| | **Historial rápido** | Unidad y periodo (última hora, 6 h, hoy, ayer), recorrido por velocidad sobre el mapa principal, reproducción 1–32×, gráfico de velocidad con clic para ubicarse |
| | **Combustible en vivo** | Nivel actual y % del tanque, gráfico de 12 h, cargas y descargas detectadas y acceso a la evidencia de una descarga |
| Flota | **Resumen de flota** | En movimiento, detenidas, sin conexión y con alertas (cada una filtra el mapa y la lista), unidades sin reportar +24 h y ranking de excesos de hoy |
| | **Calidad de conexión** | Unidades con problemas, filtro por tipo y "ver en el mapa" |
| | **Mantenimiento y vencimientos** | Vencidos y próximos (aceite, SOAT, revisión técnica), registrar servicio y añadir servicio |
| | **Geocercas en vivo** | Unidades dentro de cada geocerca y desde cuándo, entradas y salidas de hoy |
| Herramientas | **Unidad más cercana** | Clic en el mapa → unidades disponibles más cercanas con distancia estimada por vía y tiempo de llegada, enviar comando o mensaje |
| | **Medición y ruta** | Distancia, área (perímetro y hectáreas) y ruta planificada comparada con el recorrido real (% en el corredor, desvío máximo) |
| | **Comandos rápidos** | Comando a una o varias unidades con confirmación y resultado por unidad; el corte de motor siempre pasa por el corte seguro |
| | **Chat con conductor** | WhatsApp con el conductor de la unidad: conversación, frases rápidas, estado de entrega; las respuestas llegan por el webhook y el botón muestra los mensajes nuevos |
| Monitoreo | **Mosaico de cámaras** | Un canal de varias unidades a la vez (4, 6 o 9), rotando páginas cada 15–60 s; solo transmiten las visibles |

**Espacios de trabajo**: se guardan los paneles abiertos con su posición y tamaño ("Turno noche", "Despacho"…), en el
usuario (lo siguen a cualquier computadora); uno puede abrirse automáticamente al iniciar sesión. En el menú de cada
unidad está *Panel de seguimiento*.

## Sensores y alertas personalizadas tipo Wialon (parche `0017`)

**Sensores** (Editar unidad → Sensores), calculados por el servidor en cada mensaje (`sensor.<id>`):

| Grupo | Tipos |
|---|---|
| Kilometraje | Odómetro, kilometraje relativo |
| Digitales | Ignición, digital personalizado, botón de pánico, puerta, cinturón, toma de fuerza (PTO), modo privado, sensor de movimiento |
| Motor | Horas de motor absolutas y relativas, RPM, eficiencia del motor (umbral de RPM o voltaje) |
| Combustible | Nivel con tabla de calibración, consumo por impulsos, absoluto (CAN), instantáneo y calculado por tasa (L/100 km + L/h en ralentí) |
| Medidores | Temperatura, voltaje, peso/carga, acelerómetro, presión de llantas, humedad, contador, personalizado |
| Asignación | Conductor, remolque, contador de pasajeros |

- **Fórmulas**: parámetros (`io201 * 0.4`), otros sensores (`#tank1 + #tank2`), bits (`in1:3`, `bit(x, n)`),
  `+ − * / % ^`, comparaciones, `&& || !`, `abs round min max if`; errores marcados al escribir.
- Tabla de calibración o multiplicador y suma, **límites** inferior/superior, **validación por otro sensor** (no cero,
  Y/O, sumar, restar, multiplicar, dividir, reemplazar), **acumulación** (sumar cada mensaje, diferencia de un contador,
  tiempo activo), **suavizado** de N lecturas.
- Visualización: textos y colores para encendido/apagado, **rangos de color** (p. ej. azul < 2 °C, verde 2–8, rojo
  > 8), ocultar de la ficha; orden (las fórmulas usan los de arriba), duplicar y **plantillas por modelo** (Teltonika,
  Concox/Jimi, Queclink, CAN/FMS, cadena de frío, consumo calculado).
- **Vista previa en vivo** calculada por el servidor con los últimos mensajes (valor y gráfico).
- Un sensor de ignición, horas de motor o conductor también completa esos datos estándar si el equipo no los envía.

**Alertas personalizadas** (menú *Alertas personalizadas*): asistente en 6 pasos.

| Tipo | Condición |
|---|---|
| Exceso de velocidad | Límite fijo, de la geocerca donde esté o de la unidad |
| Valor de sensor / parámetro | Mayor, menor, igual, distinto, dentro o fuera de rango, cambio brusco; sensor por nombre o cualquiera de un tipo |
| Entrada digital | Se activa o se desactiva (solo al cambiar) |
| Geocerca | Entra, sale, dentro o fuera por X min |
| Ralentí / parada prolongada | Más de X min (parada dentro o fuera de geocercas) |
| Pérdida de conexión / sin GPS | Sin datos o sin posición válida por X min |
| Nivel de combustible | Por debajo de un nivel |
| Evento del equipo | SOS, accidente, corte de energía, manipulación, robo/carga de combustible, cambio de conductor, encendido… |
| Conductor no identificado | Encendida sin iButton/RFID |
| Proximidad | Cerca de otras unidades o de un punto |

- **Condiciones adicionales** (Y además…): velocidad, ignición, movimiento, sensor, parámetro, geocerca.
- Unidades: todas, grupos (con subgrupos) o unidades. **Horario** por días y horas (incluso nocturno) o solo fuera de
  él; **duración mínima**, **pausa entre alertas** y **máximo por día**.
- Acciones: **prioridad** (va al centro de alertas), canales (web, correo, push, WhatsApp…), correos y números de
  WhatsApp adicionales, **comando** (el corte de motor pasa siempre por el corte seguro) y **mensaje** con variables
  `{unit} {rule} {detail} {value} {speed} {address} {time} {driver} {geofence} {lat} {lon}` y vista previa.
- **Probar ahora** con los últimos datos de las unidades, 12 **plantillas** (cadena de frío, puerta abierta en
  movimiento, encendido fuera de horario, robo de combustible, SOS…), historial de 7 días y conteo por alerta.
- Se revisan con cada mensaje y cada minuto (silencios, duraciones y horarios cuentan aunque la unidad no reporte).
- Los sensores y su color se ven también en la ficha de la unidad y en el panel flotante de seguimiento.

## Reportes de sensores y de alertas personalizadas (parche `0018`)

- **Reporte de sensores** (*Reportes → Reporte de sensores*): por unidad y periodo (hoy, ayer, 7 días, mes o
  personalizado, hasta 31 días) y sensores elegidos. Para cada sensor: mínimo, **promedio ponderado por tiempo**,
  máximo y último valor; **total del periodo** en kilometraje, horas de motor, consumo y contadores; **tiempo activo,
  % del tiempo y activaciones** en los digitales; **tiempo en cada rango de color** (p. ej. % del tiempo fuera de
  2–8 °C); gráfico con las franjas de color y tabla de lecturas coloreada. Exporta CSV e imprime/PDF.
- **Reporte de alertas personalizadas** (*Reportes → Reporte de alertas personalizadas*): por periodo (hasta 93 días),
  alertas, unidades y prioridad. Totales (alertas, críticas, unidades, % atendido), alertas por día y por hora,
  alertas y unidades más frecuentes, por prioridad, y el detalle con mensaje, estado del centro de alertas y acceso al
  historial del momento. Exporta CSV e imprime/PDF.
- Ambos están también en **Reportes configurables** (fuentes *Sensores* y *Alertas personalizadas*, agrupables por
  unidad, día o alerta), donde se pueden combinar columnas y guardar como plantilla.

## Límite de velocidad por geocerca con criticidad (parche `0019`)

- En cada geocerca (*Configuración → Geocercas → Límite de velocidad propio*) se puede activar un **límite en km/h**
  opcional (zona escolar, almacén, ciudad…). El mapa lo muestra junto al nombre.
- **Criticidad** según los km/h por encima del límite: por debajo del primer umbral es **tolerancia** (no alerta);
  luego **leve** (+5), **peligroso** (+10) y **crítico** (+15 o más). Los umbrales se pueden cambiar por geocerca.
- **Notificación opcional** por geocerca: evento «Exceso de velocidad en geocerca» al llegar a leve y otra vez cada
  vez que empeora dentro del mismo exceso (leve → peligroso → crítico), con velocidad, límite, exceso y nivel. Llega al
  centro de alertas con su prioridad (leve = media, peligroso = alta, crítico = crítica) y por los canales de la
  notificación (web, correo, push, WhatsApp); la pantalla de la geocerca ofrece crearla con un clic.
- **Reporte de excesos en geocercas** (*Reportes*): episodios (mensajes seguidos por encima del límite) con su nivel
  según el exceso máximo, velocidad máxima, duración y **puntos por nivel** (cuántos mensajes estuvieron en
  tolerancia, leve, peligroso y crítico); totales por nivel, gráfico por geocerca, **ranking de unidades** (leve 1,
  peligroso 3, crítico 5 puntos por exceso), filtros por geocerca, unidad y nivel, acceso al historial, CSV e
  impresión. También como fuente *Excesos en geocercas* en Reportes configurables (agrupable por geocerca y criticidad).
- El límite propio es independiente del atributo `speedLimit` de Traccar (que sigue generando su evento estándar) y las
  alertas personalizadas de velocidad con «usar el límite de la geocerca» también lo usan.

## Geocercas circulares y rutas por coordenadas (parche `0020`)

- **Círculo dibujado**: botón de círculo en la barra de dibujo del mapa; primer clic en el centro, se mueve el mouse
  para el radio (se ve en metros) y segundo clic para terminar. Se guarda como círculo real (`CIRCLE`), no como
  polígono, y al editarlo sigue siendo círculo.
- **Crear por coordenadas** (botón de la barra de dibujo), panel flotante con dos pestañas:
  - **Ruta**: inicio y fin (pegando «lat, lon» desde Google Maps o eligiendo el punto en el mapa), hasta 8 paradas
    intermedias, invertir, tipo de recorrido (vehículo, bicicleta, a pie) y ancho del corredor. «Calcular ruta por
    calles» traza el recorrido real (servidor de rutas OSRM, ver DEPLOY sección 16) con distancia y tiempo estimados, y
    se guarda como geocerca de línea con corredor: la unidad está dentro mientras circula por la ruta y sale al
    desviarse.
  - **Círculo**: centro por coordenadas o clic en el mapa y radio en metros, con vista previa.
  - Ambas permiten poner nombre y el **límite de velocidad propio** (parche `0019`) al crearlas.
- API: `GET /api/routing/route?point=lat,lon&point=lat,lon[&point=…]&profile=driving|bike|foot` devuelve distancia,
  duración, coordenadas simplificadas y el área lista para guardar.

## Importar y exportar geocercas (formatos GIS)

- **Importar** (botón de subir archivo en *Geocercas*): panel con vista previa en el mapa y lista para elegir cuáles
  crear. Formatos: **GeoJSON**, **KML**, **KMZ** (Google Earth / My Maps), **Shapefile** en `.zip` (WGS84 o UTM WGS84,
  p. ej. zona 17S/18S/19S, con nombres del `.dbf`), **GPX** (tracks, rutas y waypoints), **CSV** (columnas `area`,
  `wkt` o `latitud`/`longitud` con `radio`; separador `,` `;` o tabulación) y **WKT** (una geometría por línea,
  opcionalmente `nombre;WKT`).
  - Los puntos se crean como **círculos** (su radio o uno por defecto), las líneas como **rutas con corredor** y los
    polígonos tal cual; los multipolígonos se separan en varias geocercas y los huecos se quitan.
  - Se conservan nombre, descripción, color, límite de velocidad propio, ancho del corredor y radio cuando el archivo
    los trae (también los colores de estilo de KML).
  - Las formas muy detalladas se **simplifican** automáticamente para caber en la geocerca (4096 caracteres) y se
    marcan en la lista.
- **Exportar** (botón de descarga): todas las geocercas en GeoJSON, KML, KMZ, Shapefile (una capa de áreas y otra de
  rutas, con `.prj` WGS84), GPX, CSV (abre en Excel, incluye el área de Traccar y WKT estándar) o WKT.
- Al volver a importar un archivo exportado en GeoJSON, KML/KMZ, Shapefile o CSV los círculos siguen siendo círculos;
  GPX y WKT no tienen círculos y los guardan como polígonos.
- Archivos de ejemplo en [`docs/ejemplos-geocercas`](docs/ejemplos-geocercas).

## Planes, dominios automáticos y panel del distribuidor (parche `0021`)

- **Planes con módulos heredables**: catálogo editable (*Administración → Planes*) con 14 módulos (incluye despachos): dashcams y video,
  combustible, sensores avanzados, alertas personalizadas, velocidad por geocerca, rutas por calles, alertas por
  WhatsApp, chat con conductores, puntaje de conducción, gastos, servicios, reportes configurables y marca blanca.
  - Cada cuenta hereda, tiene un plan o una selección personalizada; lo que usa es la **intersección con todos sus
    gerentes**, así un distribuidor nunca puede dar más de lo que compró.
  - Solo un gerente superior cambia el plan de una cuenta; el selector deshabilita los planes que exceden el suyo.
  - Lo que no está en el plan se oculta del menú, los paneles y las pantallas, y la API responde 403.
- **Dominios propios con HTTPS automático**: el distribuidor registra `gps.sucliente.com` para su marca o la de un
  sub-distribuidor, ve si el DNS ya apunta al servidor y Caddy emite el certificado en la primera visita
  (`on_demand_tls` con verificación en `/api/hierarchy/domain-check`). Sin editar archivos ni reiniciar.
- **Panel del distribuidor** (*Administración → Panel del distribuidor*): clientes y sub-distribuidores, unidades en
  línea y sin señal más de 24 h, cupo de unidades y usuarios, cuentas por plan, vencimientos en 30 días, tabla de
  sus cuentas directas (plan, unidades, en línea, sin señal, usuarios, caducidad) y sus dominios.
- API: `GET/PUT /api/plans`, `GET /api/plans/modules`, `GET /api/reseller/summary`,
  `GET/POST/DELETE /api/hierarchy/domains`, `GET /api/hierarchy/domain-check`.

## Despachos y entregas (parche `0022`)

Módulo **Despachos y entregas** (incluido en los planes Profesional, Video y Distribuidor):

- **Panel de despachos** (*Despachos*): viajes del día con su avance, unidades en curso, entregas y retrasos. El viaje
  elegido se ve en el mapa (paradas numeradas por estado, la unidad y el recorrido pendiente) con cada parada: horario,
  **hora estimada de llegada** (y aviso «fuera de horario» si no llegará a tiempo), llegada, entrega, quién recibió,
  motivo de no entrega, **foto y firma**. Desde ahí se marca una parada a mano, se copia o envía por WhatsApp el
  enlace del conductor o el de cada cliente, y se inicia, edita, cancela o elimina el viaje.
- **Editor de viajes**: unidad, conductor, salida programada y paradas con cliente, dirección, contacto, teléfono,
  coordenadas y ventana horaria; **importar paradas desde CSV** ([ejemplo](docs/ejemplos-despachos/paradas.csv)) y
  **optimizar el orden** (ruta más corta desde la unidad). Al editar un viaje en curso las paradas ya atendidas
  conservan su estado y pruebas.
- **Automático por GPS**: al entrar en el radio de una parada se marca la llegada (y se inicia el viaje si estaba
  planificado); si pasa la hora límite sin llegar, la parada queda «con retraso». El viaje se cierra solo cuando todas
  las paradas están atendidas.
- **Enlace del conductor** (sin cuenta, para el celular): paradas en orden con llamar y navegar (Google Maps),
  «Llegué», «Entregado» con nombre de quien recibe, **foto** (se comprime en el teléfono), **firma con el dedo** y
  ubicación, o «No entregado» con motivo.
- **Enlace del cliente** (uno por parada, solo ve su pedido): estado, hora estimada, cuántas entregas faltan antes,
  la unidad en el mapa mientras va en camino y quién recibió. Con WhatsApp configurado y `web.url`, el cliente recibe
  el enlace al iniciar el viaje y la confirmación al entregar.
- **Alertas**: «Llegada a parada», «Entrega realizada», «Entrega fallida» y «Parada con retraso», en el centro de
  alertas y como notificación (correo, push, WhatsApp).
- **Reporte de despachos**: % de entregas, % a tiempo, fallidas y retrasos, tiempo en cada parada, entregas por
  unidad y por conductor, motivos de no entrega y todos los viajes, con CSV e impresión.
- API: `/api/dispatch/trips`, `/api/dispatch/stops/{id}/status`, `/api/dispatch/report`, públicos
  `/api/dispatch/driver/{token}` y `/api/dispatch/track/{token}`.

## Logística: pedidos, planificación automática y órdenes de servicio (parche `0023`)

Mejoras inspiradas en Wialon Logistics y en sistemas de reparto y de servicio técnico (SimpliRoute, DispatchTrack,
Onfleet, Track-POD):

- **Bolsa de pedidos** (*Despachos → Pedidos*): entregas, **recojos** y **órdenes de servicio técnico** con código,
  cliente, dirección, coordenadas, fecha, ventana horaria, tiempo de atención, **prioridad**, **peso y volumen**,
  **cobro contra entrega**, **bultos** (códigos) y **lista de verificación**. Se crean a mano o se **importan desde
  CSV** ([ejemplo](docs/ejemplos-despachos/pedidos.csv)); se editan, cancelan o **reprograman** a otro día (cuenta
  los intentos). Pestañas por estado: sin asignar, en ruta, entregados, fallidos y cancelados.
- **Planificación automática** (*Despachos → Planificar*): eliges los pedidos, las unidades (capacidad en kg y m³,
  máximo de paradas, turno y conductor) y el almacén de salida (geocercas marcadas con el atributo `dispatchDepot`;
  retorno opcional). El planificador reparte los pedidos entre las unidades respetando capacidad, ventanas (con
  espera), tiempo de atención, turno y prioridad; muestra cada ruta en el mapa con su color, km, horario, carga y hora
  de cada parada, y lista los pedidos que no entran con el motivo (capacidad, horario, turno). «Crear viajes» los
  convierte en viajes; si un viaje se cancela o elimina, sus pedidos pendientes vuelven a la bolsa, y una parada
  omitida también.
- **Órdenes de servicio y prueba avanzada** en el enlace del conductor: lista de verificación a marcar, **escaneo de
  bultos con la cámara** (lector de códigos del navegador o ingreso manual) con aviso si faltan, **cobro contra
  entrega** con monto y medio de pago (efectivo, Yape, Plin, tarjeta, transferencia), **entrega parcial** y hasta
  **3 fotos** además de la firma. Botones según el tipo: «Entregado», «Recogido», «Servicio terminado».
- **Validación del punto**: si la entrega se registra lejos de la dirección (más de 300 m), la parada queda marcada
  «Fuera del punto» con la distancia.
- **Cliente**: aviso por WhatsApp «tu pedido llega en unos N minutos» cuando la unidad está a menos de 15 minutos, y
  **calificación con estrellas y comentario** en el enlace de seguimiento tras la entrega.
- **Reporte** ampliado: cobrado contra entrega frente a lo esperado (y por conductor), calificación promedio y
  calificaciones bajas, entregas fuera del punto, parciales, pedidos sin asignar y entregas por tipo.
- Capacidad por defecto de cada unidad en sus atributos `dispatchCapacityKg`, `dispatchCapacityM3` y
  `dispatchMaxStops` (se puede cambiar en cada planificación).

## Campos personalizados y ventanas del módulo de despachos (parche `0024`)

- **Campos personalizados** (*Despachos → Pedidos →* botón de ajustes): cada empresa o distribuidor define sus
  propios datos y **su rama los hereda** (si un gerente redefine la misma clave, gana la suya):
  - Tipos: texto, número, fecha, lista de opciones y casilla (sí/no).
  - **Con el pedido** (los llena quien crea el pedido: N.° de factura, valor declarado, cadena de frío…) o **al
    entregar** (los llena el conductor en la prueba de entrega: condición de la carga, temperatura, IMEI instalado…).
  - Obligatorio, **visible para el cliente** en su enlace de seguimiento y por tipo de pedido (entrega, recojo,
    servicio).
  - El servidor valida obligatorios, números y opciones de las listas; los valores pasan del pedido a la parada y los
    de la entrega vuelven al pedido. Se importan desde el CSV de pedidos (columna con la clave o el nombre del campo)
    y se exportan en «Entregas (CSV)» del reporte.
- **Mapa de ventanas** del módulo: [docs/capturas/v25-mapa-de-ventanas-despachos.png](docs/capturas/v25-mapa-de-ventanas-despachos.png)
  1. Panel de viajes · 2. Editor de viaje · 3. Bolsa de pedidos · 4. Nuevo pedido · 5. Campos personalizados ·
  6. Planificación automática · 7. Reporte de despachos · 8. Conductor: ruta · 9. Conductor: prueba de entrega ·
  10. Cliente: seguimiento.
- API: `GET/PUT /api/dispatch/fields`.

## Litros o galones por vehículo (parche `0025`)

- En la ficha de cada unidad (*Sensores → Unidad de combustible del vehículo*) se elige **litros o galones**. Al
  cambiarla, la plataforma **convierte los sensores de combustible**: tabla de calibración (o multiplicador),
  capacidad del tanque, umbrales de carga y descarga, límites y consumos por hora, así las lecturas siguen siendo
  la misma cantidad de combustible.
- Todo lo de esa unidad se muestra en su unidad: nivel, cargas y descargas, reporte y evidencia de robo, panel de
  la unidad, tarjeta del mapa, mensajes de WhatsApp y la cantidad de los gastos de combustible.
- Cada gasto de combustible guarda la unidad con que se registró; el resumen de gastos de la flota normaliza a
  litros y también informa galones y precio por galón, y se muestra según la preferencia de volumen del usuario
  (*Preferencias → Unidad de volumen*).

## Transporte público: líneas, horarios y distancia entre unidades (parche `0026`)

Panel separado (*Transporte público* en la barra lateral, módulo `transit` del plan) para empresas de buses, rutas
de personal o colectivos:

- **Líneas** con código y color, circulares o de ida, paraderos (a mano o por CSV), recorrido trazado por calles con
  OSRM y minutos de cada paradero desde la salida (si no se indican se calculan con la velocidad comercial).
- **Tiempos entre paraderos**: cada paradero tiene sus minutos desde el primero (minuto 0). Si no se indican, se
  calculan con la distancia por el recorrido y la velocidad comercial. En el editor se ven al momento la distancia,
  los minutos y la hora programada de cada paradero para una salida de referencia, y la duración de la vuelta; se
  recalculan al cambiar la velocidad o al fijar minutos a mano en un paradero (`docs/capturas/v28-transporte-*.png`).
- **Horario** por frecuencia (franjas «de 06:00 a 09:00 cada 5 min») o por horas de salida; con horas de salida se
  calcula el retraso en cada paradero.
- **Distancia entre unidades de una misma línea**: cada bus se proyecta sobre el recorrido y se muestra la distancia
  y los minutos al bus de adelante y al de atrás. En las líneas circulares los intervalos dan la vuelta y suman el largo
  de la línea. Se ve en una franja con los paraderos y los buses (en rojo si están agrupados, naranja si hay hueco,
  verde si están bien espaciados), en el mapa y en la tabla de unidades (avance, próximo paradero, adelante, atrás,
  retraso, vuelta y velocidad), actualizada cada 10 s.
- **Indicadores**: unidades en ruta, frecuencia planificada y su distancia equivalente, separación real (promedio,
  mínima y máxima), agrupamientos, huecos y unidades fuera de ruta.
- **Alertas** (centro de alertas, correo, WhatsApp, etc.): buses agrupados (`transitBunching`), hueco entre buses
  (`transitGap`), bus fuera de ruta (`transitOffRoute`) y bus con retraso (`transitDelay`), con umbrales por línea.
- **Reporte** (`/reports/transit`): vueltas, pasos por paraderos, puntualidad (de −1 a +5 min), intervalo real frente
  al planificado y regularidad de la línea, por unidad y por paradero, con gráfico, CSV e impresión.
- API: `GET/POST /api/transit/routes`, `PUT/DELETE /api/transit/routes/{id}`, `GET /api/transit/routes/{id}/live` y
  `GET /api/transit/report?routeId=&from=&to=`. La unidad se asigna a la línea con el atributo `transitRouteId`.

- **Ida y vuelta con terminal** (parche `0027`): además de circular o solo ida, una línea puede tener ida y vuelta.
  Se elige el paradero donde empieza la vuelta (el terminal); cada sentido tiene sus paraderos, sus minutos desde su
  propia salida y sus horas de salida. El panel muestra una franja por sentido con los buses y la distancia entre
  ellos, y la tabla indica el sentido de cada unidad. Internamente la línea es un ciclo cerrado (ida → terminal →
  vuelta), así la distancia al bus de adelante sigue funcionando al pasar de un sentido al otro.
- **Llegada estimada frente a la programada** al próximo paradero, por unidad: «A tiempo / Atrasado / Adelantado»
  con la hora estimada y la programada (puntual de −1 a +5 min, igual que el reporte).
- **Pantalla del conductor** (`/bus/<enlace>`, sin cuenta): estado frente al horario en grande, próximo paradero con
  distancia, hora estimada y programada, bus de adelante y de atrás con distancia y minutos, próximos paraderos con su
  hora y consejos para mantener la separación («muy cerca del bus de adelante: reduzca o espere», «hueco grande:
  mantenga el ritmo», «va adelantado: espere en el paradero»), priorizando siempre la separación. Se actualiza cada
  10 s, mantiene la pantalla encendida y vibra cuando cambia el estado. Los enlaces se generan en *Enlaces de
  conductores* (copiar, abrir, enviar por WhatsApp o reemplazar, lo que desactiva el anterior).
- **Reporte comparativo por día y hora**: mapa de calor del retraso promedio por paradero y hora del día, y por día de
  la semana y hora con el intervalo real entre buses; indica el paradero y la hora con más retraso, y se exporta a CSV.
- Cuando un bus vuelve tras horas sin reportar (noche, cambio de turno) su viaje anterior se da por terminado, para que
  el retraso no se calcule contra la salida de otro turno.

Capturas: `docs/capturas/v27-transporte-*.png` y `docs/capturas/v29-transporte-*.png`.

### Corrección: posiciones que dejaban de procesarse (parche `0028`)

En el procesamiento de posiciones de Traccar, si un paso fallaba después de que el anterior había continuado la cadena,
la posición se procesaba dos veces y la cola del equipo podía quedar bloqueada: el equipo dejaba de actualizarse hasta
reiniciar el servidor. Se veía con equipos HTTP (p. ej. la app Traccar Client u OsmAnd) al enviar muchas posiciones
seguidas. Ahora cada paso continúa la cadena una sola vez, el registro en el log no puede cortar la cola y la reserva
del equipo en la caché se hace bajo el mismo bloqueo que la cola. Se reprodujo con la carga de demo de transporte
(12 600 posiciones en pocos minutos): antes, 124 fallos y 3 equipos bloqueados; después, ninguno.
`server/tests/test_processing_queue.py` es una prueba de carga que verifica que todos los equipos terminen con su
última posición y sigan aceptando nuevas (no reproduce por sí sola el caso original, que depende del momento exacto).

## TPMS, activos a batería, agro, configuración en lote, 2FA, tráfico y Street View (parche `0029`)

- **Neumáticos (TPMS)**: por vehículo se define la disposición (ejes de 2 o 4 llantas), los atributos de presión y
  temperatura de cada neumático (`tire{n}Pressure`, `{n}` = número), la unidad que envía el equipo (psi, bar, kPa) y
  la que se muestra, y los límites. La página *Neumáticos (TPMS)* muestra la flota con cada vehículo dibujado y sus
  llantas por color (normal, presión baja, alta, temperatura alta, sin dato), el detalle con presión y temperatura por
  neumático y la presión de las últimas 24 h. Alerta `tpmsAlarm` una vez por cambio de estado.
- **Activos a batería**: rastreadores que reportan pocas veces al día. Cada activo tiene su intervalo esperado; entre
  reportes está «dormido» y pasa a «atrasado» si se demora un 25 % más. La batería sale del nivel en % o del voltaje
  (rango lleno–vacío) y su tendencia de 30 días estima los días restantes. Alertas `assetMissedReport` y
  `assetLowBattery` (una vez hasta que se recupera). Botón para enviar el intervalo al equipo (queda en cola hasta que
  despierta).
- **Agro y maquinaria**: implementos con ancho de trabajo y cómo saber que trabajan (una entrada del equipo, p. ej.
  implemento abajo o toma de fuerza, o un rango de velocidad); campos = geocercas marcadas con su cultivo y área. La
  labor de una unidad sobre un campo da hectáreas trabajadas, cobertura del campo, hectáreas sin labor, solape (zonas
  pasadas dos o más veces), pasadas, horas, km y productividad (ha/h), con mapa coloreado por número de pasadas y el
  recorrido. Resumen por unidad con CSV.
- **Configuración de equipos en lote**: se eligen equipos (búsqueda, grupo, modelo), los comandos (a mano o desde
  una plantilla propia o del distribuidor) y se envían; los equipos desconectados los reciben al conectarse. Cada envío
  muestra por equipo: en cola, enviado, respondió (con la respuesta del equipo) o falló, con reintento. El corte y la
  reanudación de motor no se envían en lote.
- **Verificación en dos pasos (2FA)**: en *Seguridad* se activa con el QR de la app de autenticación, confirmando con
  un código; se entregan 8 códigos de recuperación de un solo uso (sirven también para entrar). Un gerente o
  distribuidor puede exigir 2FA a todas las cuentas que administra: quien no la tenga no puede usar la plataforma
  hasta configurarla y no puede desactivarla. Un código equivocado cuenta como intento fallido de inicio de sesión.
- **Tráfico y Street View**: botón *Tráfico* en el mapa (usa la clave de Google, TomTom o HERE que esté configurada);
  *Street View* en el menú de la unidad, embebido si hay clave de Google y si no en Google Maps.

Capturas: `docs/capturas/v30-*.png`. Notas de uso de las claves de mapas sin exceder el nivel gratuito en la sección
22 de `infra/DEPLOY.md`.

## Maquinaria pesada y vistas de Google sin costo (parche `0030`)

- **Maquinaria pesada** (*Maquinaria pesada*, módulo `machinery`): por máquina se define el tipo (excavadora,
  cargador, retroexcavadora, volquete, rodillo...), la entrada que indica trabajo (hidráulico, toma de fuerza,
  vibración; sin ella, trabajo = motor encendido y en movimiento), el turno y los días de trabajo y la tarifa de
  alquiler por hora de motor o de trabajo.
  - **Horómetro** desde las horas de motor del equipo, igualado al tablero con la lectura actual.
  - **Estado ahora**: trabajando, en ralentí, apagada o sin señal (una máquina apagada sigue «apagada» hasta 24 h
    sin reportar; con motor encendido, 30 min sin datos es «sin señal»).
  - **Periodo**: horas de trabajo, de ralentí y apagada, utilización (trabajo / horas de motor), horas fuera de
    horario, combustible por hora (si el equipo envía `fuelUsed`), horas por obra (geocercas) y por operador
    (llavero o tarjeta RFID → conductor), gráfico por día, línea de tiempo, próximo mantenimiento por horas (los
    mantenimientos de tipo «Horas de motor» de la unidad) y monto de alquiler. Parte diario y resumen en CSV.
- **Vistas de Google con la Maps Embed API** (sin costo por carga; solo pide una clave restringida al dominio):
  - Tarjeta de la unidad: *Vista de Google* (satélite y mapa), *Street View* y *Buscar cerca* (grifos, talleres,
    llanterías, hospitales, comisarías, hospedajes).
  - Centro de alertas: satélite, Street View o mapa del punto de la alerta.
  - Despachos: *Ruta de Google* de la unidad por las paradas pendientes, y en el enlace de seguimiento del cliente
    la ruta del vehículo a su entrega.
  - Sin clave se ofrece la misma vista en Google Maps (nueva pestaña). El mapa principal no usa Google.

Capturas: `docs/capturas/v31-*.png` (en las de Google, el recuadro muestra qué carga Google con la clave; el
entorno de prueba no tiene clave ni salida a Google).

## Marca SAFE CONNECTION y mapas propios de Latinoamérica (parche `0031`)

- **SAFE CONNECTION es la marca maestra**: logo (versión a color para fondos claros y blanca para fondos azules),
  íconos de la app instalable y del navegador, colores (azul `#163c7d` y celeste `#0eabf1`), título y descripción por
  defecto del servidor y emisor del 2FA. Los distribuidores siguen pudiendo usar su propia marca (marca blanca por
  dominio o por cuenta); sin ella se ve SAFE CONNECTION. Archivos en `web/public/brand/` y muestra en
  `docs/marca/safe-connection-marca.png`.
- **Mapas propios**: el mapa de calles es un solo archivo PMTiles de Latinoamérica (México a Tierra del Fuego y el
  Caribe) en `infra/maps/`, servido por Caddy en `/maps` y dibujado en el navegador con los estilos de Protomaps en
  español: *Safe Connection · Calles*, *Oscuro* y *Gris*. Sin costo por vista ni límite de usuarios. Si el archivo no
  está instalado, la plataforma usa OpenFreeMap automáticamente. Antes el mapa por defecto era LocationIQ con una clave
  pública de prueba compartida por todas las instalaciones de Traccar.
- Se genera y actualiza con `infra/scripts/mapas-latam.sh` (ver tamaños en la sección 24 de `infra/DEPLOY.md`).

Capturas: `docs/capturas/v32-safe-connection-*.png`.

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

## Login interactivo SAFE CONNECTION

Pantalla de acceso de dos paneles (también la usan «Registrarse» y «Reiniciar contraseña»):

- **Panel izquierdo** (se oculta en pantallas pequeñas): logo blanco, globo animado en `canvas` centrado en
  Latinoamérica con arcos de red y pulsos entre las principales ciudades (reacciona al mouse y respeta
  «reducir movimiento»), titular, texto, 4 iconos de características, tarjeta de cifras y lema manuscrito.
- **Panel derecho**: logo, «Iniciar sesión», email y contraseña con iconos y ojo para mostrarla, «Recordarme»
  (si se desmarca no se guarda el email), «¿Olvidaste tu contraseña?» (solo si el servidor tiene correo
  configurado), botón degradado, separador «o» + botón de OpenID (solo si OpenID está activo), código 2FA
  cuando el usuario lo tiene, aviso de seguridad y pie «Powered by SAFE CONNECTION».
- En móvil queda una tarjeta blanca sobre una franja azul marino.

Los textos del panel izquierdo son configurables por atributos del servidor o de la marca blanca de cada
revendedor (si no existen se usan los textos por defecto, sin cifras inventadas):

| Atributo | Ejemplo |
|---|---|
| `loginHeadline` | `Tu conectividad, nuestra prioridad` (la última palabra sale en celeste) |
| `loginText` | Párrafo bajo el titular |
| `loginTagline` | `Conectamos tu mundo` |
| `loginStats` | `12,485:SIMs activas;99.8%:Disponibilidad;186:Clientes activos;24/7:Soporte` |
| `loginOpenIdLabel` | `Continuar con Google` (texto del botón OpenID) |

Para que «Continuar con Google» funcione hay que configurar OpenID en `traccar.xml` con Google como proveedor
(`openid.clientId`, `openid.clientSecret`, `openid.issuerUrl=https://accounts.google.com`).

Capturas: `docs/capturas/v33-login-escritorio.png`, `v33-login-error.png`, `v33-login-movil.png`.

**Bing Maps**: no se puede agregar gratis. Microsoft cerró las cuentas gratuitas de Bing Maps en 2025 y su
reemplazo es Azure Maps (de pago, con una cuota gratuita mensual). Los estilos Bing que trae Traccar solo
funcionan con una clave antigua de Bing que ya no se emite.

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
| Puntos de interés con icono, Rutas planificadas | ✅ Geocercas de ruta por coordenadas y círculos; 🔜 POI con icono |
| Gastos (combustible, peajes…) | 🔜 Fase 2 (módulo propio) |
| Chat | 🔜 Fase 3 |
| Estado del sistema, cola de comandos | 🔜 Fase 2 |
| App móvil Android/iOS (Expo + EAS Build) | 🔜 Fase 2 (prototipo en `docs/app-movil`, con cámaras en el mapa y video en vivo) |

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
python3 server/tests/test_operations.py
python3 server/tests/test_services.py
python3 server/tests/test_rules.py
python3 server/tests/test_reports.py
python3 server/tests/test_geofence_speed.py
python3 server/tests/test_routing.py   # con routing.url apuntando a un OSRM
python3 server/tests/test_plans.py
python3 server/tests/test_dispatch.py   # con media.path para las fotos y firmas
python3 server/tests/test_logistics.py
python3 server/tests/test_custom_fields.py
python3 server/tests/test_fuel_units.py
python3 server/tests/test_transit.py
python3 server/tests/test_processing_queue.py
python3 server/tests/test_two_factor.py
python3 server/tests/test_tpms.py
python3 server/tests/test_assets.py
python3 server/tests/test_device_config.py
python3 server/tests/test_agro.py
python3 server/tests/test_machinery.py
python3 server/tests/test_chat.py   # con la configuración de WhatsApp de prueba indicada en el archivo
python3 server/tests/test_retention.py foto.jpg   # con la configuración retention.* indicada en el archivo
```

## Producción

Ver [infra/DEPLOY.md](infra/DEPLOY.md): Contabo/OVH, HTTPS automático, firewall, copias de seguridad y dominios
de marca blanca.

## Licencias

Traccar y traccar-web se distribuyen bajo la licencia Apache 2.0 (ver `web/LICENSE.txt`). Los cambios de este
repositorio se publican bajo la misma licencia. Para uso comercial puedes cambiar la marca libremente, siempre que
conserves los avisos de licencia.
