#!/usr/bin/env python3
"""
Prueba de extremo a extremo de activos a batería: intervalo esperado de reporte, estado dormido o atrasado, batería
desde el voltaje, consumo por día y días restantes, alerta de batería baja (una vez) y de reporte perdido (una vez),
envío del intervalo al equipo e historial.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_assets.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    _, asset = admin.req('POST', '/api/devices', {'name': f'Contenedor {suffix}', 'uniqueId': f'asset-{suffix}'})
    _, lost = admin.req('POST', '/api/devices', {'name': f'Remolque {suffix}', 'uniqueId': f'asset2-{suffix}'})
    settings = {'assetMode': True, 'reportHours': 6, 'batteryLow': 20, 'batteryFullVolts': 4.2, 'batteryEmptyVolts': 3.4}
    status, saved = admin.req('PUT', f'/api/assets/{asset["id"]}', settings)
    check('asset settings saved', status == 200 and saved['reportHours'] == 6 and saved['status'] == 'noData', saved)

    now = time.time()
    # ten days, a report every 6 hours, battery from 4.10 V to 3.62 V (87.5 % to 27.5 %, 6 % a day)
    reports = 40
    for k in range(reports):
        moment = now - 10 * 86400 + k * 6 * 3600 + 2 * 3600
        volts = 4.10 - 0.48 * k / (reports - 1)
        send(asset['uniqueId'], moment, -12.06 + k * 0.0001, -77.04, 0, battery=round(volts, 3))
        time.sleep(0.05)
    time.sleep(6)
    status, assets = admin.req('GET', '/api/assets')
    item = next((a for a in assets if a['deviceId'] == asset['id']), {}) if status == 200 else {}
    check('asleep until its next report', item.get('status') == 'sleeping' and abs(item.get('battery', 0) - 27.5) < 1, item)
    check('battery use per day and days left', abs((item.get('dropPerDay') or 0) - 6.4) < 0.5 and item.get('daysLeft') in (4, 5), (item.get('dropPerDay'), item.get('daysLeft')))
    check('reports and average interval', item.get('reports30d') == reports and abs(item.get('averageIntervalHours', 0) - 6) < 0.1, (item.get('reports30d'), item.get('averageIntervalHours')))

    def events(device, kind):
        _, found = admin.req('GET', f'/api/reports/events?deviceId={device["id"]}&type={kind}&from={iso(now - 11 * 86400)}&to={iso(time.time() + 60)}')
        return found if isinstance(found, list) else []

    send(asset['uniqueId'], now - 600, -12.06, -77.04, 0, battery=3.5)
    time.sleep(1)
    send(asset['uniqueId'], now - 300, -12.06, -77.04, 0, battery=3.5)
    time.sleep(6)
    low = events(asset, 'assetLowBattery')
    check('one low battery alert', len(low) == 1 and low[0]['attributes'].get('batteryPercent') == 13, [e['attributes'] for e in low])

    admin.req('PUT', f'/api/assets/{lost["id"]}', {**settings, 'reportHours': 1})
    send(lost['uniqueId'], now - 3 * 3600, -12.07, -77.05, 0, batteryLevel=80)
    time.sleep(6)
    status, _ = admin.req('POST', '/api/assets/check')
    status, _ = admin.req('POST', '/api/assets/check')
    time.sleep(1)
    missed = events(lost, 'assetMissedReport')
    check('one missed report alert', len(missed) == 1 and float(missed[0]['attributes'].get('hours', 0)) >= 2.9, [e['attributes'] for e in missed])
    _, assets = admin.req('GET', '/api/assets')
    item = next((a for a in assets if a['deviceId'] == lost['id']), {})
    check('late asset and battery level', item.get('status') == 'late' and item.get('battery') == 80, item)

    status, sent = admin.req('POST', f'/api/assets/{asset["id"]}/interval')
    check('report interval sent to the tracker (or queued)', status == 200 and sent['frequency'] == 21600 and sent['status'] in ('queued', 'sent'), sent)
    status, battery = admin.req('GET', f'/api/assets/{asset["id"]}/battery?days=30')
    check('battery history', status == 200 and len(battery['points']) == reports + 2, len(battery.get('points', [])))
    status, plain = admin.req('PUT', f'/api/assets/{asset["id"]}', {'assetMode': False})
    _, assets = admin.req('GET', '/api/assets')
    check('turned back into a normal unit', not any(a['deviceId'] == asset['id'] for a in assets), [a['deviceId'] for a in assets])

    for device in (asset, lost):
        admin.req('DELETE', f'/api/devices/{device["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
