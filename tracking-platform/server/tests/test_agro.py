#!/usr/bin/env python3
"""
Prueba de extremo a extremo de agro y maquinaria: campo (geocerca marcada con cultivo y área), implemento con ancho y
rango de velocidad, labor en zigzag sobre el campo (hectáreas, cobertura, pasadas, solape, horas y productividad), una
pasada repetida (solape), trabajo según la entrada del implemento, resumen por unidad y módulo del plan.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_agro.py
"""
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402

LAT, LON = -6.70, -79.90  # Lambayeque
M_LAT = 1 / 111195.0
M_LON = 1 / (111195.0 * math.cos(math.radians(LAT)))


def point(x, y):
    return LAT + y * M_LAT, LON + x * M_LON


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    corners = [point(0, 0), point(100, 0), point(100, 100), point(0, 100)]
    wkt = 'POLYGON((' + ', '.join(f'{lat:.7f} {lon:.7f}' for lat, lon in corners + [corners[0]]) + '))'
    _, geofence = admin.req('POST', '/api/geofences', {'name': f'Lote 7 {suffix}', 'area': wkt})
    status, field = admin.req('PUT', f'/api/agro/fields/{geofence["id"]}', {'field': True, 'crop': 'Maíz'})
    check('field marked with crop and area', status == 200 and field['field'] and field['crop'] == 'Maíz' and abs(field['areaHa'] - 1.0) < 0.02, field)
    _, tractor = admin.req('POST', '/api/devices', {'name': f'Tractor {suffix}', 'uniqueId': f'agro-{suffix}'})
    status, implement = admin.req('POST', '/api/agro/implements', {'name': f'Sembradora 10 m {suffix}', 'type': 'planter', 'width': 10, 'minSpeed': 3, 'maxSpeed': 15, 'deviceIds': [tractor['id']]})
    check('implement assigned to the tractor', status == 200 and implement['deviceIds'] == [tractor['id']], implement)
    status, _ = admin.req('POST', '/api/agro/implements', {'name': 'Sin ancho', 'width': 0})
    check('implement needs a width', status == 400, status)

    start = time.time() - 3 * 3600
    moment = start
    # drive to the field fast (not working), ten passes 10 m apart at 9 km/h, then one pass again over the third
    for k in range(5):
        lat, lon = point(-200 + k * 40, -20)
        send(tractor['uniqueId'], moment, lat, lon, 30)
        moment += 10
    for p in list(range(10)) + [2]:
        x = 5 + p * 10
        for step in range(21):
            y = step * 5 if p % 2 == 0 else 100 - step * 5
            lat, lon = point(x, y)
            send(tractor['uniqueId'], moment, lat, lon, 9)
            moment += 2
        moment += 8
    time.sleep(8)
    query = f'from={iso(start - 60)}&to={iso(time.time() + 60)}'
    status, work = admin.req('GET', f'/api/agro/work?deviceId={tractor["id"]}&fieldId={geofence["id"]}&{query}')
    check('work on the field', status == 200 and work['coveragePercent'] > 95 and abs(work['workedHa'] - 1.0) < 0.05, {k: work.get(k) for k in ('workedHa', 'coveragePercent', 'fieldHa')} if status == 200 else work)
    check('eleven passes, the repeated one is overlap', work['passCount'] == 11 and 7 < work['overlapPercent'] < 15, (work['passCount'], work['overlapPercent']))
    check('hours, km and productivity', 0.1 < work['workHours'] < 0.2 and 1.0 < work['workKm'] < 1.3 and work['haPerHour'] > 5, (work['workHours'], work['workKm'], work['haPerHour']))
    check('coverage map and tracks for the map', work['coverage']['features'] and len(work['tracks']) == 11 and any(f['properties']['passes'] >= 2 for f in work['coverage']['features']), len(work['coverage']['features']))

    status, summary = admin.req('GET', f'/api/agro/summary?{query}')
    item = next((s for s in summary if s['deviceId'] == tractor['id']), {}) if status == 200 else {}
    check('summary per unit', abs(item.get('workedHa', 0) - 1.0) < 0.1 and item.get('implementName') == implement['name'], item)

    # an implement that works by its input: these positions do not report it, so nothing was worked
    status, sprayer = admin.req('POST', '/api/agro/implements', {'name': f'Fumigadora 24 m {suffix}', 'width': 24, 'workAttribute': 'in1'})
    status, dry = admin.req('GET', f'/api/agro/work?deviceId={tractor["id"]}&implementId={sprayer["id"]}&fieldId={geofence["id"]}&{query}')
    check('working only when the implement input is on', status == 200 and dry['workedHa'] == 0, dry.get('workedHa'))
    status, fields = admin.req('GET', '/api/agro/fields')
    check('fields list', status == 200 and any(f['id'] == geofence['id'] for f in fields), status)

    password = 'Agro2026!'
    _, basic = admin.req('POST', '/api/users', {'name': f'Básico agro {suffix}', 'email': f'agro-{suffix}@test', 'password': password, 'attributes': {'plan': 'basic'}})
    other, _ = login(f'agro-{suffix}@test', password)
    status, _ = other.req('GET', '/api/agro/implements')
    check('agro outside the basic plan', status == 403, status)
    admin.req('DELETE', f'/api/users/{basic["id"]}')
    for implement_id in (implement['id'], sprayer['id']):
        status, _ = admin.req('DELETE', f'/api/agro/implements/{implement_id}')
    check('implements deleted', status == 204, status)
    admin.req('DELETE', f'/api/devices/{tractor["id"]}')
    admin.req('DELETE', f'/api/geofences/{geofence["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
