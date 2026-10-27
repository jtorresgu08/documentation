#!/usr/bin/env python3
"""
Prueba del módulo de sensores y combustible: un FTC920 con sonda LLS (io201) y tabla de calibración envía un día de
datos por Codec 8 Extended. Se comprueba el valor calibrado en cada posición, las alertas en vivo de carga y descarga,
que el oleaje en movimiento y las bajas pequeñas no se reportan, y el reporte /api/sensors/fuel.
Uso: TRACCAR_URL=http://127.0.0.1:8082 ADMIN_EMAIL=... ADMIN_PASSWORD=... python3 test_fuel.py
"""
import datetime
import json
import os
import socket
import struct
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results, wait_for  # noqa: E402
from test_teltonika_ft import crc16_ibm  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
PORT = int(os.environ.get('TELTONIKA_PORT', '5027'))
IMEI = os.environ.get('FUEL_IMEI', '350612070000977')

SENSORS = [{
    'id': 'tank1', 'name': 'Tanque principal', 'type': 'fuel', 'source': 'io201', 'unit': 'L',
    'calibration': [[0, 0], [4095, 400]], 'tankCapacity': 400,
    'minFill': 20, 'minDrain': 15, 'waitTime': 120, 'filter': 5, 'stoppedOnly': True, 'speedThreshold': 5,
}, {
    'id': 'temp1', 'name': 'Temperatura caja', 'type': 'temperature', 'source': 'temp1', 'unit': '°C', 'offset': -0.5,
}]


def raw(litres):
    return round(litres * 4095 / 400)


def record(timestamp, litres, speed, ignition):
    data = struct.pack('>QB', int(timestamp * 1000), 0)
    data += struct.pack('>iiHHBH', int((-77.0428 + timestamp % 100 * 1e-5) * 1e7), int(-12.0464 * 1e7), 150, 90, 9,
                        speed)
    data += struct.pack('>HH', 0, 4)
    data += struct.pack('>HHBHB', 2, 239, ignition, 240, 1 if speed else 0)
    data += struct.pack('>HHH', 1, 201, raw(litres))
    data += struct.pack('>HHi', 1, 72, 45)
    data += struct.pack('>HH', 0, 0)  # no 8 byte and no variable length elements
    return data


def send(records):
    with socket.create_connection((HOST, PORT), timeout=10) as sock:
        sock.sendall(struct.pack('>H', len(IMEI)) + IMEI.encode())
        check('device accepted', sock.recv(1) == b'\x01')
        for start in range(0, len(records), 50):
            chunk = records[start:start + 50]
            body = bytes([0x8E, len(chunk)]) + b''.join(chunk) + bytes([len(chunk)])
            sock.sendall(struct.pack('>II', 0, len(body)) + body + struct.pack('>I', crc16_ibm(body)))
            check(f'records {start + 1}-{start + len(chunk)} acknowledged',
                  struct.unpack('>I', sock.recv(4))[0] == len(chunk))


def main():
    api = Client()
    email = os.environ.get('ADMIN_EMAIL', 'admin@test')
    password = os.environ.get('ADMIN_PASSWORD', 'secret123')
    status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    if status != 200:
        api.req('POST', '/api/users', {'name': 'admin', 'email': email, 'password': password})
        status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    check('login', status == 200, status)

    status, device = api.req('POST', '/api/devices', {
        'name': 'Cisterna 7', 'uniqueId': IMEI, 'model': 'FTC920', 'phone': '+51987000777',
        'attributes': {'sensors': json.dumps(SENSORS), 'info.vin': '3HAMMAAR9KL123456', 'info.plate': 'C7Q-302'},
    })
    check('unit with sensors and VIN created', status == 200, (status, device))

    # 30 s per record: drive, stop and fill +60 L, drive with sloshing spikes, stop and drain 30 L, stop again
    # with a small 5 L drop (below the minimum), drive
    plan = [(10, 200, 60), (6, 200, 0), (8, 260, 0), (4, 260, 55), (2, 300, 55), (4, 260, 55), (6, 260, 0),
            (8, 230, 0), (6, 230, 0), (6, 225, 0), (6, 225, 50)]
    start = time.time() - 4 * 3600
    records, timestamp = [], start
    for count, litres, speed in plan:
        for _ in range(count):
            timestamp += 30
            records.append(record(timestamp, litres, speed, 1))
    send(records)

    def latest():
        positions = api.req('GET', f'/api/positions?deviceId={device["id"]}')[1]
        return positions[0]['attributes'] if positions else {}

    attributes = wait_for(lambda: latest().get('sensor.tank1') and latest())
    check('calibrated litres stored in the position', abs(attributes.get('sensor.tank1', 0) - 225) < 0.2, attributes)
    check('standard fuel level filled', abs(attributes.get('fuel', 0) - 225) < 0.2, attributes)
    check('temperature sensor with offset', abs(attributes.get('sensor.temp1', 0) - 4.0) < 1e-6, attributes)

    iso = lambda value: datetime.datetime.fromtimestamp(value, datetime.timezone.utc).strftime(  # noqa: E731
        '%Y-%m-%dT%H:%M:%SZ')
    period = f'deviceId={device["id"]}&from={iso(start)}&to={iso(time.time())}'

    def events():
        return api.req('GET', f'/api/reports/events?{period}&type=deviceFuelIncrease&type=deviceFuelDrop',
                       headers={'Accept': 'application/json'})[1]

    found = wait_for(lambda: len(events()) >= 2 and events())
    types = [event['type'] for event in found or []]
    check('live fill alert', types.count('deviceFuelIncrease') == 1, found)
    check('live drain alert', types.count('deviceFuelDrop') == 1, found)
    fill = next((event for event in found or [] if event['type'] == 'deviceFuelIncrease'), {})
    check('fill alert amount', abs(fill.get('attributes', {}).get('amount', 0) - 60) < 1, fill)

    status, report = api.req('GET', f'/api/sensors/fuel?{period}')
    check('fuel report', status == 200, (status, report))
    changes = report.get('changes', []) if status == 200 else []
    check('report: one fill and one drain only (sloshing and small drop ignored)',
          [change['type'] for change in changes] == ['fill', 'drain'], changes)
    check('report: fill 60 L', changes and abs(changes[0]['amount'] - 60) < 1, changes)
    check('report: drain 30 L', len(changes) > 1 and abs(changes[1]['amount'] - 30) < 1, changes)
    summary = report.get('summary', {})
    check('report: summary', abs(summary.get('filled', 0) - 60) < 1 and abs(summary.get('drained', 0) - 30) < 1
          and abs(summary.get('start', 0) - 200) < 0.5 and abs(summary.get('end', 0) - 225) < 0.5, summary)
    check('report: chart points', len(report.get('points', [])) == len(records), len(report.get('points', [])))

    status, _ = api.req('GET', f'/api/sensors/fuel?deviceId={device["id"]}&from={iso(start)}&to={iso(start - 10)}')
    check('invalid period rejected', status == 400, status)

    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
