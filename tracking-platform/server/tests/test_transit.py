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
from test_dashcam import Client, check, results  # noqa: E402
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

    heat = report.get('heatmap', {})
    check('report heat map by stop and hour and by day', heat.get('hours') and len(heat.get('byStop', [])) == 6
          and heat.get('byDay') and all(cell['count'] > 0 for row in heat['byStop'] for cell in row['cells'].values()), heat.get('hours'))

    status, live = admin.req('GET', f'/api/transit/routes/{route["id"]}/live')
    ua = next((unit for unit in live['units'] if unit['deviceId'] == a['id']), {})
    check('estimated against scheduled arrival at the next stop', ua.get('nextStopEta') and ua.get('nextStopScheduled')
          and isinstance(ua.get('nextStopDelayMinutes'), int), {k: ua.get(k) for k in ('nextStopEta', 'nextStopScheduled', 'nextStopDelayMinutes')})

    status, links = admin.req('POST', f'/api/transit/routes/{route["id"]}/driver-links')
    tokens = {link['deviceId']: link['token'] for link in links} if status == 200 else {}
    check('driver links for every unit', status == 200 and len(tokens) == 3 and all(tokens.values()), links)
    public = Client()
    status, screen = public.req('GET', f'/api/transit/driver/{tokens.get(b["id"])}')
    check('driver screen without an account', status == 200 and screen['unit'].get('aheadName') == a['name']
          and screen['line']['name'] == body['name'] and 'bunching' in screen['advice'], screen if status != 200 else screen.get('advice'))
    status, _ = public.req('GET', f'/api/transit/driver/{b["id"]}-wrongtoken')
    check('driver screen needs the right link', status == 404, status)
    old = tokens.get(b['id'])
    status, links = admin.req('POST', f'/api/transit/routes/{route["id"]}/driver-links?reset={b["id"]}')
    status, _ = public.req('GET', f'/api/transit/driver/{old}')
    check('a new link invalidates the old one', status == 404, status)

    # outbound and return: the return starts at the terminal with its own departures and minutes
    d = admin.req('POST', '/api/devices', {'name': f'Bus D {suffix}', 'uniqueId': f'busD-{suffix}'})[1]
    outbound = [(-12.120, -77.050), (-12.120, -77.040), (-12.120, -77.030)]
    back = [(-12.1218, -77.030), (-12.1218, -77.040)]
    names = ['Plaza Oeste', 'Centro', 'Terminal Este', 'Terminal Este (vuelta)', 'Centro (vuelta)']
    two_path = [list(outbound[0]), list(outbound[2]), list(back[0]), [-12.1218, -77.050]]
    trace = [(-12.1212, -77.050), (-12.1206, -77.050)] + [(-12.120, -77.050 + 0.0015 * i) for i in range(14)] + [(-12.1209, -77.030)] + [(-12.1218, -77.030 - 0.0015 * i) for i in range(10)]
    start = time.time() - 6 * 3600
    moment = lambda i: start + i * 60  # noqa: E731
    pass_terminal = moment(17)  # first return position, at the return terminal
    hhmm = lambda seconds: time.strftime('%H:%M', time.gmtime(seconds))  # noqa: E731
    two = {'name': f'Línea 40 {suffix}', 'code': '40', 'color': '#2f9e5b', 'circular': False,
           'stops': [{'name': n, 'latitude': p[0], 'longitude': p[1]} for n, p in zip(names, outbound + back)],
           'path': two_path, 'schedule': {'departures': [hhmm(moment(2))], 'returnDepartures': [hhmm(pass_terminal - 180)]},
           'attributes': {'speedKmh': 20, 'returnStop': 3, 'timezone': 'UTC'}, 'deviceIds': [d['id']]}
    status, line2 = admin.req('POST', '/api/transit/routes', two)
    check('line with outbound and return created', status == 200 and line2['attributes'].get('returnStop') == 3, line2)
    for i, (lat, lon) in enumerate(trace):
        send(d['uniqueId'], moment(i), lat, lon, 20)
        time.sleep(0.12)
    # hours later (next shift) the bus is seen again mid outbound: no delay against the trip of the morning
    for k, lon in enumerate((-77.0435, -77.0415, -77.0395, -77.0375)):
        send(d['uniqueId'], time.time() - 600 + k * 60, -12.120, lon, 20)
        time.sleep(0.15)
    time.sleep(6)
    status, live2 = admin.req('GET', f'/api/transit/routes/{line2["id"]}/live')
    stops2 = live2.get('stops', [])
    ud = next((unit for unit in live2.get('units', []) if unit['deviceId'] == d['id']), {})
    check('stops by direction, the return starts at minute 0', [stop['direction'] for stop in stops2] == ['outbound'] * 3 + ['return'] * 2
          and stops2[3]['minutes'] == 0 and abs(stops2[4]['minutes'] - 3.3) < 0.3 and live2['summary']['returnStop'] == 3,
          [(stop['direction'], stop['minutes']) for stop in stops2])
    check('unit back on the outbound after a break, without a stale trip', ud.get('direction') == 'outbound' and ud.get('delayMinutes') is None, ud)
    status, report2 = admin.req('GET', f'/api/transit/report?routeId={line2["id"]}&from={iso(start - 60)}&to={iso(time.time() + 60)}')
    by_stop = {stop['index']: stop for stop in report2.get('stops', [])}
    check('return delay against its own departure times', abs(by_stop.get(3, {}).get('averageDelayMinutes', 99) - 3) <= 1.1
          and abs(by_stop.get(0, {}).get('averageDelayMinutes', 99)) <= 1.1 and 1 < by_stop.get(1, {}).get('averageDelayMinutes', 0) < 10, {k: v.get('averageDelayMinutes') for k, v in by_stop.items()})
    admin.req('DELETE', f'/api/transit/routes/{line2["id"]}')
    admin.req('DELETE', f'/api/devices/{d["id"]}')

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
