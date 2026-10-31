#!/usr/bin/env python3
"""
Prueba de extremo a extremo de la escalabilidad comercial: planes con módulos heredables (un distribuidor no puede dar
más de lo que tiene, nadie cambia su propio plan, la API rechaza módulos fuera del plan), catálogo editable por el
administrador, dominios de marca blanca registrados por el distribuidor con verificación para el certificado
automático, y el resumen del panel del distribuidor.

Uso: TRACCAR_URL=http://127.0.0.1:8082 ADMIN_EMAIL=... ADMIN_PASSWORD=... python3 test_plans.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402
from test_operations import login  # noqa: E402

DENIED = (400, 401, 403)


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    status, catalog = admin.req('GET', '/api/plans')
    ids = [plan['id'] for plan in catalog.get('plans', [])]
    check('plan catalog', status == 200 and {'basic', 'pro', 'video', 'reseller'} <= set(ids) and 'whitelabel' in catalog['modules'], ids)

    password = 'Plan2026!'
    status, dist = admin.req('POST', '/api/users', {'name': f'Distribuidor {suffix}', 'email': f'dist-{suffix}@test', 'password': password,
                                                    'userLimit': 10, 'deviceLimit': 20, 'attributes': {'plan': 'pro'}})
    check('distributor with plan pro', status == 200 and dist['attributes'].get('plan') == 'pro', dist)
    status, other = admin.req('POST', '/api/users', {'name': f'Otro {suffix}', 'email': f'otro-{suffix}@test', 'password': password,
                                                     'userLimit': 5, 'attributes': {'plan': 'reseller'}})
    distributor, _ = login(f'dist-{suffix}@test', password)
    rival, _ = login(f'otro-{suffix}@test', password)

    status, _ = distributor.req('POST', '/api/users', {'name': 'Cliente video', 'email': f'cv-{suffix}@test', 'password': password, 'attributes': {'plan': 'video'}})
    check('cannot give a plan above its own', status in DENIED, status)
    status, client_user = distributor.req('POST', '/api/users', {'name': f'Cliente {suffix}', 'email': f'cli-{suffix}@test', 'password': password,
                                                                  'attributes': {'plan': 'basic'}})
    check('client with plan basic', status == 200, client_user)
    status, custom = distributor.req('POST', '/api/users', {'name': f'Cliente custom {suffix}', 'email': f'cc-{suffix}@test', 'password': password,
                                                             'attributes': {'plan': 'custom', 'modules': 'fuel,sensors,video'}})
    check('custom plan with a module it lacks rejected', status in DENIED, status)
    status, custom = distributor.req('POST', '/api/users', {'name': f'Cliente custom {suffix}', 'email': f'cc-{suffix}@test', 'password': password,
                                                             'attributes': {'plan': 'custom', 'modules': 'fuel,sensors'}})
    check('custom plan within its modules', status == 200, custom)

    status, me = distributor.req('GET', '/api/session')
    me['attributes']['plan'] = 'reseller'
    status, _ = distributor.req('PUT', f'/api/users/{me["id"]}', me)
    check('cannot change its own plan', status in DENIED, status)

    status, modules = distributor.req('GET', '/api/plans/modules')
    check('distributor modules from plan pro', status == 200 and 'fuel' in modules and 'video' not in modules and 'whitelabel' not in modules, modules)
    client_api, _ = login(f'cli-{suffix}@test', password)
    status, modules = client_api.req('GET', '/api/plans/modules')
    check('client modules: basic within pro', status == 200 and sorted(modules) == ['geofenceSpeed'], modules)
    status, modules = distributor.req('GET', f'/api/plans/modules?userId={custom["id"]}')
    check('manager reads a client modules', status == 200 and sorted(modules) == ['fuel', 'sensors'], modules)

    status, _ = client_api.req('GET', '/api/routing/route?point=-12.04,-77.04&point=-12.08,-77.0')
    check('API rejects module outside the plan', status == 403, status)
    status, _ = client_api.req('GET', '/api/alert-rules')
    check('custom alerts rejected for basic', status == 403, status)
    status, _ = distributor.req('GET', '/api/alert-rules')
    check('custom alerts allowed for pro', status == 200, status)
    status, _ = distributor.req('GET', '/api/video/recordings?deviceId=1')
    check('video rejected for pro', status == 403, status)

    # the client edits its own profile without touching the plan
    status, profile = client_api.req('GET', '/api/session')
    profile['phone'] = '+51987654321'
    status, _ = client_api.req('PUT', f'/api/users/{profile["id"]}', profile)
    check('client can still edit its profile', status == 200, status)

    # upgrade by the administrator propagates down, the client stays capped by its own plan
    dist['attributes']['plan'] = 'reseller'
    status, _ = admin.req('PUT', f'/api/users/{dist["id"]}', dist)
    check('administrator upgrades the distributor', status == 200, status)
    status, modules = distributor.req('GET', '/api/plans/modules')
    check('distributor gets white label', 'whitelabel' in modules and 'video' in modules, modules)
    client_user['attributes']['plan'] = 'video'
    status, _ = distributor.req('PUT', f'/api/users/{client_user["id"]}', client_user)
    check('distributor upgrades its client', status == 200, status)
    status, modules = client_api.req('GET', '/api/plans/modules')
    check('client gets video after upgrade', 'video' in modules and 'whitelabel' not in modules, modules)
    status, _ = rival.req('PUT', f'/api/users/{client_user["id"]}', {**client_user, 'attributes': {'plan': 'basic'}})
    check('other distributor cannot change the plan', status in DENIED, status)

    status, plans = admin.req('GET', '/api/plans')
    status, _ = admin.req('PUT', '/api/plans', [plan for plan in plans['plans'] if plan['id'] != 'video'])
    check('cannot remove a plan in use', status == 400, status)
    status, saved = admin.req('PUT', '/api/plans', plans['plans'] + [{'id': f'demo{suffix[-4:]}', 'name': 'Demo', 'modules': ['video', 'nope'], 'price': 10}])
    check('administrator adds a plan', status == 200 and saved[-1]['modules'] == ['video'], saved[-1:] if status == 200 else saved)
    status, _ = distributor.req('PUT', '/api/plans', plans['plans'])
    check('only the administrator edits the catalog', status in DENIED, status)
    admin.req('PUT', '/api/plans', plans['plans'])

    domain = f'gps{suffix}.distnorte.pe'
    status, _ = distributor.req('POST', '/api/hierarchy/domains', {'domain': f'https://{domain}/login'})
    check('distributor registers its domain', status == 200, status)
    status, _ = rival.req('POST', '/api/hierarchy/domains', {'domain': domain})
    check('domain cannot be taken by another account', status == 400, status)
    status, _ = distributor.req('POST', '/api/hierarchy/domains', {'domain': 'no valido'})
    check('invalid domain rejected', status == 400, status)
    status, _ = client_api.req('POST', '/api/hierarchy/domains', {'domain': f'x{domain}'})
    check('client without white label cannot add domains', status in DENIED, status)
    anonymous = Client()
    status, _ = anonymous.req('GET', f'/api/hierarchy/domain-check?domain={domain.upper()}')
    check('certificate check accepts the domain', status == 200, status)
    status, _ = anonymous.req('GET', '/api/hierarchy/domain-check?domain=desconocido.pe')
    check('certificate check rejects unknown domains', status == 404, status)
    status, brand = anonymous.req('GET', f'/api/hierarchy/brand?host={domain}')
    check('login page brand by domain', status == 200, brand)
    status, domains = distributor.req('GET', '/api/hierarchy/domains')
    mine = [item for item in domains if item['domain'] == domain] if status == 200 else []
    check('domain list with DNS status', len(mine) == 1 and mine[0]['status'] in ('unresolved', 'wrong', 'unknown', 'ok') and mine[0]['userId'] == dist['id'], mine)
    status, domains = rival.req('GET', '/api/hierarchy/domains')
    check('other branches do not see the domain', status == 200 and not any(item['domain'] == domain for item in domains), status)
    status, _ = rival.req('DELETE', f'/api/hierarchy/domains?domain={domain}')
    check('other distributor cannot remove it', status in DENIED, status)

    status, summary = distributor.req('GET', '/api/reseller/summary')
    check('distributor summary', status == 200 and summary['accounts']['total'] == 2 and summary['accounts']['clients'] == 2
          and summary['quota']['deviceLimit'] == 20 and summary['plans'].get('video') == 1 and summary['plans'].get('custom') == 1, summary.get('accounts'))
    children = {item['name']: item for item in summary.get('children', [])}
    check('direct accounts with plan and modules', children.get(f'Cliente {suffix}', {}).get('planName') == 'Video'
          and 'deviceStats' in children.get(f'Cliente {suffix}', {}), list(children))
    status, _ = client_api.req('GET', '/api/reseller/summary')
    check('clients have no distributor panel', status in DENIED, status)

    status, _ = distributor.req('DELETE', f'/api/hierarchy/domains?domain={domain}')
    check('distributor removes its domain', status == 204, status)
    status, _ = anonymous.req('GET', f'/api/hierarchy/domain-check?domain={domain}')
    check('removed domain no longer gets certificates', status == 404, status)

    for user in (custom, client_user, dist, other):
        if isinstance(user, dict) and user.get('id'):
            admin.req('DELETE', f'/api/users/{user["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
