#!/usr/bin/env python3
"""
Prueba de extremo a extremo de la configuración remota en lote: plantillas propias y heredadas del distribuidor,
envío a varios equipos (en cola si están desconectados), paso a enviado cuando el equipo se conecta y a respondido con
la respuesta del equipo, reintento, prohibición del corte de motor en lote, permisos y restricción de comandos.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_device_config.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import login, send  # noqa: E402


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    password = 'Config2026!'
    _, reseller = admin.req('POST', '/api/users', {'name': f'Distribuidor {suffix}', 'email': f'cfg-r-{suffix}@test', 'password': password, 'userLimit': 5, 'deviceLimit': -1})
    boss, _ = login(reseller['email'], password)
    _, client_user = boss.req('POST', '/api/users', {'name': f'Cliente {suffix}', 'email': f'cfg-c-{suffix}@test', 'password': password})
    client, _ = login(client_user['email'], password)
    devices = [boss.req('POST', '/api/devices', {'name': f'Equipo {i} {suffix}', 'uniqueId': f'cfg{i}-{suffix}'})[1] for i in range(3)]
    linked = [boss.req('POST', '/api/permissions', {'userId': client_user['id'], 'deviceId': d['id']})[0] for d in devices]
    check('devices of the client', all('id' in device for device in devices) and all(code == 204 for code in linked), (devices, linked))

    template = {'name': 'APN Claro y 60 s', 'description': 'Equipos nuevos', 'commands': [
        {'type': 'custom', 'textChannel': False, 'attributes': {'data': 'APN,claro.pe'}},
        {'type': 'positionPeriodic', 'attributes': {'frequency': 60}}]}
    status, templates = boss.req('PUT', '/api/device-config/templates', [template])
    check('reseller template saved', status == 200 and templates[0]['name'] == template['name'] and templates[0]['own'], templates)
    status, inherited = client.req('GET', '/api/device-config/templates')
    check('the client sees the reseller template', status == 200 and any(t['name'] == template['name'] and t['own'] is False for t in inherited), inherited)
    status, _ = boss.req('PUT', '/api/device-config/templates', [{'name': 'Cortar', 'commands': [{'type': 'engineStop'}]}])
    check('engine stop not allowed in templates', status == 400, status)

    status, job = client.req('POST', '/api/device-config/jobs', {'name': 'Puesta en marcha', 'deviceIds': [d['id'] for d in devices], 'commands': template['commands']})
    check('job queued for disconnected devices', status == 200 and job['counts'] == {'queued': 3}, job.get('counts') if status == 200 else job)
    status, _ = client.req('POST', '/api/device-config/jobs', {'deviceIds': [devices[0]['id']], 'commands': [{'type': 'engineStop'}]})
    check('engine stop not sent in batch', status == 400, status)

    # the first device reports twice (OsmAnd takes one queued command per report) and then answers
    send(devices[0]['uniqueId'], time.time() - 20, -12.05, -77.03, 0)
    time.sleep(1)
    send(devices[0]['uniqueId'], time.time() - 10, -12.05, -77.03, 0)
    time.sleep(5)
    status, job = client.req('GET', f'/api/device-config/jobs/{job["id"]}')
    first = next(r for r in job['results'] if r['deviceId'] == devices[0]['id'])
    check('delivered when the device connects', first['status'] == 'sent' and job['counts'].get('queued') == 2, (first, job['counts']))
    send(devices[0]['uniqueId'], time.time(), -12.05, -77.03, 0, result='APN OK')
    time.sleep(5)
    status, job = client.req('GET', f'/api/device-config/jobs/{job["id"]}')
    first = next(r for r in job['results'] if r['deviceId'] == devices[0]['id'])
    check('answered with the device reply', first['status'] == 'answered' and first.get('reply') == 'APN OK', first)
    status, retried = client.req('POST', f'/api/device-config/jobs/{job["id"]}/retry')
    check('retry keeps the others queued', status == 200 and retried['counts'].get('queued') == 2, retried.get('counts'))
    status, jobs = client.req('GET', '/api/device-config/jobs')
    check('job list', status == 200 and jobs[0]['id'] == job['id'], status)
    status, _ = boss.req('GET', f'/api/device-config/jobs/{job["id"]}')
    check('other accounts cannot see the job', status == 404, status)

    client_user['limitCommands'] = True
    boss.req('PUT', f'/api/users/{client_user["id"]}', client_user)
    limited, _ = login(client_user['email'], password)
    status, _ = limited.req('POST', '/api/device-config/jobs', {'deviceIds': [devices[1]['id']], 'commands': template['commands']})
    check('users without commands cannot send', status in (400, 403), status)

    for device in devices:
        admin.req('DELETE', f'/api/devices/{device["id"]}')
    for user in (client_user, reseller):
        admin.req('DELETE', f'/api/users/{user["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
