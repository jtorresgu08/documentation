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
│   └── tests/         Pruebas de extremo a extremo (jerarquía: 27, dashcams: 20) y simulador de dashcam
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

## Dashcams (JT/T 808 + 1078)

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

En el panel, el menú **Cámaras** muestra los eventos agrupados por alarma (miniatura, tipo, foto y video) y una
cuadrícula de video en vivo de 4 canales. Ver la sección *Dashcams* de [infra/DEPLOY.md](infra/DEPLOY.md).

## Panel web

Basado en tus capturas de referencia:

- Menú lateral contraíble (iconos ↔ iconos con texto), en móvil y en escritorio, con el logo de la marca.
- Menú de usuario: Dispositivos, Eventos, Historial, Alertas, Compartir ubicación, Enviar comando, Reportes,
  Geocercas, Mantenimiento, Conductores, Grupos y Configuración.
- Menú de **Administración** (gerentes y superadministrador): Descripción general con contadores, Usuarios (con
  contador y columna *Gerente*), Dispositivos (en línea/total), Métricas, Configuración del servidor, Apariencia,
  Anuncios, Calendarios, Atributos calculados, Comandos guardados, Registros y Auditoría.
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
```

## Producción

Ver [infra/DEPLOY.md](infra/DEPLOY.md): Contabo/OVH, HTTPS automático, firewall, copias de seguridad y dominios
de marca blanca.

## Licencias

Traccar y traccar-web se distribuyen bajo la licencia Apache 2.0 (ver `web/LICENSE.txt`). Los cambios de este
repositorio se publican bajo la misma licencia. Para uso comercial puedes cambiar la marca libremente, siempre que
conserves los avisos de licencia.
