#!/usr/bin/env python3
"""
Prueba de extremo a extremo de los reportes de sensores y de alertas personalizadas: estadísticas por sensor
(mínimo, promedio ponderado, máximo, total del periodo, tiempo activo, activaciones, tiempo por rango de color),
serie de valores, filtros, totales del reporte de alertas por regla, unidad, prioridad, día y hora, y permisos.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_reports.py
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402
from test_rules import wait_events  # noqa: E402


def main():
    api, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    uid = f'reports-{suffix}'
    sensors = [
        {'id': 'temp', 'name': 'Temperatura', 'type': 'temperature', 'source': 'temp1', 'unit': '°C',
         'ranges': [{'from': 2, 'to': 8, 'color': '#2e7d32'}, {'from': 8, 'to': 99, 'color': '#c62828'}]},
        {'id': 'door', 'name': 'Puerta', 'type': 'door', 'source': 'in2'},
        {'id': 'odo', 'name': 'Odómetro', 'type': 'mileage', 'source': 'odo'},
    ]
    device = api.req('POST', '/api/devices', {'name': f'Reportes {suffix}', 'uniqueId': uid,
                                              'attributes': {'sensors': json.dumps(sensors)}})[1]
    status, rule = api.req('POST', '/api/alert-rules', {'name': 'Puerta abierta (reporte)', 'enabled': True, 'attributes': {},
                                                       'config': json.dumps({'type': 'digital', 'deviceIds': [device['id']],
                                                                             'severity': 'critical', 'cooldown': 0,
                                                                             'condition': {'sensorName': 'Puerta', 'state': 'on'}})})
    start = time.time() - 1800
    readings = [(0, 4, 'false', 100), (300, 6, 'false', 102), (600, 10, 'true', 104), (900, 6, 'false', 106),
                (1200, 5, 'true', 108), (1500, 5, 'false', 110)]
    for offset, temp, door, odo in readings:
        send(uid, start + offset, -12.05, -77.05, 0, temp1=temp, in2=door, odo=odo)
        time.sleep(0.6)
    deadline = time.time() + 20
    while time.time() < deadline:
        positions = api.req('GET', f'/api/positions?deviceId={device["id"]}')[1]
        if positions and positions[0].get('attributes', {}).get('sensor.odo') == 110:
            break
        time.sleep(1)

    query = f'deviceId={device["id"]}&from={iso(start - 60)}&to={iso(time.time() + 60)}'
    status, report = api.req('GET', f'/api/sensors/report?{query}')
    stats = {item['id']: item for item in report['devices'][0]['sensors']} if status == 200 and report['devices'] else {}
    temp = stats.get('temp', {})
    check('sensor report statistics', temp.get('count') == 6 and temp.get('min') == 4 and temp.get('max') == 10
          and temp.get('last') == 5, temp)
    check('time-weighted average', abs(temp.get('average', 0) - 6.2) < 0.01, temp.get('average'))
    ranges = {item['color']: item for item in temp.get('ranges', [])}
    check('time in color ranges', ranges.get('#c62828', {}).get('time') == 300000
          and ranges.get('#2e7d32', {}).get('percent') == 80.0, temp.get('ranges'))
    door = stats.get('door', {})
    check('digital time on and activations', door.get('onTime') == 600000 and door.get('activations') == 2
          and door.get('onPercent') == 40.0, door)
    check('period total of mileage', stats.get('odo', {}).get('total') == 10, stats.get('odo'))
    check('series for one unit', status == 200 and len(report['series']) == 6
          and report['series'][2]['values'].get('temp') == 10, report.get('series', [])[:3])
    status, only = api.req('GET', f'/api/sensors/report?{query}&sensorId=door')
    check('sensor filter', status == 200 and [item['id'] for item in only['devices'][0]['sensors']] == ['door'], only)
    status, _ = api.req('GET', f'/api/sensors/report?deviceId={device["id"]}&from={iso(start - 40 * 86400)}&to={iso(time.time())}')
    check('period longer than 31 days rejected', status == 400, status)

    events = wait_events(api, rule['id'], 2)
    check('rule fired on each opening', len(events) == 2, len(events))
    alert = events[0] if events else {}
    if alert:
        api.req('POST', f'/api/alerts/{alert["id"]}', {'status': 'resolved', 'note': 'Revisado'})
    status, alerts = api.req('GET', f'/api/alert-rules/report?from={iso(start - 60)}&to={iso(time.time() + 60)}&ruleId={rule["id"]}')
    summary = alerts.get('summary', {}) if status == 200 else {}
    check('alerts report totals', summary.get('total') == 2 and summary.get('handled') == 1 and summary.get('units') == 1
          and summary.get('bySeverity', {}).get('critical') == 2 and sum(summary.get('byHour', [])) == 2, summary)
    check('alerts report items with status', any(item['status'] == 'resolved' and item['note'] == 'Revisado'
                                                 for item in alerts.get('items', [])), alerts.get('items'))
    status, filtered = api.req('GET', f'/api/alert-rules/report?from={iso(start - 60)}&to={iso(time.time() + 60)}'
                                      f'&ruleId={rule["id"]}&severity=low')
    check('severity filter', status == 200 and filtered['summary']['total'] == 0, filtered.get('summary'))

    other = Client()
    other_email = f'reports-{suffix}@test'
    api.req('POST', '/api/users', {'name': 'Otro', 'email': other_email, 'password': 'secret123'})
    other.req('POST', '/api/session', form={'email': other_email, 'password': 'secret123'})
    status, _ = other.req('GET', f'/api/sensors/report?{query}')
    check('other user cannot read the sensor report', status in (400, 403, 404), status)
    status, foreign = other.req('GET', f'/api/alert-rules/report?from={iso(start - 60)}&to={iso(time.time() + 60)}')
    check('other user sees no alerts', status == 200 and foreign['summary']['total'] == 0, foreign.get('summary'))

    api.req('DELETE', f'/api/alert-rules/{rule["id"]}')
    api.req('DELETE', f'/api/devices/{device["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
