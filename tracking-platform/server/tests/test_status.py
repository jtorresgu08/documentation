#!/usr/bin/env python3
"""
Prueba del estado del sistema y del seguimiento de puertos: métricas, puertos, IMEI desconocidos y su alta.
Uso: TRACCAR_URL=http://127.0.0.1:8082 ADMIN_EMAIL=... ADMIN_PASSWORD=... python3 test_status.py
"""
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jimi_simulator import JimiCamera  # noqa: E402
from test_dashcam import Client, check, results, wait_for  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
IMEI = os.environ.get('UNKNOWN_IMEI', '869999000777001')


def main():
    api = Client()
    email = os.environ.get('ADMIN_EMAIL', 'admin@test')
    password = os.environ.get('ADMIN_PASSWORD', 'secret123')
    status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    if status != 200:
        api.req('POST', '/api/users', {'name': 'admin', 'email': email, 'password': password})
        status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    check('login', status == 200, status)

    status, data = api.req('GET', '/api/system/status')
    check('status available to administrator', status == 200, status)
    check('jvm, disk and database reported', data['jvm']['memoryMax'] > 0 and data['disk']['total'] > 0
          and data['database']['ok'], data)
    gt06 = [p for p in data['ports'] if p['protocol'] == 'gt06']
    check('gt06 port 5023 listening', gt06 and gt06[0]['port'] == 5023 and gt06[0]['listening'], gt06)
    check('many protocol ports reported', len(data['ports']) > 100, len(data['ports']))

    camera = JimiCamera(HOST, 5023, IMEI)
    camera.log = lambda *a: None
    camera.login()

    def unknown():
        return [u for u in api.req('GET', '/api/system/status')[1]['unknownDevices'] if u['uniqueId'] == IMEI]

    found = wait_for(unknown)
    check('unknown IMEI listed with protocol and port',
          found and found[0]['protocol'] == 'gt06' and found[0]['port'] == 5023, found)
    camera.close()

    status, device = api.req('POST', '/api/devices', {'name': 'Nuevo desde estado', 'uniqueId': IMEI})
    check('unit created from unknown IMEI', status == 200, (status, device))
    check('created unit no longer listed as unknown', wait_for(lambda: not unknown()))

    camera = JimiCamera(HOST, 5023, IMEI)
    camera.log = lambda *a: None
    camera.login()
    online = wait_for(lambda: [p for p in api.req('GET', '/api/system/status')[1]['ports']
                               if p['protocol'] == 'gt06' and p['devices'] >= 1])
    check('connected device counted on its port', bool(online), online)
    check('gt06 messages counted', online and online[0]['messages']['total'] >= 2, online)
    camera.close()

    manager = Client()
    manager.req('POST', '/api/users', {'name': 'm', 'email': 'status-manager@test', 'password': 'secret123'})
    status, _ = manager.req('POST', '/api/session', form={'email': 'status-manager@test', 'password': 'secret123'})
    check('non administrators denied', manager.req('GET', '/api/system/status')[0] in (400, 401, 403))

    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
