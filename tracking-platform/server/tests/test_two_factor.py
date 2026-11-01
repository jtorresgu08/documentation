#!/usr/bin/env python3
"""
Prueba de extremo a extremo del doble factor (2FA): activación con la clave y un código de la app, códigos de
recuperación de un solo uso, inicio de sesión con código, desactivación, y obligación por empresa (un gerente la exige
y sus usuarios no pueden usar la plataforma hasta configurarla, ni desactivarla después).

Uso: TRACCAR_URL=http://127.0.0.1:8082 python3 test_two_factor.py
"""
import base64
import hashlib
import hmac
import os
import struct
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402
from test_operations import login  # noqa: E402


def totp(key, offset=0):
    secret = base64.b32decode(key + '=' * (-len(key) % 8))
    counter = int(time.time() // 30) + offset
    digest = hmac.new(secret, struct.pack('>Q', counter), hashlib.sha1).digest()
    start = digest[-1] & 0x0F
    return (struct.unpack('>I', digest[start:start + 4])[0] & 0x7FFFFFFF) % 1000000


def session(email, password, code=None):
    client = Client()
    form = {'email': email, 'password': password}
    if code is not None:
        form['code'] = str(code)
    status, _ = client.req('POST', '/api/session', form=form)
    return client, status


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    password = 'Clave2026!'
    status, user = admin.req('POST', '/api/users', {'name': f'Dos factores {suffix}', 'email': f'2fa-{suffix}@test', 'password': password})
    email = user['email']
    client, status = session(email, password)
    status, state = client.req('GET', '/api/security')
    check('2FA off at first', status == 200 and state['enabled'] is False and state['required'] is False, state)

    status, setup = client.req('POST', '/api/security/totp/setup')
    key = setup.get('key', '')
    check('setup gives a key and the QR link', status == 200 and len(key) >= 16 and f'secret={key}' in setup.get('uri', ''), setup)
    status, _ = client.req('POST', '/api/security/totp/enable', {'key': key, 'code': (totp(key) + 1) % 1000000})
    check('a wrong code does not turn it on', status in (400, 401, 403), status)
    status, enabled = client.req('POST', '/api/security/totp/enable', {'key': key, 'code': totp(key)})
    codes = enabled.get('recoveryCodes', []) if status == 200 else []
    check('2FA on with 8 recovery codes of 9 digits', status == 200 and enabled['enabled'] and len(codes) == 8 and all(100000000 <= c <= 999999999 for c in codes), enabled)

    _, status = session(email, password)
    check('login without code is refused', status == 401, status)
    _, status = session(email, password, totp(key))
    check('login with the app code', status == 200, status)
    _, status = session(email, password, codes[0])
    check('login with a recovery code', status == 200, status)
    _, status = session(email, password, codes[0])
    check('a recovery code works only once', status == 401, status)
    status, state = client.req('GET', '/api/security')
    check('recovery codes left', state.get('recoveryLeft') == 7, state)
    status, state = client.req('POST', '/api/security/totp/disable', {'code': totp(key)})
    check('2FA off with a current code', status == 200 and state['enabled'] is False, state)
    _, status = session(email, password)
    check('login without code again', status == 200, status)

    # a manager requires 2FA for its accounts
    status, manager = admin.req('POST', '/api/users', {'name': f'Gerente 2FA {suffix}', 'email': f'2fa-m-{suffix}@test', 'password': password, 'userLimit': 5})
    boss, _ = session(manager['email'], password)
    status, child = boss.req('POST', '/api/users', {'name': f'Usuario 2FA {suffix}', 'email': f'2fa-c-{suffix}@test', 'password': password})
    check('manager creates a user', status == 200, child)
    status, required = boss.req('PUT', f'/api/security/required/{manager["id"]}', {'required': True})
    check('manager requires 2FA below it', status == 200 and required['required'], required)
    worker, status = session(child['email'], password)
    check('the user can still log in to set it up', status == 200, status)
    status, body = worker.req('GET', '/api/devices')
    check('the platform is blocked until 2FA is set up', status == 403 and 'Two-factor' in str(body), (status, body))
    status, state = worker.req('GET', '/api/security')
    check('the user sees that 2FA is required', state.get('required') is True and state.get('enabled') is False, state)
    _, setup = worker.req('POST', '/api/security/totp/setup')
    status, _ = worker.req('POST', '/api/security/totp/enable', {'key': setup['key'], 'code': totp(setup['key'])})
    status, _ = worker.req('GET', '/api/devices')
    check('unblocked after setting it up', status == 200, status)
    status, _ = worker.req('POST', '/api/security/totp/disable', {'code': totp(setup['key'])})
    check('cannot turn off a required 2FA', status in (400, 401, 403), status)
    stranger, _ = session(email, password)
    status, _ = stranger.req('PUT', f'/api/security/required/{child["id"]}', {'required': False})
    check('only its managers can change the requirement', status in (400, 401, 403), status)

    for item in (child, manager, user):
        admin.req('DELETE', f'/api/users/{item["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
