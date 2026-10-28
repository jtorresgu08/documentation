#!/usr/bin/env python3
"""
Prueba de extremo a extremo de:
  - grabaciones de la MDVR (JT/T 1078): consulta 0x9205/0x1205, reproducción 0x9201 y control 0x9202
  - puntaje de conducción (frenadas, aceleraciones, curvas y excesos calculados del GPS)
  - gastos por unidad (CRUD, resumen con costo por km, permisos) y próximos mantenimientos

Requiere en traccar.xml:  osmand.port=5055  y  huabao.videoServer=127.0.0.1:7611
Uso: TRACCAR_URL=http://127.0.0.1:8082 python3 test_video_driving_expenses.py
"""
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dashcam_simulator import Dashcam  # noqa: E402
from test_dashcam import Client, check, results, wait_for  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
JT808_PORT = int(os.environ.get('JT808_PORT', '5015'))
OSMAND_PORT = int(os.environ.get('OSMAND_PORT', '5055'))
PHONE = '013900001078'
DRIVER_ID = 'DRV-SCORE-1'


def iso(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def osmand(unique_id, moment, lat, lon, speed_kmh, course=90, **extra):
    query = urllib.parse.urlencode({
        'id': unique_id, 'timestamp': int(moment), 'lat': f'{lat:.6f}', 'lon': f'{lon:.6f}',
        'speed': speed_kmh / 1.852, 'bearing': course, **extra})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    opener.open(f'http://{HOST}:{OSMAND_PORT}/?{query}').read()


def login(api, email, password, name='admin'):
    status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    if status != 200:
        api.req('POST', '/api/users', {'name': name, 'email': email, 'password': password})
        status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    return status


def device(api, name, unique_id, **extra):
    status, items = api.req('GET', '/api/devices?uniqueId=' + unique_id)
    if items:
        return items[0]
    return api.req('POST', '/api/devices', {'name': name, 'uniqueId': unique_id, **extra})[1]


def test_playback(api):
    unit = device(api, 'MDVR Bus 12', PHONE, model='JT1078')
    now = time.time()
    query = f"deviceId={unit['id']}&channel=0&from={iso(now - 6 * 3600)}&to={iso(now)}"
    status, body = api.req('GET', '/api/video/recordings?' + query)
    check('offline MDVR answers 409', status == 409 and 'offline' in str(body), (status, body))

    cam = Dashcam(HOST, JT808_PORT, PHONE)
    cam.log = lambda *args: None
    cam.register()
    cam.report()
    cam.start_command_listener(None)
    wait_for(lambda: api.req('GET', f"/api/positions?deviceId={unit['id']}")[1])

    status, items = api.req('GET', '/api/video/recordings?' + query)
    check('recordings listed for all channels', status == 200 and len(items) == 8, (status, items))
    if status != 200:
        return
    alarms = [item for item in items if item['alarm']]
    check('alarm recording flagged', len(alarms) == 1 and alarms[0]['channel'] == 2, alarms)
    first = min(items, key=lambda item: item['start'])
    expected = (now - 3 * 3600) * 1000
    check('recording times converted from device timezone', abs(first['start'] - expected) < 120000,
          (first['start'], expected))
    check('recording size reported', first['size'] == 512 * 1024 * 1024, first)

    status, items = api.req('GET', f"/api/video/recordings?deviceId={unit['id']}&channel=3"
                                   f"&from={iso(now - 6 * 3600)}&to={iso(now)}")
    check('channel filter', status == 200 and {item['channel'] for item in items} == {3}, items)

    recording = items[-1]
    seek_from = recording['start'] + 10 * 60 * 1000

    def send(kind, attributes):
        return api.req('POST', '/api/commands/send', {'deviceId': unit['id'], 'type': kind, 'attributes': attributes})[0]

    status = send('videoPlayback', {'index': 3, 'from': seek_from, 'to': recording['end'], 'speed': 4})
    check('playback command accepted', status in (200, 202), status)
    request = wait_for(lambda: cam.playback_requests and cam.playback_requests[-1], 10)
    check('playback sent to video server', request and request['ip'] == '127.0.0.1' and request['port'] == 7611,
          request)
    if request:
        device_start = datetime.fromtimestamp(seek_from / 1000, timezone.utc).replace(tzinfo=None)
        delta = abs((request['start'] - device_start).total_seconds() - 8 * 3600)
        check('playback channel, speed and start time', request['channel'] == 3 and request['speed'] == 3
              and delta < 2, (request, device_start))

    send('videoPlaybackControl', {'index': 3, 'control': 1})
    send('videoPlaybackControl', {'index': 3, 'control': 5, 'seek': seek_from + 60000})
    send('videoPlaybackControl', {'index': 3, 'control': 2})
    controls = wait_for(lambda: len(cam.playback_controls) >= 3 and cam.playback_controls, 10) or []
    check('pause, seek and stop reach the MDVR', [c['control'] for c in controls[:3]] == [1, 5, 2], controls)
    check('seek time sent', len(controls) >= 2 and controls[1]['seek'] is not None, controls)
    cam.close()


def test_driving(api):
    unit = device(api, 'Camión Score', 'score-001')
    driver = api.req('GET', '/api/drivers')[1]
    if not [d for d in driver if d['uniqueId'] == DRIVER_ID]:
        api.req('POST', '/api/drivers', {'name': 'Juan Pérez', 'uniqueId': DRIVER_ID})
    start = int(time.time()) - 2 * 3600
    lat, lon = -12.05, -77.05
    moment = start
    speeds = []
    # 2 min cruising at 60, harsh acceleration 20 -> 50, harsh braking 70 -> 30, a sharp turn and 60 s at 120
    speeds += [60] * 120
    speeds += [20, 30, 40, 50] + [50] * 30
    speeds += [70, 70, 55, 42, 30] + [30] * 30
    speeds += [60] * 60
    speeds += [120] * 60 + [60] * 60
    course = 90
    for index, speed in enumerate(speeds):
        if index == 220:
            course = 180  # 90° turn at 60 km/h in one second: ~16 m/s² lateral
        rad = course * math.pi / 180
        step = speed / 3.6 / 111320
        lat += step * math.cos(rad)
        lon += step * math.sin(rad)
        osmand('score-001', moment, lat, lon, speed, course, driverUniqueId=DRIVER_ID)
        moment += 1
    query = f"deviceId={unit['id']}&from={iso(start - 60)}&to={iso(moment + 60)}&details=true"
    report = wait_for(lambda: (r := api.req('GET', '/api/driving/score?' + query))[0] == 200
                      and r[1]['devices'] and r[1]['devices'][0]['drivingTime'] >= (len(speeds) - 2) * 1000 and r[1], 60)
    check('driving score computed', bool(report), report)
    if not report:
        return
    item = report['devices'][0]
    counts = item['counts']
    check('harsh acceleration detected', counts.get('acceleration', 0) >= 1, counts)
    check('harsh braking detected', counts.get('braking', 0) >= 1, counts)
    check('harsh cornering detected', counts.get('cornering', 0) >= 1, counts)
    check('speeding detected', counts.get('speeding', 0) == 1 and item['speedingTime'] >= 50000, item)
    check('score below 100 with rating', item['score'] < 100 and item['rating'] in (
        'excellent', 'good', 'regular', 'risky'), item)
    check('incidents with location', item['incidents'] and all(
        'latitude' in incident for incident in item['incidents']), item['incidents'][:2])
    check('max speed', abs(item['maxSpeed'] - 120) <= 1, item['maxSpeed'])
    drivers = report['drivers']
    check('score per driver', drivers and drivers[0]['driverUniqueId'] == DRIVER_ID
          and drivers[0]['name'] == 'Juan Pérez', drivers)
    status, _ = api.req('GET', f"/api/driving/score?deviceId={unit['id']}&from={iso(start - 40 * 86400)}&to={iso(moment)}")
    check('period limited to 31 days', status == 400, status)
    return unit


def test_expenses(api, unit):
    now = time.time()
    status, stale = api.req('GET', f"/api/expenses?deviceId={unit['id']}&from={iso(now - 300 * 86400)}&to={iso(now + 86400)}")
    for item in stale if status == 200 else []:
        api.req('DELETE', f"/api/expenses/{item['id']}")
    created = []
    for kind, amount, quantity, days in [('fuel', 300, 20, 2), ('fuel', 450, 30, 40), ('toll', 25.5, 0, 1),
                                         ('maintenance', 380, 0, 3)]:
        status, item = api.req('POST', '/api/expenses', {
            'deviceId': unit['id'], 'type': kind, 'amount': amount, 'quantity': quantity,
            'expenseTime': iso(now - days * 86400), 'vendor': 'Grifo Central', 'attributes': {}})
        created.append(item)
    check('expenses created', all(isinstance(item, dict) and item.get('id') for item in created), created)
    status, _ = api.req('POST', '/api/expenses', {'deviceId': unit['id'], 'type': 'fuel', 'amount': -5,
                                                  'expenseTime': iso(now)})
    check('negative amount rejected', status == 400, status)

    period = f"deviceId={unit['id']}&from={iso(now - 30 * 86400)}&to={iso(now + 60)}"
    status, items = api.req('GET', '/api/expenses?' + period)
    check('list filtered by period', status == 200 and len(items) == 3, items)
    check('list newest first', status == 200 and items[0]['type'] == 'toll', items)

    status, summary = api.req('GET', '/api/expenses/summary?' + period)
    check('summary total', status == 200 and abs(summary['total'] - 705.5) < 0.01, summary)
    check('summary by type', summary['byType'] == {'fuel': 300, 'maintenance': 380, 'toll': 25.5}, summary['byType'])
    check('fuel price per litre', abs(summary['fuelPricePerLitre'] - 15) < 0.01, summary)
    check('distance and cost per km', summary['distance'] > 5 and summary['costPerKm']
          and abs(summary['costPerKm'] * summary['distance'] / 705.5 - 1) < 0.01, summary)

    edited = dict(created[2], amount=30)
    status, item = api.req('PUT', f"/api/expenses/{created[2]['id']}", edited)
    check('expense updated', status == 200 and item['amount'] == 30, item)
    status, _ = api.req('DELETE', f"/api/expenses/{created[0]['id']}")
    check('expense deleted', status == 204, status)
    status, summary = api.req('GET', '/api/expenses/summary?' + period)
    check('summary after edit and delete', abs(summary['total'] - 410) < 0.01, summary)

    # upcoming maintenance: oil change every 5000 km from 0 assigned to the unit's group
    group = api.req('POST', '/api/groups', {'name': 'Flota score'})[1]
    unit['groupId'] = group['id']
    api.req('PUT', f"/api/devices/{unit['id']}", unit)
    maintenance = api.req('POST', '/api/maintenance', {'name': 'Cambio de aceite', 'type': 'totalDistance',
                                                       'start': 0, 'period': 5000000})[1]
    api.req('POST', '/api/permissions', {'groupId': group['id'], 'maintenanceId': maintenance['id']})
    status, upcoming = api.req('GET', f"/api/expenses/maintenance?deviceId={unit['id']}")
    entry = [item for item in upcoming or [] if item['maintenanceId'] == maintenance['id']]
    check('group maintenance listed for the unit', status == 200 and len(entry) == 1, upcoming)
    if entry:
        check('next service and remaining distance', entry[0]['next'] == 5000000
              and 0 < entry[0]['remaining'] < 5000000, entry[0])

    # another user without access to the unit
    api.req('POST', '/api/users', {'name': 'otro', 'email': 'otro@test', 'password': 'secret123'})
    other = Client()
    check('second user login', login(other, 'otro@test', 'secret123', 'otro') == 200)
    status_list, items = other.req('GET', f"/api/expenses?from={iso(now - 30 * 86400)}&to={iso(now + 60)}")
    check('other user sees no expenses', status_list == 200 and items == [], (status_list, items))
    status, _ = other.req('POST', '/api/expenses', {'deviceId': unit['id'], 'type': 'toll', 'amount': 5,
                                                    'expenseTime': iso(now)})
    check('other user cannot add to the unit', status in (400, 403), status)
    status, _ = other.req('DELETE', f"/api/expenses/{created[1]['id']}")
    check('other user cannot delete', status in (400, 403, 404), status)

    # readonly user with access cannot write
    users = api.req('GET', '/api/users')[1]
    user = [u for u in users if u['email'] == 'otro@test'][0]
    api.req('POST', '/api/permissions', {'userId': user['id'], 'deviceId': unit['id']})
    user['readonly'] = True
    api.req('PUT', f"/api/users/{user['id']}", user)
    status, items = other.req('GET', '/api/expenses?' + period)
    check('readonly user can read', status == 200 and len(items) == 2, (status, items))
    status, _ = other.req('POST', '/api/expenses', {'deviceId': unit['id'], 'type': 'toll', 'amount': 5,
                                                    'expenseTime': iso(now)})
    check('readonly user cannot add', status in (400, 403), status)


def main():
    api = Client()
    check('login', login(api, os.environ.get('ADMIN_EMAIL', 'admin@test'),
                         os.environ.get('ADMIN_PASSWORD', 'secret123')) == 200)
    test_playback(api)
    unit = test_driving(api)
    if unit:
        test_expenses(api, unit)
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
