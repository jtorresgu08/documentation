#!/usr/bin/env python3
"""
Prueba de los equipos Teltonika de la plataforma FT (FTC920, FTC961...): un FTC920 simulado envía Codec 8
Extended al puerto 5027 y se comprueba que los datos compartidos con FMB (nivel de batería, ICCID, ADC) y el
voltaje externo propio de FT (AVL 800) se decodifican; un FMB920 sigue usando el voltaje del AVL 66.
Uso: TRACCAR_URL=http://127.0.0.1:8082 ADMIN_EMAIL=... ADMIN_PASSWORD=... python3 test_teltonika_ft.py
"""
import os
import socket
import struct
import sys
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

    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
