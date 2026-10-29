#!/usr/bin/env python3
"""
Prueba de extremo a extremo de los servicios por unidad ("Añadir servicio"): planes por horómetro y por fecha con
aviso previo, servicio que queda vencido hasta registrarlo, servicio que se renueva solo al expirar, recordatorios sin
duplicados, unidad sin posiciones (vencimientos por fecha) y alerta de mantenimiento creada por el usuario.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_services.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402

DAY = 86400000
HOUR = 3600000


def main():
    api, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    loader = api.req('POST', '/api/devices', {'name': f'Cargador {suffix}', 'uniqueId': f'svc-loader-{suffix}'})[1]
    truck = api.req('POST', '/api/devices', {'name': f'Camión {suffix}', 'uniqueId': f'svc-truck-{suffix}'})[1]
    now = time.time()
    # the loader reports 1,240 engine hours
    send(f'svc-loader-{suffix}', now - 60, -12.05, -77.05, 0, hours=1240 * HOUR, ignition='true')
    deadline = time.time() + 20
    while time.time() < deadline:
        device = api.req('GET', f'/api/devices?id={loader["id"]}')[1][0]
        if device.get('positionId'):
            break
        time.sleep(1)

    def create(device, **plan):
        status, created = api.req('POST', '/api/maintenance', plan)
        api.req('POST', '/api/permissions', {'deviceId': device['id'], 'maintenanceId': created['id']})
        return status, created

    now_ms = int(now * 1000)
    status, oil = create(loader, name='Aceite de motor', type='hours', start=1000 * HOUR, period=250 * HOUR,
                         attributes={'renew': False, 'notice': 25 * HOUR, 'emails': 'taller@example.com'})
    check('hours service created', status == 200 and oil['attributes']['renew'] is False, oil)
    status, soat = create(truck, name='SOAT', type='fixTime', start=now_ms - 355 * DAY, period=365 * DAY,
                          attributes={'renew': False, 'notice': 15 * DAY, 'description': 'Póliza 123'})
    check('date service created', status == 200, soat)
    status, grease = create(truck, name='Engrase', type='fixTime', start=now_ms - 40 * DAY, period=30 * DAY,
                            attributes={'renew': True, 'notice': 3 * DAY})
    check('renewing service created', status == 200, grease)

    status, data = api.req('GET', f'/api/maintenance-plans/status?deviceId={loader["id"]}&deviceId={truck["id"]}')
    items = {item['name']: item for item in data.get('items', [])}
    check('status lists all services', status == 200 and set(items) == {'Aceite de motor', 'SOAT', 'Engrase'}, items.keys())
    oil_status = items.get('Aceite de motor', {})
    check('hours service soon at 1,240 h', oil_status.get('state') == 'soon' and oil_status.get('next') == 1250 * HOUR,
          oil_status)
    check('extra e-mails reported', oil_status.get('emails') == 'taller@example.com', oil_status)
    soat_status = items.get('SOAT', {})
    check('date counts from today without positions', soat_status.get('state') == 'soon'
          and abs(soat_status.get('remaining', 0) - 10 * DAY) < HOUR, soat_status)
    check('description reported', soat_status.get('description') == 'Póliza 123', soat_status)
    grease_status = items.get('Engrase', {})
    check('renewing service rolled to next cycle', grease_status.get('state') == 'ok'
          and grease_status.get('expired') == now_ms - 10 * DAY and grease_status.get('renew') is True, grease_status)

    status, result = api.req('POST', '/api/maintenance-plans/check')
    check('reminder check runs', status == 200, result)
    status, events = api.req('GET', f'/api/reports/events?deviceId={loader["id"]}&deviceId={truck["id"]}'
                                    f'&type=maintenance&from={iso(now - 3600)}&to={iso(time.time() + 60)}')
    states = sorted((event['attributes'].get('name'), event['attributes'].get('state')) for event in events)
    check('reminders raised once per service', states == [('Aceite de motor', 'soon'), ('Engrase', 'overdue'),
                                                         ('SOAT', 'soon')], states)
    api.req('POST', '/api/maintenance-plans/check')
    status, again = api.req('GET', f'/api/reports/events?deviceId={loader["id"]}&deviceId={truck["id"]}'
                                   f'&type=maintenance&from={iso(now - 3600)}&to={iso(time.time() + 60)}')
    check('no duplicate reminders', len(again) == len(events), len(again))

    # the loader goes past due: it stays overdue (no renew) until the service is registered
    send(f'svc-loader-{suffix}', time.time(), -12.05, -77.05, 0, hours=1300 * HOUR, ignition='true')
    deadline = time.time() + 20
    oil_status = {}
    while time.time() < deadline:
        data = api.req('GET', f'/api/maintenance-plans/status?deviceId={loader["id"]}')[1]
        oil_status = data['items'][0]
        if oil_status['current'] >= 1300 * HOUR:
            break
        time.sleep(1)
    check('without renew it stays overdue', oil_status.get('state') == 'overdue'
          and oil_status.get('next') == 1250 * HOUR, oil_status)
    status, record = api.req('POST', '/api/maintenance-plans/records', {
        'deviceId': loader['id'], 'maintenanceId': oil['id'], 'serviceTime': iso(time.time()), 'hours': 1300 * HOUR,
        'cost': 0, 'attributes': {}})
    check('service registered', status == 200, record)
    oil_status = api.req('GET', f'/api/maintenance-plans/status?deviceId={loader["id"]}')[1]['items'][0]
    check('service restarts the cycle', oil_status.get('state') == 'ok' and oil_status.get('next') == 1550 * HOUR,
          oil_status)

    # the alert the dialog sets up: maintenance events for every unit through the web channel
    status, notification = api.req('POST', '/api/notifications', {
        'type': 'maintenance', 'always': True, 'notificators': 'web', 'attributes': {}})
    check('maintenance alert created', status == 200 and notification.get('always'), notification)

    for plan in (oil, soat, grease):
        api.req('DELETE', f'/api/maintenance/{plan["id"]}')
    api.req('DELETE', f'/api/notifications/{notification.get("id")}')
    for device in (loader, truck):
        api.req('DELETE', f'/api/devices/{device["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
