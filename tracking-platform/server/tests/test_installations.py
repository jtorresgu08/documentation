#!/usr/bin/env python3
"""
Prueba de extremo a extremo de instalaciones y soporte: técnicos con enlace privado, inventario (alta, CSV,
reserva para una orden), órdenes de trabajo y agenda, panel del instalador (en camino, iniciar, IMEI y SIM,
checklist, fotos, prueba de señal, firma del cliente), equipo creado y asignado al cliente al cerrar, acta pública,
tickets de soporte con mensajes y notas internas, orden de visita desde un ticket y permisos.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_installations.py
"""
import base64
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402

# 1x1 JPEG
JPEG = 'data:image/jpeg;base64,' + base64.b64encode(bytes.fromhex(
    'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432'
    'ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1'
    '082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7'
    'a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd3ffd9')).decode()


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    password = 'Inst2026!'
    _, client_user = admin.req('POST', '/api/users', {'name': f'Transportes Instala {suffix}', 'email': f'inst-{suffix}@test', 'password': password, 'phone': '+51911222333'})

    status, tech = admin.req('POST', '/api/installations/technicians', {'name': f'Carlos Técnico {suffix}', 'phone': '+51999888777', 'color': '#2563c9'})
    check('technician with a private panel link', status == 200 and len(tech['token']) >= 20, tech)
    imei = f'86{suffix}123'[:15].ljust(15, '0')
    status, gps = admin.req('POST', '/api/installations/stock', {'type': 'gps', 'model': 'Teltonika FMC130', 'serial': imei, 'technicianId': tech['id']})
    check('tracker in the technician stock', status == 200 and gps['status'] == 'technician' and gps['technicianName'] == tech['name'], gps)
    status, _ = admin.req('POST', '/api/installations/stock', {'type': 'gps', 'serial': imei})
    check('duplicated serial rejected', status == 400, status)
    csv = f'tipo;modelo;serie\nrelay;Relé 12V;RL-{suffix}\ncamera;Jimi JC400;CAM-{suffix}\n;;\n'
    status, imported = admin.req('POST', '/api/installations/stock/import', {'csv': csv})
    check('stock CSV import', status == 200 and imported['created'] == 2 and len(imported['errors']) == 1, imported)
    _, stock = admin.req('GET', '/api/installations/stock')
    relay = next(i for i in stock if i['serial'] == f'RL-{suffix}')
    camera = next(i for i in stock if i['serial'] == f'CAM-{suffix}')

    tomorrow = time.time() + 86400
    order_body = {
        'type': 'installation', 'clientId': client_user['id'], 'contactName': 'Rosa Pérez', 'contactPhone': '+51911222333',
        'address': 'Av. Argentina 1234, Callao', 'latitude': -12.05, 'longitude': -77.11, 'technicianId': tech['id'],
        'scheduledAt': iso(tomorrow), 'duration': 90, 'plate': 'b7x-123', 'vehicle': 'Volvo FH 2020 blanco',
        'notes': 'Instalar GPS con corte de motor', 'itemIds': [relay['id'], camera['id']]}
    status, order = admin.req('POST', '/api/installations/orders', order_body)
    check('work order with client name and plate', status == 200 and order['clientName'] == client_user['name'] and order['plate'] == 'B7X-123' and order['status'] == 'scheduled', order)
    check('equipment reserved for the order', sorted(i['serial'] for i in order['items']) == sorted([f'RL-{suffix}', f'CAM-{suffix}']) and all(i['status'] == 'reserved' for i in order['items']), order['items'])
    status, _ = admin.req('POST', '/api/installations/orders', {**order_body, 'itemIds': [relay['id']]})
    check('reserved equipment cannot go to another order', status == 400, status)
    status, agenda = admin.req('GET', f'/api/installations/orders?from={iso(tomorrow - 3600)}&to={iso(tomorrow + 3600)}&technicianId={tech["id"]}')
    check('agenda of the technician for the day', status == 200 and [o['id'] for o in agenda] == [order['id']], agenda)

    field = Client()
    base = f'/api/installer/{tech["token"]}'
    status, panel = field.req('GET', base)
    check('installer panel without an account', status == 200 and panel['name'] == tech['name'] and any(o['id'] == order['id'] for o in panel['orders']) and any(s['serial'] == imei for s in panel['stock']), panel)
    status, _ = field.req('GET', '/api/installer/token-que-no-existe-123456')
    check('wrong link refused', status == 404, status)
    status, _ = field.req('POST', f'{base}/orders/{order["id"]}/status', {'status': 'enRoute'})
    status, detail = field.req('POST', f'{base}/orders/{order["id"]}/status', {'status': 'inProgress', 'latitude': -12.0501, 'longitude': -77.1102})
    check('on the way and started', status == 200 and detail['status'] == 'inProgress' and detail['enRouteAt'] and detail['startedAt'], detail)
    wrong = imei[:-3] + '999'
    status, typo = field.req('PUT', f'{base}/orders/{order["id"]}', {'uniqueId': wrong})
    check('the unit exists as soon as the IMEI is entered', status == 200 and typo['deviceId'] > 0, typo)
    wrong_device = typo['deviceId']
    _, foreign = admin.req('POST', '/api/devices', {'name': f'Ajena {suffix}', 'uniqueId': f'foreign-{suffix}'})
    _, foreign_owner = admin.req('POST', '/api/users', {'name': f'Dueño ajeno {suffix}', 'email': f'inst-f-{suffix}@test', 'password': password})
    admin.req('POST', '/api/permissions', {'userId': foreign_owner['id'], 'deviceId': foreign['id']})
    _, reseller_user = admin.req('POST', '/api/users', {'name': f'Distribuidor 2 {suffix}', 'email': f'inst-r-{suffix}@test', 'password': password, 'userLimit': 10, 'attributes': {'plan': 'reseller'}})
    reseller, _ = login(f'inst-r-{suffix}@test', password)
    _, reseller_tech = reseller.req('POST', '/api/installations/technicians', {'name': f'Técnico 2 {suffix}'})
    _, reseller_order = reseller.req('POST', '/api/installations/orders', {'clientName': 'Cliente X', 'technicianId': reseller_tech['id'], 'scheduledAt': iso(tomorrow)})
    reseller_base = f'/api/installer/{reseller_tech["token"]}/orders/{reseller_order["id"]}'
    field.req('POST', f'{reseller_base}/status', {'status': 'inProgress'})
    status, _ = field.req('PUT', reseller_base, {'uniqueId': foreign['uniqueId']})
    check('the IMEI of another account is refused', status == 400, status)
    status, detail = field.req('PUT', f'{base}/orders/{order["id"]}', {
        'uniqueId': imei, 'iccid': '8951 1000 0000 0000 001', 'odometer': '154320',
        'checklist': {'power': True, 'gpsFix': True, 'engineStop': True, 'wiring': True, 'hack': True}, 'techNotes': 'Instalado bajo el tablero'})
    check('IMEI, SIM, odometer and checklist saved', detail['uniqueId'] == imei and detail['iccid'] == '8951100000000000001' and detail['checklist'] == {'power': True, 'gpsFix': True, 'engineStop': True, 'wiring': True}, detail)
    for category in ('vehicle', 'device', 'wiring'):
        status, detail = field.req('POST', f'{base}/orders/{order["id"]}/photos', {'category': category, 'data': JPEG, 'latitude': -12.05, 'longitude': -77.11})
    check('three evidence photos', status == 200 and len([p for p in detail['photos'] if p['kind'] == 'photo']) == 3, detail.get('photos'))
    status, _ = field.req('POST', f'{base}/orders/{order["id"]}/photos', {'category': 'other', 'data': 'data:text/html;base64,PGgxPg=='})
    check('only images accepted', status == 400, status)
    photo = detail['photos'][0]
    status, raw = field.req('GET', f'{base}/orders/{order["id"]}/photos/{photo["id"]}', raw=True)
    check('photo served back', status == 200 and raw[:2] == b'\xff\xd8', status)
    field.req('POST', f'{base}/orders/{order["id"]}/photos', {'category': 'other', 'data': JPEG})
    _, detail = field.req('GET', f'{base}/orders/{order["id"]}')
    extra = detail['photos'][-1]
    status, detail = field.req('DELETE', f'{base}/orders/{order["id"]}/photos/{extra["id"]}')
    check('photo removed by the installer', status == 200 and len(detail['photos']) == 3, len(detail.get('photos', [])))

    _, devices_now = admin.req('GET', '/api/devices')
    check('the unit of the mistyped IMEI is removed when fixed', all(d['id'] != wrong_device for d in devices_now) and detail['deviceId'] not in (0, wrong_device), detail.get('deviceId'))
    status, signal = field.req('GET', f'{base}/orders/{order["id"]}/signal')
    check('signal test: unit registered, waiting for data', status == 200 and signal['known'] is True and signal['reporting'] is False, signal)
    send(imei, time.time(), -12.0502, -77.1101, 0, ignition='true', sat=11, power=12.6)
    for _ in range(20):
        _, signal = field.req('GET', f'{base}/orders/{order["id"]}/signal')
        if signal.get('position'):
            break
        time.sleep(0.5)
    check('signal test during the installation: reporting with satellites, ignition and voltage', signal['reporting'] is True and signal['position']['satellites'] == 11
          and signal['position']['ignition'] is True and abs(signal['position']['power'] - 12.6) < 0.01, signal)
    status, _ = field.req('POST', f'{base}/orders/{order["id"]}/complete', {'signatureName': 'Rosa Pérez'})
    check('closing needs the client signature', status == 400, status)
    status, done = field.req('POST', f'{base}/orders/{order["id"]}/complete', {'signatureName': 'Rosa Pérez', 'signature': JPEG, 'latitude': -12.05, 'longitude': -77.11})
    check('order completed with signature', status == 200 and done['status'] == 'completed' and done['signatureName'] == 'Rosa Pérez' and any(p['kind'] == 'signature' for p in done['photos']), done)
    check('device created for the installed tracker', done['deviceId'] > 0, done.get('deviceId'))
    client, _ = login(f'inst-{suffix}@test', password)
    _, devices = client.req('GET', '/api/devices')
    created = next((d for d in devices if d['uniqueId'] == imei), {})
    check('the client sees its new unit named by plate', created.get('name') == 'B7X-123' and created['attributes'].get('plate') == 'B7X-123', created)
    check('the same unit is kept when closing', done['deviceId'] == detail['deviceId'], (done['deviceId'], detail['deviceId']))
    _, stock = admin.req('GET', '/api/installations/stock')
    states = {i['serial']: (i['status'], i['deviceId']) for i in stock}
    check('equipment marked installed in the unit', states[imei] == ('installed', done['deviceId']) and states[f'RL-{suffix}'] == ('installed', done['deviceId']), states.get(imei))
    status, _ = field.req('PUT', f'{base}/orders/{order["id"]}', {'techNotes': 'cambio'})
    check('a completed order is closed for the installer', status == 400, status)

    anonymous = Client()
    status, report = anonymous.req('GET', f'/api/installer/acta/{order["token"]}')
    check('public installation report', status == 200 and report['plate'] == 'B7X-123' and report['technicianName'] == tech['name'] and len(report['photos']) == 4 and 'token' not in report, report)
    status, raw = anonymous.req('GET', f'/api/installer/acta/{order["token"]}/photos/{photo["id"]}', raw=True)
    check('report photos are public with the report link', status == 200 and raw[:2] == b'\xff\xd8', status)
    _, pending = admin.req('POST', '/api/installations/orders', {**order_body, 'itemIds': [], 'scheduledAt': iso(tomorrow + 7200)})
    status, _ = anonymous.req('GET', f'/api/installer/acta/{pending["token"]}')
    check('no report before the order is completed', status == 404, status)

    # support tickets
    status, ticket = client.req('POST', '/api/support/tickets', {'subject': 'La unidad no reporta', 'description': 'Desde ayer no aparece en el mapa', 'category': 'noSignal', 'priority': 'high', 'deviceId': created['id']})
    check('client opens a ticket', status == 200 and ticket['status'] == 'open' and ticket['priority'] == 'high', ticket)
    status, _ = client.req('POST', '/api/support/tickets', {'subject': 'Otro', 'deviceId': 1})
    check('a ticket only for its own units', status in (403, 400) or 1 in [d['id'] for d in devices], status)
    admin.req('POST', f'/api/support/tickets/{ticket["id"]}/messages', {'text': 'Revisando el equipo', 'internal': False})
    status, thread = admin.req('POST', f'/api/support/tickets/{ticket["id"]}/messages', {'text': 'Posible falla de antena', 'internal': True})
    check('support answers (in progress)', status == 200 and thread['status'] == 'inProgress' and len(thread['messages']) == 2, thread)
    status, seen = client.req('GET', f'/api/support/tickets/{ticket["id"]}')
    check('the client does not see internal notes', status == 200 and [m['text'] for m in seen['messages']] == ['Revisando el equipo'], seen.get('messages'))
    status, _ = client.req('PUT', f'/api/support/tickets/{ticket["id"]}', {'status': 'resolved'})
    check('the client cannot change the status (only close)', status == 403, status)
    status, with_order = admin.req('POST', f'/api/support/tickets/{ticket["id"]}/order', {'technicianId': tech['id'], 'scheduledAt': iso(tomorrow + 3600), 'address': 'Base del cliente'})
    check('technician sent from the ticket', status == 200 and with_order['workOrderId'] > 0 and with_order['workOrderStatus'] == 'scheduled', with_order)
    visit = with_order['workOrderId']
    _, visit_detail = admin.req('GET', f'/api/installations/orders/{visit}')
    check('support order for the same unit', visit_detail['type'] == 'support' and visit_detail['uniqueId'] == imei and visit_detail['ticketId'] == ticket['id'], visit_detail)
    field.req('POST', f'{base}/orders/{visit}/status', {'status': 'inProgress'})
    field.req('POST', f'{base}/orders/{visit}/complete', {'signatureName': 'Rosa Pérez', 'signature': JPEG, 'techNotes': 'Antena cambiada'})
    _, closed = client.req('GET', f'/api/support/tickets/{ticket["id"]}')
    check('completing the visit resolves the ticket', closed['status'] == 'resolved' and closed['messages'][-1]['author'] == 'Sistema', (closed['status'], closed['messages'][-1:]))
    status, closed = client.req('PUT', f'/api/support/tickets/{ticket["id"]}', {'status': 'closed'})
    check('the client closes its ticket', status == 200 and closed['status'] == 'closed', closed.get('status'))

    _, other_user = admin.req('POST', '/api/users', {'name': f'Ajeno {suffix}', 'email': f'inst-o-{suffix}@test', 'password': password})
    other, _ = login(f'inst-o-{suffix}@test', password)
    status, _ = other.req('GET', f'/api/support/tickets/{ticket["id"]}')
    check('other users cannot read the ticket', status == 404, status)
    _, basic_user = admin.req('POST', '/api/users', {'name': f'Básico inst {suffix}', 'email': f'inst-b-{suffix}@test', 'password': password, 'attributes': {'plan': 'basic'}})
    basic, _ = login(f'inst-b-{suffix}@test', password)
    status, _ = basic.req('GET', '/api/installations/orders')
    check('installations outside the basic plan', status == 403, status)
    status, own = basic.req('GET', '/api/support/tickets')
    check('any plan can open support tickets', status == 200, status)
    _, manager_user = admin.req('POST', '/api/users', {'name': f'Distribuidor inst {suffix}', 'email': f'inst-m-{suffix}@test', 'password': password, 'userLimit': 10, 'attributes': {'plan': 'reseller'}})
    manager, _ = login(f'inst-m-{suffix}@test', password)
    status, _ = manager.req('DELETE', f'/api/installations/orders/{order["id"]}')
    check('other distributors cannot touch the order', status == 404, status)
    status, _ = client.req('DELETE', f'/api/support/tickets/{ticket["id"]}')
    check('only the administrator deletes tickets', status == 403, status)

    cancel_imei = f'cancel-{suffix}'
    reseller.req('PUT', reseller_base, {'uniqueId': cancel_imei})
    status, cancelled = reseller.req('PUT', f'/api/installations/orders/{reseller_order["id"]}', {**reseller_order, 'status': 'cancelled'})
    _, devices_now = admin.req('GET', '/api/devices')
    check('cancelling the order removes the unit it created', status == 200 and not any(d['uniqueId'] == cancel_imei for d in devices_now), status)
    admin.req('DELETE', f'/api/installations/orders/{reseller_order["id"]}')
    admin.req('DELETE', f'/api/installations/technicians/{reseller_tech["id"]}')
    admin.req('DELETE', f'/api/devices/{foreign["id"]}')
    for item in (pending['id'], visit, order['id']):
        admin.req('DELETE', f'/api/installations/orders/{item}')
    admin.req('DELETE', f'/api/support/tickets/{ticket["id"]}')
    admin.req('DELETE', f'/api/installations/technicians/{tech["id"]}')
    for item in (gps, relay, camera):
        admin.req('DELETE', f'/api/installations/stock/{item["id"]}')
    admin.req('DELETE', f'/api/devices/{done["deviceId"]}')
    for user in (client_user, other_user, basic_user, manager_user, foreign_owner, reseller_user):
        admin.req('DELETE', f'/api/users/{user["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
