#!/usr/bin/env python3
"""
Stress test of the position queue: many HTTP (OsmAnd) positions sent at once for several devices, as a phone app or a
batch of buffered points would. Every device must end with its last position processed and keep accepting new ones
(before the fix, a race between a position finishing and the next one arriving could leave a device's queue stuck
until the server restarted).

Use (server with osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_processing_queue.py
"""
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    devices = [admin.req('POST', '/api/devices', {'name': f'Cola {i} {suffix}', 'uniqueId': f'queue{i}-{suffix}'})[1] for i in range(6)]
    start = time.time() - 3600
    count = 150

    def burst(device, offset):
        for k in range(count):
            send(device['uniqueId'], start + k * 20, -12.05 + k * 0.0002 + offset, -77.03, 30)
            time.sleep(0.002)

    for _ in range(2):
        threads = [threading.Thread(target=burst, args=(device, i * 0.01)) for i, device in enumerate(devices)]
        [thread.start() for thread in threads]
        [thread.join() for thread in threads]
    time.sleep(8)
    last = start + (count - 1) * 20
    status, positions = admin.req('GET', '/api/positions')
    latest = {position['deviceId']: position for position in positions} if status == 200 else {}
    stuck = [device['name'] for device in devices
             if abs(time.mktime(time.strptime(latest.get(device['id'], {}).get('fixTime', '1970-01-01T00:00:00')[:19], '%Y-%m-%dT%H:%M:%S')) - time.timezone - last) > 1]
    check('every device ends with its last position', not stuck, stuck)
    for device in devices:
        send(device['uniqueId'], time.time(), -12.0, -77.0, 10)
    time.sleep(6)
    status, positions = admin.req('GET', '/api/positions')
    latest = {position['deviceId']: position for position in positions} if status == 200 else {}
    frozen = [device['name'] for device in devices if latest.get(device['id'], {}).get('latitude') != -12.0]
    check('devices keep accepting positions afterwards', not frozen, frozen)
    status, events = admin.req('GET', f'/api/reports/route?deviceId={devices[0]["id"]}&from={iso(start - 60)}&to={iso(time.time() + 60)}', headers={'Accept': 'application/json'})
    check('positions stored', status == 200 and len(events) >= count, len(events) if status == 200 else events)
    for device in devices:
        admin.req('DELETE', f'/api/devices/{device["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
