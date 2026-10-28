#!/usr/bin/env python3
"""
Prueba del corte de motor seguro, WhatsApp (alertas y bot) y la evidencia de robo de combustible, con un FTC920
simulado (Codec 8 Extended) que mantiene la conexión abierta para recibir comandos (Codec 12).

Requiere en traccar.xml:
  notificator.types = web,whatsapp
  notificator.whatsapp.token = test, notificator.whatsapp.phoneNumberId = 123,
  notificator.whatsapp.url = http://127.0.0.1:7630
  whatsapp.verifyToken = verify-me, whatsapp.appSecret = app-secret
Uso: TRACCAR_URL=http://127.0.0.1:8082 python3 test_safety.py
"""
import hashlib
import hmac
import http.server
import json
import os
import socket
import struct
import sys
import threading
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results, wait_for  # noqa: E402
from test_teltonika_ft import crc16_ibm  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
GRAPH_PORT = int(os.environ.get('GRAPH_PORT', '7630'))
APP_SECRET = os.environ.get('WHATSAPP_APP_SECRET', 'app-secret')
VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', 'verify-me')
IMEI = '350612070000555'
PHONE = '51987000111'

sent = []


class Graph(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        sent.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"messages":[{"id":"x"}]}')

    def log_message(self, *args):
        pass


class Tracker:
    """FTC920 that stays connected and collects every byte the server sends (acks and Codec 12 commands)."""

    def __init__(self):
        self.sock = socket.create_connection((HOST, 5027), timeout=10)
        self.sock.settimeout(None)
        self.sock.sendall(struct.pack('>H', len(IMEI)) + IMEI.encode())
        self.sock.recv(1)
        self.received = b''
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        while True:
            try:
                data = self.sock.recv(4096)
            except OSError:
                return
            if not data:
                return
            self.received += data

    def send(self, records):
        for start in range(0, len(records), 50):
            chunk = records[start:start + 50]
            body = bytes([0x8E, len(chunk)]) + b''.join(chunk) + bytes([len(chunk)])
            self.sock.sendall(struct.pack('>II', 0, len(body)) + body + struct.pack('>I', crc16_ibm(body)))
            time.sleep(0.3)

    def commands(self):
        return self.received


def record(timestamp, speed, litres=200):
    data = struct.pack('>QB', int(timestamp * 1000), 0)
    data += struct.pack('>iiHHBH', int(-77.0428 * 1e7), int(-12.0464 * 1e7), 150, 90, 9, speed)
    data += struct.pack('>HH', 0, 3)
    data += struct.pack('>HHBHB', 2, 239, 1, 240, 1 if speed else 0)
    data += struct.pack('>HHH', 1, 201, round(litres * 4095 / 400))
    data += struct.pack('>HH', 0, 0)
    data += struct.pack('>H', 0)
    return data


def webhook(api, body, secret=APP_SECRET):
    raw = json.dumps(body).encode()
    signature = 'sha256=' + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    request = urllib.request.Request(BASE + '/api/whatsapp/webhook', data=raw, method='POST', headers={
        'Content-Type': 'application/json', 'X-Hub-Signature-256': signature})
    try:
        return urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request).status
    except urllib.error.HTTPError as error:
        return error.code


def message(sender, text):
    return {'entry': [{'changes': [{'value': {'messages': [{'from': sender, 'type': 'text', 'text': {'body': text}}]}}]}]}


