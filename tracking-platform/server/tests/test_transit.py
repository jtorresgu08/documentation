#!/usr/bin/env python3
"""
Prueba de extremo a extremo de transporte público: línea circular con paraderos, unidades asignadas, avance de cada
bus, distancia y minutos al bus de adelante y de atrás (suman el largo de la línea), agrupamiento, huecos, fuera de
ruta, retraso, paraderos atendidos, vueltas y reporte de puntualidad e intervalos; permisos y módulo del plan.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_transit.py
"""
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402

CORNERS = [(-12.100, -77.040), (-12.100, -77.020), (-12.110, -77.020), (-12.110, -77.040)]


def meters(a, b):
    lat = (a[0] + b[0]) / 2 * math.pi / 180
    return math.hypot((b[1] - a[1]) * math.cos(lat), b[0] - a[0]) * math.pi / 180 * 6371008.8


LOOP = CORNERS + [CORNERS[0]]
SEGMENTS = [meters(LOOP[i], LOOP[i + 1]) for i in range(4)]
LENGTH = sum(SEGMENTS)


def point_at(distance):
    distance %= LENGTH
    for i, segment in enumerate(SEGMENTS):
        if distance <= segment:
            t = distance / segment
            return (LOOP[i][0] + (LOOP[i + 1][0] - LOOP[i][0]) * t, LOOP[i][1] + (LOOP[i + 1][1] - LOOP[i][1]) * t)
        distance -= segment
    return LOOP[0]


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    buses = [admin.req('POST', '/api/devices', {'name': f'Bus {name} {suffix}', 'uniqueId': f'bus{name}-{suffix}'})[1] for name in 'ABC']
    stops = [
        {'name': 'Terminal Norte', 'latitude': -12.100, 'longitude': -77.040},
        {'name': 'Av. Central', 'latitude': -12.100, 'longitude': -77.030},
        {'name': 'Plaza Este', 'latitude': -12.100, 'longitude': -77.020},
        {'name': 'Mercado Sur', 'latitude': -12.110, 'longitude': -77.020},
        {'name': 'Colegio', 'latitude': -12.110, 'longitude': -77.030},
        {'name': 'Hospital', 'latitude': -12.110, 'longitude': -77.040},
    ]
    body = {'name': f'Línea 12 {suffix}', 'code': '12', 'color': '#e67e22', 'circular': True, 'stops': stops,
            'path': [list(point) for point in LOOP], 'schedule': {'bands': [{'from': '00:00', 'to': '23:59', 'minutes': 10}]},
            'attributes': {'speedKmh': 20, 'bunchingKm': 0.3, 'gapKm': 2.5, 'offRouteMeters': 150, 'delayMinutes': 5},
            'deviceIds': [bus['id'] for bus in buses]}
    status, _ = admin.req('POST', '/api/transit/routes', {**body, 'stops': stops[:1]})
    check('line needs two stops', status == 400, status)
    status, route = admin.req('POST', '/api/transit/routes', body)
    check('line created with its units', status == 200 and sorted(route['deviceIds']) == sorted(bus['id'] for bus in buses), route if status != 200 else '')

    now = time.time()
    a, b, c = buses
    distance = LENGTH - 280
    end = distance + LENGTH + 700
    moment = now - 2800
    while distance <= end:
        lat, lon = point_at(distance)
        send(a['uniqueId'], moment, lat, lon, 10)
        time.sleep(0.15)
        distance += 250
        moment += 90  # 10 km/h, half the planned speed: the bus falls behind schedule
    final = distance - 250
    a_moment = moment - 90
    for offset in (600, 400, 200):
        lat, lon = point_at(final - offset)
        send(b['uniqueId'], a_moment - offset / 5, lat, lon, 25)
        time.sleep(0.2)
    for offset in (3500, 3300):
        lat, lon = point_at(final - offset)
        send(c['uniqueId'], a_moment - offset / 50, lat, lon, 20)
        time.sleep(0.2)
    time.sleep(6)  # the server buffers positions a few seconds to put them in order

    status, live = admin.req('GET', f'/api/transit/routes/{route["id"]}/live')
    units = {unit['name']: unit for unit in live.get('units', [])} if status == 200 else {}
    ua, ub, uc = (units.get(f'Bus {name} {suffix}', {}) for name in 'ABC')
    check('line length and stops', status == 200 and abs(live['summary']['lengthKm'] - LENGTH / 1000) < 0.1 and len(live['stops']) == 6, live.get('summary'))
    check('three units running', live['summary']['running'] == 3, live['summary'])
    check('bus B is 200 m behind bus A', abs(ub.get('aheadMeters', 0) - 200) < 40 and ub.get('aheadName') == a['name'], ub)
    check('distance ahead and behind are consistent', ua.get('behindMeters') == ub.get('aheadMeters') and abs(uc.get('aheadMeters', 0) - 3100) < 60, (ua.get('behindMeters'), uc.get('aheadMeters')))
    gaps = [unit.get('aheadMeters', 0) for unit in (ua, ub, uc)]
    check('gaps around the circular line add up to its length', abs(sum(gaps) - LENGTH) < 30, (gaps, round(LENGTH)))
    check('minutes between buses from the line speed', ub.get('aheadMinutes') == round(200 / (20 / 3.6) / 60), ub.get('aheadMinutes'))
    check('bunching and gaps counted', live['summary']['bunching'] == 1 and live['summary']['gaps'] == 2 and live['summary']['plannedHeadwayMinutes'] == 10, live['summary'])
    check('next stop and laps for bus A (new lap starts on time at the terminal)', ua.get('nextStopName') == 'Av. Central' and ua.get('lap') == 2 and ua.get('delayMinutes') == 0, ua)

    status, events = admin.req('GET', f'/api/reports/events?deviceId={a["id"]}&deviceId={b["id"]}&from={iso(now - 3600)}&to={iso(time.time() + 60)}')
    types = sorted({event['type'] for event in events}) if status == 200 else events
    check('bunching and delay alerts', 'transitBunching' in types and 'transitDelay' in types, types)

    for offset in (0, 30):
        lat, lon = point_at(final - 3300)
        send(c['uniqueId'], time.time() - 20 + offset / 3, lat, lon + 0.008, 15)
        time.sleep(0.3)
    time.sleep(6)
    status, live = admin.req('GET', f'/api/transit/routes/{route["id"]}/live')
    uc = next((unit for unit in live['units'] if unit['deviceId'] == c['id']), {})
    check('bus off the route detected', uc.get('offRoute') is True and live['summary']['offRoute'] == 1 and live['summary']['running'] == 2, uc)
    status, events = admin.req('GET', f'/api/reports/events?deviceId={c["id"]}&from={iso(now - 3600)}&to={iso(time.time() + 60)}')
    check('off route alert', any(event['type'] == 'transitOffRoute' for event in events), [event['type'] for event in events])

    status, report = admin.req('GET', f'/api/transit/report?routeId={route["id"]}&from={iso(now - 3600)}&to={iso(time.time() + 60)}')
    rows = {unit['name']: unit for unit in report.get('units', [])} if status == 200 else {}
    check('report laps and stop visits', status == 200 and rows.get(a['name'], {}).get('laps') == 2 and len(report['stops']) == 6
          and all(stop['visits'] >= 1 for stop in report['stops']), (rows.get(a['name']), [s['visits'] for s in report.get('stops', [])]))
    check('report punctuality shows the delay', rows.get(a['name'], {}).get('averageDelayMinutes', 0) > 3 and report['summary']['onTimeRate'] is not None, report.get('summary'))

    status, edited = admin.req('PUT', f'/api/transit/routes/{route["id"]}', {**body, 'deviceIds': [a['id'], b['id']]})
    check('units can be unassigned', status == 200 and sorted(edited['deviceIds']) == sorted([a['id'], b['id']]), edited.get('deviceIds'))

    password = 'Bus2026!'
    status, other = admin.req('POST', '/api/users', {'name': f'Ajeno {suffix}', 'email': f'bus-{suffix}@test', 'password': password, 'attributes': {'plan': 'reseller'}})
    outsider, _ = login(f'bus-{suffix}@test', password)
    status, _ = outsider.req('GET', f'/api/transit/routes/{route["id"]}/live')
    check('other accounts cannot see the line', status == 404, status)
    other['attributes']['plan'] = 'pro'
    admin.req('PUT', f'/api/users/{other["id"]}', other)
    pro, _ = login(f'bus-{suffix}@test', password)
    status, _ = pro.req('GET', '/api/transit/routes')
    check('transit module outside the plan', status == 403, status)

    status, _ = admin.req('DELETE', f'/api/transit/routes/{route["id"]}')
    check('line deleted', status == 204, status)
    admin.req('DELETE', f'/api/users/{other["id"]}')
    for bus in buses:
        admin.req('DELETE', f'/api/devices/{bus["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
