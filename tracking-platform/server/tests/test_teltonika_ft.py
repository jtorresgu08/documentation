#!/usr/bin/env python3
"""
Prueba de los equipos Teltonika de la plataforma FT (FTC920, FTC961...): un FTC920 simulado envía Codec 8
Extended al puerto 5027 y se comprueba que los datos compartidos con FMB (nivel de batería, ICCID, ADC) y el
voltaje externo propio de FT (AVL 800) se decodifican; un FMB920 sigue usando el voltaje del AVL 66.
Con SMS_CAPTURE_PORT (y sms.http.url=http://127.0.0.1:<puerto>/sms en traccar.xml) comprueba además el prefijo de
los SMS: dos espacios en FMB (login y contraseña vacíos), uno en FT (solo contraseña).
Uso: TRACCAR_URL=http://127.0.0.1:8082 ADMIN_EMAIL=... ADMIN_PASSWORD=... python3 test_teltonika_ft.py
"""
import os
import http.server
import json
import socket
import struct
import sys
import threading
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results, wait_for  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
PORT = int(os.environ.get('TELTONIKA_PORT', '5027'))


def codec8e_record(io):
    """One AVL record with Codec 8 Extended IO elements, io = {id: (length, value)}."""
    data = struct.pack('>QB', int(time.time() * 1000), 0)
    data += struct.pack('>iiHHBH', int(-99.1332 * 1e7), int(19.4326 * 1e7), 2240, 90, 9, 42)
    data += struct.pack('>HH', 0, len(io))
    for length in (1, 2, 4, 8):
        items = [(key, value) for key, (size, value) in io.items() if size == length]
        data += struct.pack('>H', len(items))
        for key, value in items:
            data += struct.pack('>H', key) + value.to_bytes(length, 'big')
    data += struct.pack('>H', 0)
    return data


def send(imei, io):
    with socket.create_connection((HOST, PORT), timeout=10) as sock:
        sock.sendall(struct.pack('>H', len(imei)) + imei.encode())
        check(f'{imei} accepted', sock.recv(1) == b'\x01')
        body = bytes([0x8E, 1]) + codec8e_record(io) + bytes([1])
        crc = crc16_ibm(body)
        sock.sendall(struct.pack('>II', 0, len(body)) + body + struct.pack('>I', crc))
        check(f'{imei} record acknowledged', struct.unpack('>I', sock.recv(4))[0] == 1)


def crc16_ibm(data):
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def check_sms(api, devices, ftc, fmb):
    received = []

    class Gateway(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            received.append(self.rfile.read(int(self.headers['Content-Length'])).decode())
            self.send_response(200)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(('127.0.0.1', int(os.environ['SMS_CAPTURE_PORT'])), Gateway)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def sms(imei, command, attributes=None):
        device = dict(devices[imei], phone='+51900000001', attributes=attributes or {})
        api.req('PUT', f'/api/devices/{device["id"]}', device)
        received.clear()
        status, _ = api.req('POST', '/api/commands/send', dict(command, deviceId=device['id'], textChannel=True))
        found = wait_for(lambda: received)
        return status, found and json.loads(found[0])['message']

    custom = {'type': 'custom', 'attributes': {'data': 'getinfo'}}
    check('FTC920 SMS with one space', sms(ftc, custom) == (200, ' getinfo'))
    check('FTC920 SMS with password', sms(ftc, custom, {'smsPassword': '1234'}) == (200, '1234 getinfo'))
    check('FMB920 SMS with two spaces', sms(fmb, custom) == (200, '  getinfo'))
    check('FMB920 SMS with login and password',
          sms(fmb, custom, {'smsLogin': 'adm', 'smsPassword': '1234'}) == (200, 'adm 1234 getinfo'))
    check('FTC920 engine stop by SMS', sms(ftc, {'type': 'engineStop'}) == (200, ' setdigout 1'))
    check('typed prefix kept as is', sms(fmb, {'type': 'custom', 'attributes': {'data': ' x getinfo'}})
          == (200, ' x getinfo'))
    server.shutdown()


def main():
    api = Client()
    email = os.environ.get('ADMIN_EMAIL', 'admin@test')
    password = os.environ.get('ADMIN_PASSWORD', 'secret123')
    status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    if status != 200:
        api.req('POST', '/api/users', {'name': 'admin', 'email': email, 'password': password})
        status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    check('login', status == 200, status)

    ftc, fmb = '350612070000920', '350612070000921'
    devices = {}
    for imei, model in ((ftc, 'FTC920'), (fmb, 'FMB920')):
        status, device = api.req('POST', '/api/devices', {'name': model, 'uniqueId': imei, 'model': model})
        check(f'{model} created', status == 200, (status, device))
        devices[imei] = device

    io = {239: (1, 1), 240: (1, 1), 113: (1, 87), 9: (2, 1234), 67: (2, 4012), 66: (2, 12345),
          800: (4, 24300), 11: (8, 8935201234567890)}
    send(ftc, io)
    send(fmb, io)

    def latest(imei):
        positions = api.req('GET', f'/api/positions?deviceId={devices[imei]["id"]}')[1]
        return positions[0]['attributes'] if positions else None

    ft = wait_for(lambda: latest(ftc))
    check('FTC920 ignition and motion', ft and ft.get('ignition') is True and ft.get('motion') is True, ft)
    check('FTC920 battery level (shared FMB AVL 113)', ft and ft.get('batteryLevel') == 87, ft)
    check('FTC920 ICCID and ADC (shared FMB AVL 11, 9)',
          ft and ft.get('iccid') == '8935201234567890' and abs(ft.get('adc1', 0) - 1.234) < 1e-6, ft)
    check('FTC920 external voltage from AVL 800', ft and abs(ft.get('power', 0) - 24.3) < 1e-6, ft)

    fm = wait_for(lambda: latest(fmb))
    check('FMB920 external voltage still from AVL 66', fm and abs(fm.get('power', 0) - 12.345) < 1e-6, fm)
    check('FMB920 leaves AVL 800 raw', fm and fm.get('io800') == 24300, fm)

    if os.environ.get('SMS_CAPTURE_PORT'):
        check_sms(api, devices, ftc, fmb)

    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
