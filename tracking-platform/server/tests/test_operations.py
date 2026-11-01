#!/usr/bin/env python3
"""
Prueba de extremo a extremo de la operación inteligente: centro de alertas (prioridad, estados, notas, historial,
lote, permisos, severidad configurable), calidad de conexión, mantenimiento (estado, servicios, avisos automáticos)
y plantillas de reportes configurables.

Uso (servidor con base vacía y osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_operations.py
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results, wait_for  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
OSMAND_PORT = int(os.environ.get('OSMAND_PORT', '5055'))
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def iso(seconds):
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(seconds))


def send(unique_id, moment, lat, lon, speed=0, **extra):
    query = urllib.parse.urlencode({'id': unique_id, 'timestamp': int(moment), 'lat': f'{lat:.6f}', 'lon': f'{lon:.6f}',
                                    'speed': speed / 1.852, **extra})
    opener.open(f'http://{HOST}:{OSMAND_PORT}/?{query}').read()


def login(email, password, name='admin', admin=None):
    client = Client()
    status, _ = client.req('POST', '/api/session', form={'email': email, 'password': password})
    if status != 200 and admin:
        admin.req('POST', '/api/users', {'name': name, 'email': email, 'password': password})
        status, _ = client.req('POST', '/api/session', form={'email': email, 'password': password})
    elif status != 200:
        client.req('POST', '/api/users', {'name': name, 'email': email, 'password': password})
        status, _ = client.req('POST', '/api/session', form={'email': email, 'password': password})
    return client, status


def main():
    api, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    good = api.req('POST', '/api/devices', {'name': 'Unidad estable', 'uniqueId': 'ops-good'})[1]
    bad = api.req('POST', '/api/devices', {'name': 'Unidad con fallas', 'uniqueId': 'ops-bad'})[1]
    now = time.time()
    start = now - 3 * 3600

    # history: the good unit reports every 30 s with strong GPS; the bad one loses 1 h while driving, weak signal
    lat = -12.1
    for second in range(0, 3 * 3600 - 120, 30):
        lat += 0.0002
        send('ops-good', start + second, lat, -77.0, 45, sat=11, rssi=28, ignition='true', motion='true')
    lat = -12.2
    for second in range(0, 3 * 3600 - 120, 30):
        if 3600 <= second < 7200:
            continue
        lat += 0.0002
        send('ops-bad', start + second, lat, -77.1, 45, sat=4, rssi=1, ignition='true', motion='true',
             valid='false' if second % 90 == 0 else 'true')
    send('ops-good', now - 60, lat, -77.0, 30, alarm='sos', ignition='true')
    send('ops-bad', now - 50, lat, -77.1, 30, alarm='hardBraking', ignition='true')
    send('ops-bad', now - 40, lat, -77.1, 30, alarm='door', ignition='true')
    # positions are processed in order; the alarms come last

    # --- alert center
    period = f"deviceId={good['id']}&deviceId={bad['id']}&from={iso(now - 6 * 3600)}&to={iso(now + 120)}"
    items = wait_for(lambda: (r := api.req('GET', '/api/alerts?' + period))[0] == 200 and len(r[1]) >= 3 and r[1], 60) or []
    check('alerts listed', len(items) == 3, items)
    by_alarm = {item['attributes'].get('alarm'): item for item in items or []}
    check('sos is critical', by_alarm.get('sos', {}).get('severity') == 'critical', by_alarm.get('sos'))
    check('hard braking is high', by_alarm.get('hardBraking', {}).get('severity') == 'high', by_alarm.get('hardBraking'))
    check('new alerts by default', all(item['status'] == 'new' for item in items))
    check('newest first', items[0]['attributes'].get('alarm') == 'door', [i['attributes'].get('alarm') for i in items])

    sos = by_alarm['sos']
    status, state = api.req('POST', f"/api/alerts/{sos['id']}", {'status': 'ack', 'note': 'Llamando al conductor'})
    check('take alert with note', status == 200 and state['status'] == 'ack' and state['note'] == 'Llamando al conductor', state)
    status, state = api.req('POST', f"/api/alerts/{sos['id']}", {'status': 'resolved', 'note': 'Falsa alarma del botón'})
    check('resolve alert', status == 200 and state['status'] == 'resolved', state)
    status, items = api.req('GET', '/api/alerts?' + period)
    sos = [item for item in items if item['id'] == sos['id']][0]
    check('history kept with user and notes', len(sos['history']) == 2 and sos['history'][0]['status'] == 'ack'
          and sos['history'][1]['note'] == 'Falsa alarma del botón', sos.get('history'))
    check('response time measured', sos.get('responseMinutes') is not None and 0 <= sos['responseMinutes'] < 10, sos)
    status, _ = api.req('POST', f"/api/alerts/{sos['id']}", {'status': 'whatever'})
    check('invalid status rejected', status == 400, status)
    others = [item['id'] for item in items if item['id'] != sos['id']]
    status, states = api.req('POST', '/api/alerts/batch', {'eventIds': others, 'status': 'ack', 'note': 'Revisando'})
    check('batch update', status == 200 and len(states) == 2 and all(s['status'] == 'ack' for s in states), states)
    status, open_items = api.req('GET', '/api/alerts?status=new&' + period)
    check('status filter', status == 200 and open_items == [], open_items)
    status, critical = api.req('GET', '/api/alerts?severity=critical&' + period)
    check('severity filter', status == 200 and len(critical) == 1, critical)
    status, summary = api.req('GET', '/api/alerts/summary?' + period)
    check('summary counts', status == 200 and summary['total'] == 3 and summary['open'] == 2
          and summary['byStatus']['resolved'] == 1 and summary['handledPercent'] == 100, summary)
    check('summary by type and hour', summary['byType'] and sum(summary['byHour'].values()) == 3, summary)
    status, position = api.req('GET', f"/api/alerts/position/{by_alarm['door']['id']}")
    check('alert position', status == 200 and abs(position['latitude'] - lat) < 0.001, position)

    server = api.req('GET', '/api/server')[1]
    previous = server['attributes'].get('alerts.severity')
    server['attributes']['alerts.severity'] = 'alarm:door=critical, alarm:sos=low'
    api.req('PUT', '/api/server', server)
    status, items = api.req('GET', '/api/alerts?' + period)
    severities = {item['attributes'].get('alarm'): item['severity'] for item in items}
    check('severity overrides from server settings', severities == {'sos': 'low', 'door': 'critical', 'hardBraking': 'high'},
          severities)
    # leave the server settings as they were, so the test can run again
    server = api.req('GET', '/api/server')[1]
    if previous is None:
        server['attributes'].pop('alerts.severity', None)
    else:
        server['attributes']['alerts.severity'] = previous
    api.req('PUT', '/api/server', server)

    viewer, status = login('ops-viewer@test', 'secret123', 'viewer', admin=api)
    status, items = viewer.req('GET', '/api/alerts?' + period)
    check('other user sees no alerts', status == 200 and items == [], (status, items))
    status, _ = viewer.req('POST', f"/api/alerts/{sos['id']}", {'status': 'ack'})
    check('other user cannot handle the alert', status in (400, 403, 404), status)

    # --- connection quality
    q_period = f"deviceId={good['id']}&deviceId={bad['id']}&from={iso(start - 60)}&to={iso(now + 60)}"
    status, quality = api.req('GET', '/api/quality?' + q_period)
    check('quality computed', status == 200 and len(quality) == 2, quality)
    by_name = {item['name']: item for item in quality or []}
    stable, faulty = by_name.get('Unidad estable', {}), by_name.get('Unidad con fallas', {})
    check('stable unit scores high', stable.get('score', 0) >= 85 and not stable.get('issues'), stable)
    check('faulty unit scores low', faulty.get('score', 100) < 70, faulty)
    check('faulty unit issues', {'gaps', 'weakGps', 'weakSignal', 'invalidFix'} <= set(faulty.get('issues', [])), faulty.get('issues'))
    check('gap located', faulty.get('gapCount') == 1 and abs(faulty['gaps'][0]['duration'] - 3630000) < 60000, faulty.get('gaps'))
    check('worst first', quality[0]['name'] == 'Unidad con fallas', [q['name'] for q in quality])
    status, details = api.req('GET', f"/api/quality?deviceId={bad['id']}&from={iso(start - 60)}&to={iso(now + 60)}&details=true")
    check('hourly detail', status == 200 and len(details[0]['hourly']) >= 3 and details[0]['hourly'][1] < 5, details[0].get('hourly'))
    status, _ = api.req('GET', f"/api/quality?deviceId={good['id']}&from={iso(now - 40 * 86400)}&to={iso(now)}")
    check('quality period limited', status == 400, status)

    # --- maintenance
    status, current = api.req('GET', f"/api/positions?id={api.req('GET', '/api/devices?id=' + str(good['id']))[1][0]['positionId']}")
    total = current[0]['attributes'].get('totalDistance', 0)
    check('unit has traveled', total > 2000, total)
    oil = api.req('POST', '/api/maintenance', {'name': 'Aceite', 'type': 'totalDistance', 'start': 0, 'period': 5000000, 'attributes': {}})[1]
    tires = api.req('POST', '/api/maintenance', {'name': 'Llantas', 'type': 'totalDistance', 'start': 0, 'period': 1000, 'attributes': {}})[1]
    group = api.req('POST', '/api/groups', {'name': 'Flota ops'})[1]
    good['groupId'] = group['id']
    api.req('PUT', f"/api/devices/{good['id']}", good)
    api.req('POST', '/api/permissions', {'groupId': group['id'], 'maintenanceId': oil['id']})
    api.req('POST', '/api/permissions', {'deviceId': good['id'], 'maintenanceId': tires['id']})
    status, plans = api.req('GET', f"/api/maintenance-plans/status?deviceId={good['id']}")
    check('plans status (own and from group)', status == 200 and len(plans['items']) == 2, plans)
    by_plan = {item['name']: item for item in plans['items']}
    check('oil plan ok with next due', by_plan['Aceite']['state'] == 'ok' and by_plan['Aceite']['next'] == 5000000, by_plan.get('Aceite'))
    check('overdue first', plans['items'][0]['state'] in ('overdue', 'soon') or plans['counts']['ok'] == 2, plans['items'])

    status, record = api.req('POST', '/api/maintenance-plans/records', {
        'deviceId': good['id'], 'maintenanceId': oil['id'], 'serviceTime': iso(now), 'cost': 320.5, 'workshop': 'Taller Lima',
        'notes': 'Aceite 15W40 y filtro', 'attributes': {'createExpense': True}})
    check('service registered', status == 200 and record['odometer'] > 2000 and record['expenseId'] > 0, record)
    status, plans = api.req('GET', f"/api/maintenance-plans/status?deviceId={good['id']}")
    oil_status = [item for item in plans['items'] if item['name'] == 'Aceite'][0]
    check('service restarts the plan', abs(oil_status['next'] - (record['odometer'] + 5000000)) < 1 and oil_status['lastServiceId'] == record['id'], oil_status)
    status, expenses = api.req('GET', f"/api/expenses?deviceId={good['id']}&from={iso(now - 86400)}&to={iso(now + 86400)}")
    check('service cost added to expenses', status == 200 and any(e['id'] == record['expenseId'] and e['amount'] == 320.5 for e in expenses), expenses)

    status, plans = api.req('GET', f"/api/maintenance-plans/status?deviceId={good['id']}")
    tires_status = [item for item in plans['items'] if item['name'] == 'Llantas'][0]
    check('short plan overdue', tires_status['state'] in ('overdue', 'soon') or tires_status['remaining'] <= 1000, tires_status)
    api.req('POST', '/api/maintenance-plans/records', {'deviceId': good['id'], 'maintenanceId': tires['id'], 'serviceTime': iso(now - 86400),
                                                       'odometer': 1, 'cost': 0, 'attributes': {}})
    status, plans = api.req('GET', f"/api/maintenance-plans/status?deviceId={good['id']}")
    tires_status = [item for item in plans['items'] if item['name'] == 'Llantas'][0]
    check('plan overdue after old service', tires_status['state'] == 'overdue' and tires_status['remaining'] < 0, tires_status)
    status, check_result = api.req('POST', '/api/maintenance-plans/check')
    check('reminder raises maintenance events', status == 200 and check_result['events'] >= 1, check_result)
    status, again = api.req('POST', '/api/maintenance-plans/check')
    check('reminder once per cycle', status == 200 and again['events'] == 0, again)
    status, items = api.req('GET', f"/api/alerts?type=maintenance&deviceId={good['id']}&from={iso(now - 3600)}&to={iso(time.time() + 60)}")
    check('maintenance reminder in the alert center', status == 200 and items and items[0]['attributes'].get('state') == 'overdue'
          and items[0]['severity'] == 'high', items)
    status, _ = viewer.req('POST', '/api/maintenance-plans/check')
    check('reminder check admin only', status in (400, 403), status)
    status, _ = api.req('DELETE', f"/api/maintenance-plans/records/{record['id']}")
    check('service deleted', status == 204, status)
    status, expenses = api.req('GET', f"/api/expenses?deviceId={good['id']}&from={iso(now - 86400)}&to={iso(now + 86400)}")
    check('linked expense removed', not any(e['id'] == record['expenseId'] for e in expenses), expenses)

    # --- report templates
    config = json.dumps({'source': 'trips', 'columns': ['deviceName', 'distance'], 'groupBy': 'device'})
    status, template = api.req('POST', '/api/report-templates', {'name': 'Km por unidad', 'config': config, 'attributes': {}})
    check('template saved', status == 200 and template['id'] > 0, template)
    status, template = api.req('PUT', f"/api/report-templates/{template['id']}", {'name': 'Km mensual', 'config': config, 'attributes': {}})
    check('template renamed', status == 200 and template['name'] == 'Km mensual', template)
    status, templates = api.req('GET', '/api/report-templates')
    check('template listed with its config', status == 200 and json.loads(templates[0]['config'])['source'] == 'trips', templates)
    status, templates = viewer.req('GET', '/api/report-templates')
    check('templates are private', status == 200 and templates == [], templates)
    status, _ = viewer.req('DELETE', f"/api/report-templates/{template['id']}")
    check('other user cannot delete', status == 404, status)
    status, _ = api.req('POST', '/api/report-templates', {'name': 'Grande', 'config': 'x' * 100001, 'attributes': {}})
    check('oversized template rejected', status == 400, status)
    status, _ = api.req('DELETE', f"/api/report-templates/{template['id']}")
    check('template deleted', status == 204, status)

    for device in (good, bad):
        api.req('DELETE', f"/api/devices/{device['id']}")
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
