#!/usr/bin/env python3
"""
Prueba de extremo a extremo de logística: pedidos (entrega, recojo, servicio), planificación automática con varias
unidades (capacidad, ventanas, almacén), pedidos que no entran con su motivo, creación de viajes, órdenes de servicio
con lista de verificación, escaneo de bultos, cobro contra entrega, varias fotos, entrega fuera del punto, aviso de
cercanía, calificación del cliente, reprogramación de pedidos fallidos, liberación al borrar un viaje y reporte.

Uso (servidor con osmand.port=5055 y media.path): TRACCAR_URL=http://127.0.0.1:8082 python3 test_logistics.py
"""
import base64
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402

PNG = 'data:image/png;base64,' + base64.b64encode(bytes.fromhex(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000'
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082')).decode()


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    now = time.time()
    devices = [admin.req('POST', '/api/devices', {'name': f'Furgón {i} {suffix}', 'uniqueId': f'log{i}-{suffix}'})[1] for i in (1, 2)]
    status, depot = admin.req('POST', '/api/geofences', {'name': f'Almacén {suffix}', 'area': 'CIRCLE (-12.0500 -77.1200, 150)', 'attributes': {'dispatchDepot': True}})
    orders = [
        {'code': 'P-1', 'name': 'Bodega Norte', 'latitude': -12.040, 'longitude': -77.060, 'weight': 200, 'codAmount': 150.5, 'packages': 'PK1,PK2', 'phone': '+51900000001'},
        {'code': 'P-2', 'name': 'Farmacia Centro', 'latitude': -12.060, 'longitude': -77.040, 'weight': 150, 'phone': '+51900000002'},
        {'code': 'S-1', 'type': 'service', 'name': 'Instalación GPS Cliente', 'latitude': -12.090, 'longitude': -77.030, 'weight': 5,
         'checklist': 'Revisar batería\nInstalar equipo\nProbar señal', 'serviceMinutes': 45},
        {'code': 'R-1', 'type': 'pickup', 'name': 'Recojo devoluciones', 'latitude': -12.100, 'longitude': -77.000, 'weight': 100, 'priority': 1, 'phone': '+51900000003'},
        {'code': 'P-3', 'name': 'Carga pesada', 'latitude': -12.070, 'longitude': -77.050, 'weight': 900},
        {'code': 'P-4', 'name': 'Ventana imposible', 'latitude': -12.080, 'longitude': -77.020, 'weight': 10,
         'windowStart': iso(now - 7200), 'windowEnd': iso(now - 3600)},
    ]
    status, created = admin.req('POST', '/api/dispatch/orders', orders)
    check('orders created in the pool', status == 200 and len(created) == 6 and all(o['status'] == 'unassigned' for o in created)
          and created[2]['serviceMinutes'] == 45 and created[0]['serviceMinutes'] == 10, created if status != 200 else '')
    status, _ = admin.req('POST', '/api/dispatch/orders', [{'name': 'Sin coordenadas'}])
    check('order without coordinates rejected', status == 400, status)
    ids = {o['code']: o['id'] for o in created}
    status, pool = admin.req('GET', '/api/dispatch/orders?status=unassigned')
    check('pool lists them', status == 200 and set(ids.values()) <= {o['id'] for o in pool}, status)
    status, depots = admin.req('GET', '/api/dispatch/depots')
    check('depots from geofences, marked first', status == 200 and depots[0]['depot'] is True and abs(depots[0]['latitude'] + 12.05) < 1e-6, depots[:1])

    shift = {'shiftStart': iso(now), 'shiftEnd': iso(now + 9 * 3600)}
    body = {'orderIds': list(ids.values()), 'depotId': depot['id'], 'speedKmh': 30,
            'vehicles': [{'deviceId': devices[0]['id'], 'capacityWeight': 400, **shift}, {'deviceId': devices[1]['id'], 'capacityWeight': 400, **shift}]}
    status, plan = admin.req('POST', '/api/dispatch/plan', body)
    unassigned = {item['orderId']: item['reason'] for item in plan.get('unassigned', [])} if status == 200 else {}
    planned = [order for route in plan.get('routes', []) for order in route['orderIds']] if status == 200 else []
    check('plan respects capacity and windows', status == 200 and unassigned.get(ids['P-3']) == 'capacity' and unassigned.get(ids['P-4']) == 'window'
          and sorted(planned) == sorted([ids['P-1'], ids['P-2'], ids['S-1'], ids['R-1']])
          and all(route['weight'] <= 400 for route in plan['routes']), (unassigned, plan.get('routes') and [(r['deviceName'], r['weight']) for r in plan['routes']]))
    check('routes with arrival times, distance and return to depot', all(route['visits'][0]['arrival'] and route['distanceKm'] > 0 and route['returnToDepot']
                                                                        for route in plan['routes']), status)

    commit = {'plannedStart': iso(now), 'routes': [{**route, 'driverName': f'Chofer {i}', 'depot': route['startPoint']} for i, route in enumerate(plan['routes'])]}
    status, trips = admin.req('POST', '/api/dispatch/plan/commit', commit)
    check('trips created from the plan', status == 200 and len(trips) == len(plan['routes']) and sum(len(t['stops']) for t in trips) == 4, status)
    status, _ = admin.req('POST', '/api/dispatch/plan/commit', commit)
    check('orders cannot be planned twice', status == 400, status)
    stops = {stop['attributes'].get('orderCode'): (trip, stop) for trip in trips for stop in trip['stops']}
    status, order = admin.req('GET', '/api/dispatch/orders?status=assigned')
    check('orders become assigned', status == 200 and {ids['P-1'], ids['S-1']} <= {o['id'] for o in order}, status)
    p1_trip, p1 = stops['P-1']
    check('stop carries order details', p1['attributes']['codAmount'] == 150.5 and p1['attributes']['packages'] == 'PK1,PK2'
          and stops['S-1'][1]['attributes']['type'] == 'service' and stops['S-1'][1]['attributes']['serviceMinutes'] == 45, p1['attributes'])

    anonymous = Client()
    status, result = anonymous.req('POST', f'/api/dispatch/driver/{p1_trip["driverToken"]}/stops/{p1["id"]}', {
        'status': 'delivered', 'recipient': 'Juan', 'scanned': ['PK1', 'PK2'], 'codCollected': 150.5, 'codMethod': 'yape',
        'photos': [PNG, PNG], 'latitude': -12.050, 'longitude': -77.060})
    done = next((s for s in result.get('stops', []) if s['id'] == p1['id']), {}) if status == 200 else {}
    attributes = done.get('attributes', {})
    check('delivery with packages, cash and two photos', status == 200 and attributes.get('scanned') == 'PK1,PK2' and attributes.get('codCollected') == 150.5
          and attributes.get('codMethod') == 'yape' and len(attributes.get('photos', '').split(',')) == 2, attributes)
    check('delivery far from the address is flagged', attributes.get('outOfPoint') is True and attributes.get('proofDistance', 0) > 1000, attributes.get('proofDistance'))
    from test_dashcam import BASE
    import urllib.request
    response = admin.opener.open(urllib.request.Request(f'{BASE}/api/dispatch/stops/{p1["id"]}/photos/1'))
    check('second photo available', response.status == 200 and response.read().startswith(b'\x89PNG'), response.status)
    status, delivered = admin.req('GET', '/api/dispatch/orders?status=delivered')
    check('order delivered', any(o['id'] == ids['P-1'] for o in delivered), status)

    s1_trip, s1 = stops['S-1']
    status, result = anonymous.req('POST', f'/api/dispatch/driver/{s1_trip["driverToken"]}/stops/{s1["id"]}', {
        'status': 'delivered', 'checklist': ['Revisar batería', 'Instalar equipo', 'Probar señal'], 'photos': [PNG]})
    service = next((s for s in result.get('stops', []) if s['id'] == s1['id']), {}) if status == 200 else {}
    check('service order completed with checklist', service.get('attributes', {}).get('checklistDone', '').count('\n') == 2, service.get('attributes'))

    status, tracking = anonymous.req('GET', f'/api/dispatch/track/{stops["P-2"][1]["trackingToken"]}')
    check('cannot rate before delivery', tracking.get('canRate') is False, tracking)
    status, _ = anonymous.req('POST', f'/api/dispatch/track/{stops["P-2"][1]["trackingToken"]}/rating', {'rating': 5})
    check('rating rejected before delivery', status == 400, status)
    status, tracking = anonymous.req('POST', f'/api/dispatch/track/{p1["trackingToken"]}/rating', {'rating': 4, 'comment': 'Puntual'})
    check('customer rates the delivery', status == 200 and tracking['rating'] == 4 and tracking['canRate'] is False and tracking['orderCode'] == 'P-1', tracking)
    status, _ = anonymous.req('POST', f'/api/dispatch/track/{p1["trackingToken"]}/rating', {'rating': 1})
    check('only one rating', status == 400, status)

    p2_trip, p2 = stops['P-2']
    device = next(d for d in devices if d['id'] == p2_trip['deviceId'])
    pending = [s for s in admin.req('GET', f'/api/dispatch/trips/{p2_trip["id"]}')[1]['stops'] if s['status'] == 'pending']
    target = pending[0]
    admin.req('POST', f'/api/dispatch/trips/{p2_trip["id"]}/start')
    send(device['uniqueId'], now, target['latitude'] + 0.008, target['longitude'], 30)
    deadline = time.time() + 15
    near = False
    while time.time() < deadline and not near:
        stop = next(s for s in admin.req('GET', f'/api/dispatch/trips/{p2_trip["id"]}')[1]['stops'] if s['id'] == target['id'])
        near = stop['attributes'].get('notifiedNear') is True
        time.sleep(1)
    check('customer notified when the unit is a few minutes away', near, target['name'])

    status, _ = admin.req('POST', f'/api/dispatch/stops/{p2["id"]}/status', {'status': 'failed', 'failureReason': 'Local cerrado'})
    status, failed = admin.req('GET', '/api/dispatch/orders?status=failed')
    check('failed delivery marks the order failed', any(o['id'] == ids['P-2'] for o in failed), status)
    tomorrow = iso(now + 86400)
    status, order = admin.req('POST', f'/api/dispatch/orders/{ids["P-2"]}/reschedule', {'plannedDate': tomorrow})
    check('failed order rescheduled to the pool', status == 200 and order['status'] == 'unassigned' and order['tripId'] == 0 and order['attributes'].get('attempts') == 1, order)
    status, _ = admin.req('POST', f'/api/dispatch/orders/{ids["P-1"]}/reschedule', {})
    check('delivered orders cannot be rescheduled', status == 400, status)

    status, report = admin.req('GET', f'/api/dispatch/report?from={iso(now - 3600)}&to={iso(now + 3600)}')
    summary = report.get('summary', {}) if status == 200 else {}
    check('report with cash, ratings and out of point', summary.get('codCollected', 0) >= 150.5 and summary.get('ratingAverage') is not None
          and summary.get('outOfPoint', 0) >= 1 and report['byType'].get('service', 0) >= 1 and summary.get('unassignedOrders', 0) >= 2, summary)

    r1_trip, r1 = stops['R-1']
    status, _ = admin.req('DELETE', f'/api/dispatch/trips/{r1_trip["id"]}')
    status, pool = admin.req('GET', '/api/dispatch/orders?status=unassigned')
    released = {o['id'] for o in pool}
    check('deleting a trip releases its pending orders', ids['R-1'] in released and ids['P-1'] not in released, status)

    password = 'Logi2026!'
    status, other = admin.req('POST', '/api/users', {'name': f'Ajeno {suffix}', 'email': f'logi-{suffix}@test', 'password': password, 'attributes': {'plan': 'pro'}})
    outsider, _ = login(f'logi-{suffix}@test', password)
    status, foreign = outsider.req('GET', '/api/dispatch/orders')
    check('other accounts do not see the orders', status == 200 and not set(ids.values()) & {o['id'] for o in foreign}, status)
    status, _ = outsider.req('POST', f'/api/dispatch/orders/{ids["P-3"]}/cancel')
    check('other accounts cannot change them', status == 404, status)
    status, order = admin.req('POST', f'/api/dispatch/orders/{ids["P-3"]}/cancel')
    check('order cancelled', status == 200 and order['status'] == 'cancelled', status)

    for trip in admin.req('GET', '/api/dispatch/trips')[1]:
        if trip['deviceId'] in (devices[0]['id'], devices[1]['id']):
            admin.req('DELETE', f'/api/dispatch/trips/{trip["id"]}')
    for order_id in ids.values():
        admin.req('DELETE', f'/api/dispatch/orders/{order_id}')
    admin.req('DELETE', f'/api/users/{other["id"]}')
    admin.req('DELETE', f'/api/geofences/{depot["id"]}')
    for device in devices:
        admin.req('DELETE', f'/api/devices/{device["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
