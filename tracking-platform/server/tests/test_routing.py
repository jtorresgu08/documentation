#!/usr/bin/env python3
"""
Prueba de extremo a extremo de las geocercas circulares y de ruta por coordenadas: ruta por calles entre inicio y fin
(con paradas), simplificada para caber en la geocerca, errores de coordenadas, y que las unidades se detecten dentro
del corredor de la ruta y dentro del círculo (y fuera cuando se alejan).

Uso: servidor con routing.url apuntando a un servicio OSRM (o al simulado de las pruebas) y osmand.port=5055,
p. ej. TRACCAR_URL=http://127.0.0.1:8082 python3 test_routing.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import login, send  # noqa: E402


def main():
    api, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    start, end = (-12.0464, -77.0428), (-12.0890, -77.0010)
    status, route = api.req('GET', f'/api/routing/route?point={start[0]},{start[1]}&point={end[0]},{end[1]}')
    check('road route between start and end', status == 200 and route['distance'] > 5000 and route['duration'] > 0
          and route['area'].startswith('LINESTRING') and len(route['area']) <= 4000, {k: route.get(k) for k in ('distance', 'duration', 'points')})
    first, last = route['coordinates'][0], route['coordinates'][-1]
    check('route starts and ends at the coordinates', abs(first[1] - start[0]) < 0.0005 and abs(first[0] - start[1]) < 0.0005
          and abs(last[1] - end[0]) < 0.0005 and abs(last[0] - end[1]) < 0.0005, (first, last))
    check('route simplified', len(route['coordinates']) < route['points'], (len(route['coordinates']), route['points']))
    status, via = api.req('GET', f'/api/routing/route?point={start[0]},{start[1]}&point=-12.0700,-77.0600&point={end[0]},{end[1]}&profile=foot')
    check('route with a stop and on foot', status == 200 and via['distance'] > route['distance'] and via['duration'] > route['duration'], via.get('distance'))
    status, _ = api.req('GET', f'/api/routing/route?point={start[0]},{start[1]}')
    check('one point rejected', status == 400, status)
    status, _ = api.req('GET', '/api/routing/route?point=95,10&point=-12,-77')
    check('invalid coordinates rejected', status == 400, status)

    suffix = str(int(time.time()))
    uid = f'routing-{suffix}'
    device = api.req('POST', '/api/devices', {'name': f'Ruta {suffix}', 'uniqueId': uid})[1]
    status, corridor = api.req('POST', '/api/geofences', {'name': f'Ruta {suffix}', 'area': route['area'],
                                                         'attributes': {'polylineDistance': 60}})
    check('route geofence saved', status == 200, corridor)
    status, ring = api.req('POST', '/api/geofences', {'name': f'Círculo {suffix}', 'area': 'CIRCLE (-12.120000 -77.030000, 400)',
                                                     'attributes': {}})
    check('circle geofence saved', status == 200 and ring['area'].startswith('CIRCLE'), ring)
    for geofence in (corridor, ring):
        api.req('POST', '/api/permissions', {'deviceId': device['id'], 'geofenceId': geofence['id']})

    def geofences_after(lat, lon, moment):
        send(uid, moment, lat, lon, 30)
        deadline = time.time() + 15
        while time.time() < deadline:
            positions = api.req('GET', f'/api/positions?deviceId={device["id"]}')[1]
            if positions and abs(positions[0]['latitude'] - lat) < 1e-6 and abs(positions[0]['longitude'] - lon) < 1e-6:
                return positions[0].get('geofenceIds') or []
            time.sleep(1)
        return None

    now = time.time()
    middle = route['coordinates'][len(route['coordinates']) // 2]
    check('unit on the route is inside the corridor', corridor['id'] in (geofences_after(middle[1], middle[0], now - 90) or []))
    far = geofences_after(middle[1] + 0.01, middle[0] + 0.01, now - 60)
    check('unit far from the route is outside', far is not None and corridor['id'] not in far, far)
    check('unit in the circle is inside', ring['id'] in (geofences_after(-12.1220, -77.0310, now - 30) or []))
    away = geofences_after(-12.1260, -77.0300, now)
    check('unit 600 m away is outside the circle', away is not None and ring['id'] not in away, away)

    api.req('DELETE', f'/api/devices/{device["id"]}')
    for geofence in (corridor, ring):
        api.req('DELETE', f'/api/geofences/{geofence["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
