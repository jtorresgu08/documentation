#!/usr/bin/env python3
"""
Prueba de la unidad de combustible por vehículo (litros o galones): cada gasto de combustible guarda la unidad de su
vehículo y el resumen de la flota normaliza a litros y también informa galones, sin mezclar unidades.

Uso: TRACCAR_URL=http://127.0.0.1:8082 ADMIN_EMAIL=... ADMIN_PASSWORD=... python3 test_fuel_units.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import iso, login  # noqa: E402


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    status, gal = admin.req('POST', '/api/devices', {'name': f'Camión galones {suffix}', 'uniqueId': f'gal-{suffix}', 'attributes': {'fuelUnit': 'gal'}})
    status, ltr = admin.req('POST', '/api/devices', {'name': f'Camión litros {suffix}', 'uniqueId': f'ltr-{suffix}'})
    now = time.time()
    status, e1 = admin.req('POST', '/api/expenses', {'deviceId': gal['id'], 'type': 'fuel', 'amount': 180, 'quantity': 10, 'expenseTime': iso(now - 600)})
    check('fuel expense keeps the vehicle unit (gallons)', status == 200 and e1['attributes'].get('fuelUnit') == 'gal', e1)
    status, e2 = admin.req('POST', '/api/expenses', {'deviceId': ltr['id'], 'type': 'fuel', 'amount': 95, 'quantity': 20, 'expenseTime': iso(now - 300)})
    check('fuel expense keeps the vehicle unit (liters)', status == 200 and e2['attributes'].get('fuelUnit') == 'L', e2)

    # changing the vehicle unit later does not change the quantities already recorded
    gal['attributes']['fuelUnit'] = 'L'
    admin.req('PUT', f'/api/devices/{gal["id"]}', gal)
    query = f'deviceId={gal["id"]}&deviceId={ltr["id"]}&from={iso(now - 3600)}&to={iso(now + 60)}'
    status, summary = admin.req('GET', f'/api/expenses/summary?{query}')
    check('fleet total normalized to liters', status == 200 and abs(summary['fuelLitres'] - (10 * 3.785411784 + 20)) < 0.01, summary.get('fuelLitres'))
    check('fleet total also in gallons', abs(summary['fuelGallons'] - (10 + 20 / 3.785411784)) < 0.01
          and abs(summary['fuelPricePerGallon'] - 275 / (10 + 20 / 3.785411784)) < 0.01, (summary.get('fuelGallons'), summary.get('fuelPricePerGallon')))
    units = {item['deviceId']: item for item in summary.get('units', [])}
    check('per vehicle quantity in its current unit', abs(units[ltr['id']]['fuelQuantity'] - 20) < 0.01 and units[ltr['id']]['fuelUnit'] == 'L'
          and abs(units[gal['id']]['fuelQuantity'] - 37.854) < 0.01, units)

    for device in (gal, ltr):
        admin.req('DELETE', f'/api/devices/{device["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