def main():
    server = http.server.HTTPServer(('127.0.0.1', GRAPH_PORT), Graph)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    api = Client()
    email, password = os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123')
    if api.req('POST', '/api/session', form={'email': email, 'password': password})[0] != 200:
        api.req('POST', '/api/users', {'name': 'admin', 'email': email, 'password': password})
        api.req('POST', '/api/session', form={'email': email, 'password': password})
    status, user = api.req('GET', '/api/session')
    check('login', status == 200, status)
    user['attributes'] = {**user.get('attributes', {}), 'whatsapp': '+51 987 000 111'}
    check('WhatsApp number saved', api.req('PUT', f'/api/users/{user["id"]}', user)[0] == 200)

    sensors = [{'id': 'tank1', 'name': 'Tanque', 'type': 'fuel', 'source': 'io201', 'unit': 'L',
                'calibration': [[0, 0], [4095, 400]], 'minFill': 20, 'minDrain': 15, 'waitTime': 120, 'filter': 5}]
    status, device = api.req('POST', '/api/devices', {
        'name': 'Cisterna Prueba', 'uniqueId': IMEI, 'model': 'FTC920',
        'attributes': {'sensors': json.dumps(sensors), 'info.plate': 'XYZ-987',
                       'dashcam.kind': 'dashcam', 'dashcam.protocol': 'jimi', 'dashcam.channels': 2}})
    check('unit created', status == 200, (status, device))
    status, notification = api.req('POST', '/api/notifications', {
        'type': 'commandResult', 'always': True, 'notificators': 'whatsapp'})
    api.req('POST', '/api/permissions', {'userId': user['id'], 'notificationId': notification['id']})

    tracker = Tracker()
    now = time.time()
    tracker.send([record(now - 60, 60)])
    wait_for(lambda: api.req('GET', f'/api/positions?deviceId={device["id"]}')[1])

    # safe engine stop
    status, body = api.req('POST', '/api/commands/send', {'deviceId': device['id'], 'type': 'engineStop'})
    check('engine stop refused while moving (409)', status == 409 and '"moving"' in str(body), (status, body))
    check('nothing sent to the device', b'setdigout 1' not in tracker.commands())
    status, body = api.req('POST', '/api/commands/send', {
        'deviceId': device['id'], 'type': 'engineStop', 'attributes': {'whenStopped': True}})
    check('cut when stopped accepted (202 pending)', status == 202 and body.get('pending'), (status, body))
    status, state = api.req('GET', f'/api/safety/engine/{device["id"]}')
    check('pending cut and speed reported', state['pending'] and state['speed'] == 60 and state['limit'] == 20, state)
    tracker.send([record(now - 30, 0)])
    check('pending cut sent once the unit stops', wait_for(lambda: b'setdigout 1' in tracker.commands()))
    check('pending cleared', not api.req('GET', f'/api/safety/engine/{device["id"]}')[1]['pending'])
    check('WhatsApp alert for the command result', wait_for(
        lambda: any('engineStop' in json.dumps(item, ensure_ascii=False) for item in sent)), sent)

    tracker.send([record(now - 20, 70)])
    time.sleep(1)
    api.req('POST', '/api/commands/send', {'deviceId': device['id'], 'type': 'engineStop', 'attributes': {'whenStopped': True}})
    check('pending cut can be cancelled', api.req('DELETE', f'/api/safety/engine/{device["id"]}/pending')[0] == 204
          and not api.req('GET', f'/api/safety/engine/{device["id"]}')[1]['pending'])

    # WhatsApp bot
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    challenge = opener.open(BASE + f'/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token={VERIFY_TOKEN}'
                            '&hub.challenge=12345').read()
    check('webhook verification', challenge == b'12345', challenge)
    try:
        opener.open(BASE + '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1')
        bad = 200
    except urllib.error.HTTPError as error:
        bad = error.code
    check('wrong verify token rejected', bad == 403, bad)
    check('unsigned message rejected', webhook(api, message(PHONE, 'hola'), secret='wrong') == 403)

    sent.clear()
    check('signed message accepted', webhook(api, message(PHONE, '¿Dónde está la cisterna prueba?')) == 200)
    reply = wait_for(lambda: [item for item in sent if item.get('to') == PHONE])
    text = reply[0]['text']['body'] if reply else ''
    check('bot answers with the unit, status and map link',
          'Cisterna Prueba' in text and 'XYZ-987' in text and 'maps.google.com' in text, text)
    sent.clear()
    webhook(api, message(PHONE, 'XYZ 987'))
    reply = wait_for(lambda: [item for item in sent if item.get('to') == PHONE])
    check('bot finds the unit by plate', reply and 'Cisterna Prueba' in reply[0]['text']['body'], reply)
    sent.clear()
    webhook(api, message('51900000000', 'cisterna'))
    reply = wait_for(lambda: [item for item in sent if item.get('to') == '51900000000'])
    check('unknown numbers get no unit data', reply and 'no está registrado' in reply[0]['text']['body']
          and 'Cisterna' not in reply[0]['text']['body'], reply)

    # theft evidence: a drain makes the dashcam take one photo per channel
    plan = [(5, 200, 0), (8, 170, 0), (6, 170, 0)]
    records, timestamp = [], now
    for count, litres, speed in plan:
        for _ in range(count):
            timestamp += 30
            records.append(record(timestamp, speed, litres))
    tracker.send(records)
    check('drain photo requested from the road camera', wait_for(lambda: b'PICTURE,OUT' in tracker.commands()))
    check('drain photo requested from the cabin camera', b'PICTURE,IN' in tracker.commands())

    tracker.sock.close()
    server.shutdown()
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    return 1 if failed else 0


if __name__ == '__main__':
    import urllib.request  # noqa: E402
    sys.exit(main())
