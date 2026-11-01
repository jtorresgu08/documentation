#!/usr/bin/env python3
"""
Prueba de extremo a extremo de TPMS: configuración de ejes y ruedas, conversión de unidades (el equipo reporta kPa y
se muestra en psi), estado por neumático (bajo, alto, caliente), una alerta por cambio de estado, flota, historial,
validación y módulo del plan.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_tpms.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402


def tires(values, temps=None):
    extra = {f'tire{n}Pressure': value for n, value in enumerate(values, 1)}
    extra.update({f'tire{n}Temperature': value for n, value in (temps or {}).items()})
    return extra


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    _, device = admin.req('POST', '/api/devices', {'name': f'Camión TPMS {suffix}', 'uniqueId': f'tpms-{suffix}'})
    config = {'axles': [2, 4], 'sourceUnit': 'kPa', 'unit': 'psi', 'minPressure': 90, 'maxPressure': 130, 'maxTemperature': 75,
              'pressureAttribute': 'tire{n}Pressure', 'temperatureAttribute': 'tire{n}Temperature', 'names': {'1': 'Delantera izquierda'}}
    status, saved = admin.req('PUT', f'/api/tpms/{device["id"]}', config)
    check('layout saved: 2 axles, 6 tires', status == 200 and len(saved.get('wheels', [])) == 6, saved)
    status, _ = admin.req('PUT', f'/api/tpms/{device["id"]}', {**config, 'axles': [3]})
    check('axles of 2 or 4 wheels only', status == 400, status)

    start = time.time() - 600
    normal = [724] * 6  # 105 psi
    send(device['uniqueId'], start, -12.05, -77.03, 40, **tires(normal, {n: 40 for n in range(1, 7)}))
    time.sleep(1)
    low = list(normal)
    low[3] = 500  # 72.5 psi
    send(device['uniqueId'], start + 60, -12.05, -77.031, 40, **tires(low, {5: 90}))
    time.sleep(6)
    status, view = admin.req('GET', f'/api/tpms/{device["id"]}')
    wheels = {wheel['number']: wheel for wheel in view.get('wheels', [])}
    check('pressure converted from kPa to psi', abs(wheels.get(1, {}).get('pressure', 0) - 105) < 0.2, wheels.get(1))
    check('tire 4 low, tire 5 hot, the rest ok', wheels[4]['status'] == 'low' and wheels[5]['status'] == 'hot'
          and all(wheels[n]['status'] == 'ok' for n in (1, 2, 3, 6)) and view['alarms'] == 2, [(n, w['status']) for n, w in wheels.items()])
    check('names: own and by position', wheels[1]['name'] == 'Delantera izquierda' and wheels[4]['name'].startswith('E2'), (wheels[1]['name'], wheels[4]['name']))

    def alarms():
        _, events = admin.req('GET', f'/api/reports/events?deviceId={device["id"]}&type=tpmsAlarm&from={iso(start - 60)}&to={iso(time.time() + 60)}')
        return events if isinstance(events, list) else []

    events = alarms()
    check('one alert per tire that changed', sorted((e['attributes']['wheel'], e['attributes']['alarm']) for e in events) == [(4, 'low'), (5, 'hot')], [e['attributes'] for e in events])
    send(device['uniqueId'], start + 120, -12.05, -77.032, 40, **tires(low, {5: 90}))
    time.sleep(5)
    check('no repeated alert while the state holds', len(alarms()) == 2, len(alarms()))
    send(device['uniqueId'], start + 180, -12.05, -77.033, 40, **tires(normal, {5: 50}))
    time.sleep(1)
    send(device['uniqueId'], start + 240, -12.05, -77.034, 40, **tires(low, {5: 50}))
    time.sleep(6)
    check('a new alert after it recovered and dropped again', len(alarms()) == 3, len(alarms()))

    status, fleet = admin.req('GET', '/api/tpms')
    check('fleet list', status == 200 and any(item['deviceId'] == device['id'] for item in fleet), status)
    status, history = admin.req('GET', f'/api/tpms/{device["id"]}/history?from={iso(start - 60)}&to={iso(time.time() + 60)}')
    check('history per tire', status == 200 and len(history['points']) == 5 and history['points'][1]['p4'] == 72.5, history.get('points', [])[:2])

    password = 'Tpms2026!'
    _, basic = admin.req('POST', '/api/users', {'name': f'Básico {suffix}', 'email': f'tpms-{suffix}@test', 'password': password, 'attributes': {'plan': 'basic'}})
    other, _ = login(f'tpms-{suffix}@test', password)
    status, _ = other.req('GET', '/api/tpms')
    check('TPMS outside the basic plan', status == 403, status)
    admin.req('DELETE', f'/api/users/{basic["id"]}')
    admin.req('DELETE', f'/api/devices/{device["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
