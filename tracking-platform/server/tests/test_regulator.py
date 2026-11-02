#!/usr/bin/env python3
"""
Prueba de extremo a extremo de la transmisión a entidades (SUTRAN / ATU): destino con plantilla y credencial
(oculta al leer), inscripción de vehículos, envío de cada posición con la placa y la hora local, reintentos cuando la
entidad falla, envío por lotes, prueba de conexión, estado por vehículo (transmitiendo, con fallas, pendiente),
JSON válido aunque los datos tengan comillas, baja del vehículo y permisos.

Las entidades se simulan con un servidor local en el puerto 18091.
Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_regulator.py
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import login, send  # noqa: E402

received = []
failures = {'count': 0}


class Authority(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if failures['count'] > 0:
            failures['count'] -= 1
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b'busy')
            return
        try:
            parsed = json.loads(body)
        except ValueError:
            parsed = None
        received.append({'path': self.path, 'auth': self.headers.get('Authorization'), 'raw': body.decode(), 'json': parsed})
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')


def wait(condition, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        if condition():
            return True
        time.sleep(0.3)
    return condition()


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 18091), Authority)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))

    status, presets = admin.req('GET', '/api/regulator/presets')
    check('SUTRAN and ATU templates', status == 200 and '${plate}' in presets['sutran']['template'] and '${route}' in presets['atu']['template'], presets)
    status, sutran = admin.req('POST', '/api/regulator/destinations', {
        'name': f'SUTRAN prueba {suffix}', 'type': 'sutran', 'url': 'http://127.0.0.1:18091/sutran',
        'authHeader': 'Authorization', 'authValue': 'Bearer secreto-sutran', 'template': presets['sutran']['template']})
    check('destination created, credential hidden', status == 200 and sutran['authValue'] == '********', sutran)
    status, _ = admin.req('POST', '/api/regulator/destinations', {'name': 'sin url', 'url': 'ftp://x'})
    check('destination needs an http URL', status == 400, status)
    status, sutran = admin.req('PUT', f'/api/regulator/destinations/{sutran["id"]}', {**sutran, 'name': f'SUTRAN {suffix}'})
    check('editing keeps the hidden credential', status == 200 and sutran['name'] == f'SUTRAN {suffix}', sutran)

    _, bus = admin.req('POST', '/api/devices', {'name': f'Bus 12 {suffix}', 'uniqueId': f'reg-{suffix}', 'attributes': {'plate': 'ABC-123'}})
    _, other = admin.req('POST', '/api/devices', {'name': f'Auto libre {suffix}', 'uniqueId': f'reg-free-{suffix}'})
    status, enrolled = admin.req('PUT', '/api/regulator/devices', {'destinationId': sutran['id'], 'deviceIds': [bus['id']], 'enrolled': True})
    check('vehicle enrolled', status == 200 and enrolled['changed'] == 1, enrolled)
    time.sleep(1.5)

    moment = int(time.time()) - 5
    send(bus['uniqueId'], moment, -12.046374, -77.042793, 54.0, ignition='true')
    send(other['uniqueId'], moment, -12.05, -77.05, 10.0)
    check('position delivered to SUTRAN', wait(lambda: any(r['path'] == '/sutran' for r in received)), received)
    first = next((r for r in received if r['path'] == '/sutran'), {})
    body = first.get('json') or {}
    local = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(moment - 5 * 3600))
    check('plate, coordinates, speed and Lima time', body.get('plate') == 'ABC-123' and body.get('latitude') == -12.046374
          and abs(body.get('speed', 0) - 54.0) < 0.2 and body.get('gpsDate') == local and body.get('ignition') == 1, body)
    check('credential sent in the header', first.get('auth') == 'Bearer secreto-sutran', first.get('auth'))
    time.sleep(1.5)
    check('vehicles not enrolled are not sent', all(r['json'] and r['json'].get('imei') != other['uniqueId'] for r in received if r['path'] == '/sutran'), received)

    status, state = admin.req('GET', '/api/regulator/status')
    row = next((v for v in state['vehicles'] if v['deviceId'] == bus['id']), {}) if status == 200 else {}
    check('status: transmitting', row.get('state') == 'ok' and row.get('sent') == 1 and row.get('plate') == 'ABC-123', row)

    failures['count'] = 2
    count = len(received)
    send(bus['uniqueId'], moment + 30, -12.047, -77.043, 40.0, ignition='true')

    def bus_state():
        _, current = admin.req('GET', '/api/regulator/status')
        return next((v for v in current['vehicles'] if v['deviceId'] == bus['id']), {})
    wait(lambda: bus_state().get('state') == 'failing', 10)
    row = bus_state()
    check('status: failing while the authority rejects', row.get('state') == 'failing' and '503' in (row.get('lastError') or ''), row)
    check('delivered after retrying', wait(lambda: len(received) > count, 30), len(received))
    _, state = admin.req('GET', '/api/regulator/status')
    row = next((v for v in state['vehicles'] if v['deviceId'] == bus['id']), {})
    check('status back to transmitting', row.get('state') == 'ok' and row.get('sent') == 2, row)

    _, quoted = admin.req('POST', '/api/devices', {'name': f'Placa rara {suffix}', 'uniqueId': f'reg-q-{suffix}', 'attributes': {'plate': 'AB"C\\1'}})
    admin.req('PUT', '/api/regulator/devices', {'destinationId': sutran['id'], 'deviceIds': [quoted['id']]})
    time.sleep(1.5)
    send(quoted['uniqueId'], moment, -12.0, -77.0, 0)
    check('valid JSON even with quotes in the data', wait(lambda: any(r['json'] and r['json'].get('plate') == 'AB"C\\1' for r in received)), received[-1:])

    status, atu = admin.req('POST', '/api/regulator/destinations', {
        'name': f'ATU {suffix}', 'type': 'atu', 'url': 'http://127.0.0.1:18091/atu', 'batch': True,
        'template': presets['atu']['template'], 'attributes': {'timezone': 'America/Lima'}})
    admin.req('PUT', f'/api/devices/{bus["id"]}', {**bus, 'attributes': {**bus['attributes'], 'route': '1244', 'regulator': f'{sutran["id"]},{atu["id"]}'}})
    time.sleep(1.5)
    send(bus['uniqueId'], moment + 60, -12.048, -77.044, 35.0, ignition='true')
    check('ATU receives a batch (JSON array) with the route', wait(lambda: any(r['path'] == '/atu' and isinstance(r['json'], list) and r['json'][0].get('ruta') == '1244' for r in received)), [r for r in received if r['path'] == '/atu'])

    status, tested = admin.req('POST', f'/api/regulator/destinations/{sutran["id"]}/test')
    check('connection test returns the reply', status == 200 and tested['status'] == 200 and '"plate"' in tested['request'], tested)
    status, destinations = admin.req('GET', '/api/regulator/destinations')
    item = next((d for d in destinations if d['id'] == sutran['id']), {})
    check('destination figures', item.get('sent', 0) >= 3 and item.get('queued') == 0, item)

    admin.req('PUT', '/api/regulator/devices', {'destinationId': sutran['id'], 'deviceIds': [quoted['id']], 'enrolled': False})
    time.sleep(1.5)
    count = len(received)
    send(quoted['uniqueId'], moment + 90, -12.0, -77.0, 0)
    time.sleep(3)
    check('removed vehicle stops transmitting', len(received) == count, len(received) - count)

    password = 'Reg2026!'
    _, pro_user = admin.req('POST', '/api/users', {'name': f'Pro reg {suffix}', 'email': f'reg-{suffix}@test', 'password': password, 'attributes': {'plan': 'pro'}})
    admin.req('POST', '/api/permissions', {'userId': pro_user['id'], 'deviceId': bus['id']})
    pro, _ = login(f'reg-{suffix}@test', password)
    status, theirs = pro.req('GET', '/api/regulator/status')
    check('a client sees the status of its own vehicles', status == 200 and len(theirs['vehicles']) == 2 and all(v['deviceId'] == bus['id'] for v in theirs['vehicles']), theirs)
    status, listed = pro.req('GET', '/api/regulator/destinations')
    check('clients do not see URLs or credentials', status == 200 and all('url' not in d and 'authValue' not in d for d in listed), listed)
    status, _ = pro.req('POST', '/api/regulator/destinations', {'name': 'x', 'url': 'http://x'})
    check('only the administrator creates destinations', status == 403, status)
    _, basic_user = admin.req('POST', '/api/users', {'name': f'Básico reg {suffix}', 'email': f'regb-{suffix}@test', 'password': password, 'attributes': {'plan': 'basic'}})
    basic, _ = login(f'regb-{suffix}@test', password)
    status, _ = basic.req('GET', '/api/regulator/status')
    check('transmission outside the basic plan', status == 403, status)

    for destination in (sutran, atu):
        admin.req('DELETE', f'/api/regulator/destinations/{destination["id"]}')
    for user in (pro_user, basic_user):
        admin.req('DELETE', f'/api/users/{user["id"]}')
    for device in (bus, other, quoted):
        admin.req('DELETE', f'/api/devices/{device["id"]}')
    server.shutdown()
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
