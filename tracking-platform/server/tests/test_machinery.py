#!/usr/bin/env python3
"""
Prueba de extremo a extremo de maquinaria pesada: horas de trabajo (entrada del equipo), ralentí y apagada,
utilización, horas por obra y por operador, horómetro calibrado al tablero, combustible por hora, próximo
mantenimiento por horas, monto de alquiler, estado actual y módulo del plan.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_machinery.py
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
    _, machine = admin.req('POST', '/api/devices', {'name': f'Excavadora CAT 320 {suffix}', 'uniqueId': f'mach-{suffix}'})
    _, site = admin.req('POST', '/api/geofences', {'name': f'Obra Vía Expresa {suffix}', 'area': 'POLYGON((-12.10 -77.05, -12.10 -77.03, -12.12 -77.03, -12.12 -77.05, -12.10 -77.05))'})
    admin.req('POST', '/api/permissions', {'deviceId': machine['id'], 'geofenceId': site['id']})
    _, driver = admin.req('POST', '/api/drivers', {'name': f'Juan Quispe {suffix}', 'uniqueId': f'OP{suffix}'})
    settings = {'machineMode': True, 'machineType': 'excavator', 'workAttribute': 'in2', 'workSchedule': '00:00-23:59', 'workDays': '1-7', 'hourRate': 180, 'billing': 'engine'}
    status, saved = admin.req('PUT', f'/api/machinery/{machine["id"]}', settings)
    check('machine settings saved', status == 200 and saved['machineType'] == 'excavator' and saved['hourRate'] == 180, saved)
    status, _ = admin.req('PUT', f'/api/machinery/{machine["id"]}', {**settings, 'workSchedule': '7 a 18'})
    check('schedule must be like 07:00-18:00', status == 400, status)

    t0 = time.time() - 5 * 3600
    fuel = 1000.0
    plan = [(0, False, 0), (10, True, 0)]  # minutes, ignition, in2
    plan += [(m, True, 1) for m in range(30, 211, 5)]
    plan += [(210 + 5, True, 0), (240, False, 0), (250, False, 0)]
    for minute, ignition, work in plan:
        if ignition:
            fuel += 0.9 if work else 0.2
        send(machine['uniqueId'], t0 + minute * 60, -12.11, -77.04, 0.5 if work else 0, ignition='true' if ignition else 'false',
             in2=work, driverUniqueId=f'OP{suffix}', fuelUsed=round(fuel, 1))
        time.sleep(0.08)
    time.sleep(6)
    query = f'from={iso(t0 - 600)}&to={iso(time.time())}'
    status, fleet = admin.req('GET', f'/api/machinery?{query}')
    item = next((m for m in fleet if m['deviceId'] == machine['id']), {}) if status == 200 else {}
    check('work hours from the work input (30 to 215 min)', abs(item.get('workHours', 0) - 3.08) < 0.05, item.get('workHours'))
    check('idle hours (engine on, no work: 10-30 and 215-240 min)', abs(item.get('idleHours', 0) - 0.75) < 0.05, item.get('idleHours'))
    check('utilization and engine hours', abs(item.get('utilization', 0) - 80.4) < 1 and abs(item.get('engineHours', 0) - 3.83) < 0.05, (item.get('utilization'), item.get('engineHours')))
    check('rental amount by engine hours', abs(item.get('amount', 0) - item.get('engineHours', 0) * 180) < 0.5, item.get('amount'))
    check('now off, at its site', item.get('now') == 'off' and item.get('site') == site['name'], (item.get('now'), item.get('site')))
    # the engine hours of the tracker count between two messages with the engine on (not up to the switch off)
    check('hour meter from the engine hours', 3.0 <= item.get('hourMeter', 0) <= item.get('engineHours', 0) + 0.05, item.get('hourMeter'))
    raw_hours = item.get('hourMeter', 0)

    status, maintenance = admin.req('POST', '/api/maintenance', {'name': 'Cambio de aceite', 'type': 'hours', 'start': 0, 'period': 250 * 3600000})
    admin.req('POST', '/api/permissions', {'deviceId': machine['id'], 'maintenanceId': maintenance['id']})
    status, detail = admin.req('GET', f'/api/machinery/{machine["id"]}?{query}')
    sites = {s['name']: s for s in detail.get('sites', [])}
    check('hours by site', abs(sites.get(site['name'], {}).get('engineHours', 0) - 3.83) < 0.05, detail.get('sites'))
    operators = {o['name']: o for o in detail.get('operators', [])}
    check('hours by operator with the driver name', abs(operators.get(driver['name'], {}).get('workHours', 0) - 3.08) < 0.05, detail.get('operators'))
    check('fuel used and per engine hour', abs(detail.get('fuelUsed', 0) - round(fuel - 1000, 1)) < 0.2 and abs(detail.get('fuelPerHour', 0) - (fuel - 1000) / detail['engineHours']) < 0.2, (detail.get('fuelUsed'), detail.get('fuelPerHour')))
    check('next maintenance by hours', detail['maintenances'] and abs(detail['maintenances'][0]['remainingHours'] - (250 - raw_hours)) < 0.2, detail.get('maintenances'))
    check('timeline segments and days', [s['state'] for s in detail['segments']][:4] == ['off', 'idle', 'work', 'idle'] and detail['days'], [s['state'] for s in detail['segments']])

    status, calibrated = admin.req('PUT', f'/api/machinery/{machine["id"]}', {**settings, 'hourMeter': 1520})
    status, fleet = admin.req('GET', f'/api/machinery?{query}')
    item = next((m for m in fleet if m['deviceId'] == machine['id']), {})
    check('hour meter matched to the dashboard', item.get('hourMeter') == 1520.0, item.get('hourMeter'))

    password = 'Maq2026!'
    _, basic = admin.req('POST', '/api/users', {'name': f'Básico maq {suffix}', 'email': f'maq-{suffix}@test', 'password': password, 'attributes': {'plan': 'basic'}})
    other, _ = login(f'maq-{suffix}@test', password)
    status, _ = other.req('GET', f'/api/machinery?{query}')
    check('machinery outside the basic plan', status == 403, status)
    admin.req('DELETE', f'/api/users/{basic["id"]}')
    admin.req('DELETE', f'/api/maintenance/{maintenance["id"]}')
    admin.req('DELETE', f'/api/drivers/{driver["id"]}')
    admin.req('DELETE', f'/api/devices/{machine["id"]}')
    admin.req('DELETE', f'/api/geofences/{site["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
