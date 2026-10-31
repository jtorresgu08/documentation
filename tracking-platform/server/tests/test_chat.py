#!/usr/bin/env python3
"""
Prueba de extremo a extremo del chat con el conductor por WhatsApp (panel flotante "Chat con conductor"):
número del conductor, envío, respuesta del conductor recibida por el webhook, mensajes recientes, permisos y unidad
sin número.

Uso: servidor con WhatsApp de prueba (notificator.whatsapp.url apuntando a un servidor que responda 200 y
whatsapp.appSecret=app-secret), p. ej. TRACCAR_URL=http://127.0.0.1:8082 python3 test_chat.py
"""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402
from test_operations import login  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
APP_SECRET = os.environ.get('WHATSAPP_APP_SECRET', 'app-secret')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def webhook(sender, text):
    raw = json.dumps({'entry': [{'changes': [{'value': {'messages': [
        {'from': sender, 'type': 'text', 'text': {'body': text}}]}}]}]}).encode()
    signature = 'sha256=' + hmac.new(APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    request = urllib.request.Request(BASE + '/api/whatsapp/webhook', data=raw, method='POST', headers={
        'Content-Type': 'application/json', 'X-Hub-Signature-256': signature})
    return opener.open(request).status


def main():
    api, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    phone = '519' + suffix[-8:]
    device = api.req('POST', '/api/devices', {'name': f'Chat {suffix}', 'uniqueId': f'chat-{suffix}'})[1]
    lonely = api.req('POST', '/api/devices', {'name': f'Sin chofer {suffix}', 'uniqueId': f'chat-none-{suffix}'})[1]
    driver = api.req('POST', '/api/drivers', {'name': 'Juan Quispe', 'uniqueId': f'drv-{suffix}',
                                              'attributes': {'phone': f'+{phone}'}})[1]
    api.req('POST', '/api/permissions', {'deviceId': device['id'], 'driverId': driver['id']})

    status, chat = api.req('GET', f'/api/chat?deviceId={device["id"]}')
    check('conversation shows the driver', status == 200 and chat.get('driverName') == 'Juan Quispe'
          and chat.get('phone') == phone and chat.get('messages') == [], chat)
    check('whatsapp configured', chat.get('configured') is True, chat)

    status, sent = api.req('POST', '/api/chat', {'deviceId': device['id'], 'text': '¿Dónde te encuentras?'})
    check('message sent', status == 200 and sent.get('status') == 'sent' and sent.get('direction') == 'out'
          and sent.get('phone') == phone, sent)
    status, _ = api.req('POST', '/api/chat', {'deviceId': device['id'], 'text': '   '})
    check('empty message rejected', status == 400, status)
    status, _ = api.req('POST', '/api/chat', {'deviceId': lonely['id'], 'text': 'Hola'})
    check('unit without driver number rejected', status == 400, status)

    since = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() - 60))
    check('driver reply accepted', webhook(phone, 'Estoy en el km 32 de la Panamericana') == 200)
    status, chat = api.req('GET', f'/api/chat?deviceId={device["id"]}')
    texts = [(item['direction'], item['text']) for item in chat.get('messages', [])]
    check('reply stored in the unit chat', texts == [('out', '¿Dónde te encuentras?'),
                                                     ('in', 'Estoy en el km 32 de la Panamericana')], texts)
    status, recent = api.req('GET', f'/api/chat/recent?since={since}')
    check('recent replies listed', status == 200 and any(item['deviceId'] == device['id'] for item in recent), recent)

    other = Client()
    other_email = f'chat-{suffix}@test'
    api.req('POST', '/api/users', {'name': 'Otro', 'email': other_email, 'password': 'secret123'})
    other.req('POST', '/api/session', form={'email': other_email, 'password': 'secret123'})
    status, _ = other.req('GET', f'/api/chat?deviceId={device["id"]}')
    check('other user cannot read the chat', status in (400, 403, 404), status)
    status, recent = other.req('GET', '/api/chat/recent')
    check('other user sees no replies', status == 200 and not any(item['deviceId'] == device['id'] for item in recent), recent)

    for item in (device, lonely):
        api.req('DELETE', f'/api/devices/{item["id"]}')
    api.req('DELETE', f'/api/drivers/{driver["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
