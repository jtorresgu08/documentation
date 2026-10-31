#!/usr/bin/env python3
"""
Prueba de extremo a extremo de despachos y entregas: viaje con paradas y ventanas, llegada detectada por GPS (inicia
el viaje), parada con retraso, enlace del conductor sin cuenta (entrega con foto, firma y receptor; entrega fallida
con motivo), enlace de seguimiento del cliente con hora estimada, cierre automático del viaje, eventos, reporte de
cumplimiento, permisos y módulo del plan.

Uso (servidor con osmand.port=5055 y media.path): TRACCAR_URL=http://127.0.0.1:8082 python3 test_dispatch.py
"""
import base64
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import BASE, Client, check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402

PNG = 'data:image/png;base64,' + base64.b64encode(bytes.fromhex(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000'
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082')).decode()


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    uid = f'dispatch-{suffix}'
    status, device = admin.req('POST', '/api/devices', {'name': f'Reparto {suffix}', 'uniqueId': uid})
    now = time.time()
    stops = [
        {'name': 'Bodega Surquillo', 'address': 'Av. Angamos 1200', 'contact': 'Rosa', 'phone': '+51987000001',
         'latitude': -12.1100, 'longitude': -77.0150, 'radius': 80, 'windowEnd': iso(now + 3600)},
        {'name': 'Farmacia San Borja', 'latitude': -12.1000, 'longitude': -77.0000, 'windowStart': iso(now - 600), 'windowEnd': iso(now + 7200)},
        {'name': 'Minimarket Ate', 'latitude': -12.0500, 'longitude': -76.9500, 'windowEnd': iso(now - 600)},
    ]
    status, _ = admin.req('POST', '/api/dispatch/trips', {'name': 'Sin paradas', 'deviceId': device['id'], 'stops': []})
    check('trip without stops rejected', status == 400, status)
    status, _ = admin.req('POST', '/api/dispatch/trips', {'name': 'Mala', 'deviceId': device['id'], 'stops': [{'name': 'X', 'latitude': 95, 'longitude': 0}]})
    check('invalid coordinates rejected', status == 400, status)
    status, trip = admin.req('POST', '/api/dispatch/trips', {'name': f'Ruta mañana {suffix}', 'deviceId': device['id'], 'driverName': 'Carlos Quispe',
                                                            'driverPhone': '+51911111111', 'plannedStart': iso(now - 300), 'stops': stops})
    check('trip created', status == 200 and trip['status'] == 'planned' and len(trip['stops']) == 3 and trip['progress']['pending'] == 3
          and all(stop['trackingToken'] for stop in trip['stops']) and trip['driverToken'], trip if status != 200 else trip['progress'])
    first, second, third = trip['stops']
    check('stops ordered with default radius', [stop['sequence'] for stop in trip['stops']] == [1, 2, 3] and second['radius'] == 100, [s['radius'] for s in trip['stops']])

    send(uid, now - 120, -12.1300, -77.0300, 35)
    time.sleep(1.5)
    send(uid, now - 60, -12.11002, -77.01503, 5)
    deadline = time.time() + 15
    while time.time() < deadline:
        status, trip = admin.req('GET', f'/api/dispatch/trips/{trip["id"]}')
        if trip['stops'][0]['status'] == 'arrived':
            break
        time.sleep(1)
    check('arrival detected by GPS starts the trip', trip['status'] == 'inProgress' and trip['stops'][0]['status'] == 'arrived'
          and trip['stops'][0]['arrivalTime'], (trip['status'], trip['stops'][0]['status']))
    check('missed window marks the stop late', trip['stops'][2]['late'] is True and trip['progress']['late'] == 1, trip['progress'])
    check('estimated arrival for pending stops', trip['stops'][1]['eta'] is not None and trip['stops'][2]['eta'] is not None
          and trip['stops'][2]['atRisk'] is True and 'position' in trip, [s.get('eta') for s in trip['stops']])
    status, events = admin.req('GET', f'/api/reports/events?deviceId={device["id"]}&from={iso(now - 3600)}&to={iso(time.time() + 60)}')
    types = sorted(event['type'] for event in events) if status == 200 else events
    check('arrival and late events', 'dispatchArrival' in types and 'dispatchLate' in types, types)

    anonymous = Client()
    token = trip['driverToken']
    status, driver = anonymous.req('GET', f'/api/dispatch/driver/{token}')
    check('driver link without account', status == 200 and len(driver['stops']) == 3 and 'trackingToken' not in driver['stops'][0]
          and 'driverToken' not in driver, status)
    status, _ = anonymous.req('GET', '/api/dispatch/driver/token-que-no-existe-123')
    check('unknown driver link', status == 404, status)
    status, driver = anonymous.req('POST', f'/api/dispatch/driver/{token}/stops/{first["id"]}',
                                   {'status': 'delivered', 'recipient': 'Rosa Huamán', 'photo': PNG, 'signature': PNG, 'latitude': -12.11001, 'longitude': -77.01501})
    delivered = driver['stops'][0] if status == 200 else {}
    check('driver delivers with photo, signature and recipient', status == 200 and delivered.get('status') == 'delivered'
          and delivered.get('recipient') == 'Rosa Huamán' and delivered.get('completedTime') and delivered.get('proofLatitude') == -12.11001, delivered)
    status, _ = anonymous.req('POST', f'/api/dispatch/driver/{token}/stops/{first["id"]}', {'status': 'skipped'})
    check('driver cannot use other statuses', status == 400, status)
    response = admin.opener.open(urllib.request.Request(f'{BASE}/api/dispatch/stops/{first["id"]}/photo'))
    content = response.read()
    status = response.status if content.startswith(b'\x89PNG') else 0
    check('proof photo stored', status == 200, status)

    status, tracking = anonymous.req('GET', f'/api/dispatch/track/{second["trackingToken"]}')
    check('customer tracking with ETA and vehicle', status == 200 and tracking['name'] == 'Farmacia San Borja' and tracking['eta']
          and tracking['stopsBefore'] == 0 and 'position' in tracking and tracking['driverName'] == 'Carlos' and 'phone' not in tracking, tracking)
    status, _ = anonymous.req('GET', '/api/dispatch/track/otro-token-inexistente-1')
    check('unknown tracking link', status == 404, status)

    status, driver = anonymous.req('POST', f'/api/dispatch/driver/{token}/stops/{second["id"]}', {'status': 'failed', 'failureReason': 'Cliente ausente'})
    check('failed delivery with reason', status == 200 and driver['stops'][1]['status'] == 'failed' and driver['stops'][1]['failureReason'] == 'Cliente ausente', status)
    status, trip = admin.req('POST', f'/api/dispatch/stops/{third["id"]}/status', {'status': 'skipped', 'notes': 'Reprogramado'})
    check('last stop closes the trip', status == 200 and trip['status'] == 'completed' and trip['endTime'], trip.get('status') if status == 200 else trip)
    status, tracking = anonymous.req('GET', f'/api/dispatch/track/{first["trackingToken"]}')
    check('customer sees the delivery', tracking['status'] == 'delivered' and tracking['recipient'] == 'Rosa Huamán' and 'position' not in tracking, tracking)
    time.sleep(1)
    status, events = admin.req('GET', f'/api/reports/events?deviceId={device["id"]}&from={iso(now - 3600)}&to={iso(time.time() + 60)}')
    types = sorted(event['type'] for event in events) if status == 200 else events
    check('delivered and failed events', 'dispatchDelivered' in types and 'dispatchFailed' in types, types)

    status, report = admin.req('GET', f'/api/dispatch/report?from={iso(now - 3600)}&to={iso(now + 3600)}')
    mine = [item for item in report.get('trips', []) if item['id'] == trip['id']] if status == 200 else []
    summary = report.get('summary', {}) if status == 200 else {}
    check('compliance report', len(mine) == 1 and summary.get('delivered', 0) >= 1 and summary.get('failed', 0) >= 1 and summary.get('late', 0) >= 1
          and any(item['name'] == f'Reparto {suffix}' for item in report['byUnit']) and report['reasons'].get('Cliente ausente', 0) >= 1, summary)

    # editing keeps the progress of existing stops
    status, trip = admin.req('POST', f'/api/dispatch/trips/{trip["id"]}/reopen')
    body = {**trip, 'stops': trip['stops'] + [{'name': 'Parada extra', 'latitude': -12.06, 'longitude': -77.03}]}
    status, edited = admin.req('PUT', f'/api/dispatch/trips/{trip["id"]}', body)
    check('edit keeps delivered stops and adds new ones', status == 200 and len(edited['stops']) == 4 and edited['stops'][0]['status'] == 'delivered'
          and edited['stops'][3]['status'] == 'pending', status)

    password = 'Disp2026!'
    status, other = admin.req('POST', '/api/users', {'name': f'Ajeno {suffix}', 'email': f'ajeno-{suffix}@test', 'password': password, 'attributes': {'plan': 'pro'}})
    outsider, _ = login(f'ajeno-{suffix}@test', password)
    status, _ = outsider.req('GET', f'/api/dispatch/trips/{trip["id"]}')
    check('users without the unit cannot see the trip', status in (400, 401, 403, 404), status)
    status, listing = outsider.req('GET', '/api/dispatch/trips')
    check('trip list only shows own units', status == 200 and not any(item['id'] == trip['id'] for item in listing), status)
    other['attributes']['plan'] = 'basic'
    admin.req('PUT', f'/api/users/{other["id"]}', other)
    basic, _ = login(f'ajeno-{suffix}@test', password)
    status, _ = basic.req('GET', '/api/dispatch/trips')
    check('dispatch module outside the plan', status == 403, status)

    status, _ = admin.req('DELETE', f'/api/dispatch/trips/{trip["id"]}')
    check('trip deleted', status == 204, status)
    admin.req('DELETE', f'/api/users/{other["id"]}')
    admin.req('DELETE', f'/api/devices/{device["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
