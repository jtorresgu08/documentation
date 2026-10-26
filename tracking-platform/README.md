# Plataforma de rastreo GPS (base Traccar)

Plataforma comercializable de rastreo GPS con jerarquía multinivel de gerentes y marca blanca, construida sobre
[Traccar](https://www.traccar.org) 6.9.1 (Apache 2.0). Incluye **todas las funciones de Traccar** (más de 200
protocolos GPS, mapa en vivo, historial, reportes, geocercas, alertas, comandos, mantenimiento, conductores…) más
lo que hace falta para venderla a revendedores y clientes finales.

```
tracking-platform/
├── server/            Parche del servidor Traccar + Dockerfile + configuración
│   ├── patches/       0001-multilevel-manager-hierarchy.patch (se aplica sobre Traccar v6.9.1)
│   └── tests/         Prueba de extremo a extremo de la jerarquía (27 comprobaciones)
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

## Panel web

Basado en tus capturas de referencia:

- Menú lateral contraíble (iconos ↔ iconos con texto), en móvil y en escritorio, con el logo de la marca.
- Menú de usuario: Dispositivos, Eventos, Historial, Alertas, Compartir ubicación, Enviar comando, Reportes,
  Geocercas, Mantenimiento, Conductores, Grupos y Configuración.
- Menú de **Administración** (gerentes y superadministrador): Descripción general con contadores, Usuarios (con
  contador y columna *Gerente*), Dispositivos (en línea/total), Métricas, Configuración del servidor, Apariencia,
  Anuncios, Calendarios, Atributos calculados, Comandos guardados, Registros y Auditoría.
- Lista de dispositivos con velocidad y punto de estado (verde en movimiento, amarillo detenido, rojo desconectado).
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

# Prueba de jerarquía (con una base de datos vacía)
python3 server/tests/test_hierarchy.py
```

## Producción

Ver [infra/DEPLOY.md](infra/DEPLOY.md): Contabo/OVH, HTTPS automático, firewall, copias de seguridad y dominios
de marca blanca.

## Licencias

Traccar y traccar-web se distribuyen bajo la licencia Apache 2.0 (ver `web/LICENSE.txt`). Los cambios de este
repositorio se publican bajo la misma licencia. Para uso comercial puedes cambiar la marca libremente, siempre que
conserves los avisos de licencia.
