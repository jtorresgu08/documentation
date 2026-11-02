#!/usr/bin/env python3
"""
Prueba de extremo a extremo de la gestión de SIMs: alta, importación CSV (con IMEI del equipo), el teléfono pasa al
equipo, una SIM por equipo, consumo informado por el operador, SIM silenciosa (equipo sin reportar), resumen,
cifras públicas del login (solo si se activan), visibilidad por cuenta y módulo del plan.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_sims.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402
from test_operations import login, send  # noqa: E402


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    _, online = admin.req('POST', '/api/devices', {'name': f'Camión SIM {suffix}', 'uniqueId': f'sim-on-{suffix}'})
    _, quiet = admin.req('POST', '/api/devices', {'name': f'Furgón mudo {suffix}', 'uniqueId': f'sim-off-{suffix}'})
    send(online['uniqueId'], time.time(), -12.05, -77.04)
    time.sleep(2)

    iccid1 = f'8951100{suffix}1'
    status, sim1 = admin.req('POST', '/api/sims', {'iccid': iccid1, 'phone': '+51987000111', 'carrier': 'Claro',
                                                   'apn': 'claro.pe', 'planName': 'M2M 50 MB', 'dataLimitMb': 50,
                                                   'monthlyCost': 6.5, 'deviceId': online['id']})
    check('SIM created and active when installed', status == 200 and sim1['status'] == 'active' and sim1['deviceName'] == online['name'], sim1)
    status, device = admin.req('GET', f'/api/devices?id={online["id"]}')
    check('the SIM phone goes to the device', status == 200 and device[0]['phone'] == '+51987000111', device)
    status, _ = admin.req('POST', '/api/sims', {'iccid': iccid1})
    check('duplicated ICCID rejected', status == 400, status)
    status, _ = admin.req('POST', '/api/sims', {'iccid': '123'})
    check('invalid ICCID rejected', status == 400, status)

    iccid2 = f'8951200{suffix}2'
    iccid3 = f'8951200{suffix}3'
    csv = ('ICCID;Teléfono;Operador;APN;Plan;MB;Costo;IMEI\n'
           f'{iccid2};+51987000222;Movistar;movistar.pe;M2M 20 MB;20;5,90;{quiet["uniqueId"]}\n'
           f'{iccid3};;Entel;entel.pe;M2M 10 MB;10;4\n'
           '999;;;;;;;\n'
           f'8951200{suffix}4;;Bitel;;;;;imei-que-no-existe\n')
    status, imported = admin.req('POST', '/api/sims/import', {'csv': csv})
    check('CSV import with ; and comma decimals', status == 200 and imported['created'] == 2 and len(imported['errors']) == 2, imported)
    status, imported = admin.req('POST', '/api/sims/import', {'csv': f'iccid,usageMb\n{iccid3},3.5\n'})
    check('re-import updates the existing SIM', status == 200 and imported['updated'] == 1 and imported['created'] == 0, imported)

    status, usage = admin.req('POST', '/api/sims/usage', [{'iccid': iccid1, 'usageMb': 52.4}, {'iccid': iccid2, 'usageMb': 4}, {'iccid': '000'}])
    check('usage from the carrier', status == 200 and usage['updated'] == 2 and usage['unknown'] == ['000'], usage)

    status, sims = admin.req('GET', '/api/sims')
    by = {s['iccid']: s for s in sims} if status == 200 else {}
    check('over the data limit', by.get(iccid1, {}).get('overLimit') is True and by[iccid1]['usagePercent'] == 104.8, by.get(iccid1))
    check('inventory SIM without device', by.get(iccid3, {}).get('status') == 'inventory' and by[iccid3]['usageMb'] == 3.5, by.get(iccid3))
    check('silent SIM: its device never reported', by.get(iccid2, {}).get('silent') is True and by[iccid1]['silent'] is False,
          (by.get(iccid2, {}).get('silent'), by.get(iccid1, {}).get('silent')))

    status, moved = admin.req('PUT', f'/api/sims/{by[iccid3]["id"]}', {**by[iccid3], 'deviceId': online['id'], 'status': 'active'})
    status, sims = admin.req('GET', '/api/sims')
    by = {s['iccid']: s for s in sims}
    check('one SIM per device: the old one is freed', by[iccid3]['deviceId'] == online['id'] and by[iccid1]['deviceId'] == 0, (by[iccid3]['deviceId'], by[iccid1]['deviceId']))

    status, summary = admin.req('GET', '/api/sims/summary')
    mine = [by[i] for i in (iccid1, iccid2, iccid3)]
    check('summary counts and cost', status == 200 and summary['active'] >= 3 and summary['silent'] >= 1 and summary['overLimit'] >= 1, summary)
    check('availability is a percentage', summary['availability'] is None or 0 <= summary['availability'] <= 100, summary.get('availability'))

    anonymous = Client()
    status, _ = anonymous.req('GET', '/api/sims/public')
    check('login figures hidden unless enabled', status == 404, status)
    _, server = admin.req('GET', '/api/server')
    attributes = dict(server['attributes'])
    admin.req('PUT', '/api/server', {**server, 'attributes': {**attributes, 'loginLiveStats': True}})
    status, public = anonymous.req('GET', '/api/sims/public')
    check('login figures when enabled (no login needed)', status == 200 and public['activeSims'] >= 3 and 'availability' in public and 'iccid' not in str(public), public)
    _, server = admin.req('GET', '/api/server')
    admin.req('PUT', '/api/server', {**server, 'attributes': attributes})

    password = 'Sim2026!'
    _, other_user = admin.req('POST', '/api/users', {'name': f'Otro SIM {suffix}', 'email': f'sim-{suffix}@test', 'password': password, 'userLimit': 5, 'attributes': {'plan': 'reseller'}})
    other, _ = login(f'sim-{suffix}@test', password)
    status, theirs = other.req('GET', '/api/sims')
    check('another account does not see these SIMs', status == 200 and not any(s['iccid'] in (iccid1, iccid2, iccid3) for s in theirs), len(theirs) if status == 200 else status)
    status, _ = other.req('PUT', f'/api/sims/{by[iccid1]["id"]}', by[iccid1])
    check('nor edit them', status == 404, status)
    status, _ = other.req('POST', '/api/sims', {'iccid': f'8951300{suffix}9', 'deviceId': online['id']})
    check('nor install a SIM in a device it cannot see', status in (400, 403), status)
    _, basic_user = admin.req('POST', '/api/users', {'name': f'Básico SIM {suffix}', 'email': f'simb-{suffix}@test', 'password': password, 'attributes': {'plan': 'basic'}})
    basic, _ = login(f'simb-{suffix}@test', password)
    status, _ = basic.req('GET', '/api/sims')
    check('SIMs outside the basic plan', status == 403, status)

    for sim in mine:
        admin.req('DELETE', f'/api/sims/{sim["id"]}')
    for user in (other_user, basic_user):
        admin.req('DELETE', f'/api/users/{user["id"]}')
    for item in (online, quiet):
        admin.req('DELETE', f'/api/devices/{item["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
