#!/usr/bin/env python3
"""
Prueba de extremo a extremo del soporte de dashcams JT/T 808 contra un servidor en marcha.

Requiere en traccar.xml:  huabao.attachmentServer=127.0.0.1:5261  y  huabao.videoServer=127.0.0.1:7611
Uso: TRACCAR_URL=http://127.0.0.1:8082 ADMIN_EMAIL=... ADMIN_PASSWORD=... \
     python3 test_dashcam.py foto.jpg clip.mp4 cabina.jpg
"""
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dashcam_simulator import Dashcam  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
JT808_PORT = int(os.environ.get('JT808_PORT', '5015'))
PHONE = os.environ.get('DASHCAM_PHONE', '013912345678')
results = []


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), urllib.request.ProxyHandler({}))

    def req(self, method, path, body=None, form=None, raw=False):
        data, headers = None, {}
        if body is not None:
            data, headers = json.dumps(body).encode(), {'Content-Type': 'application/json'}
        if form is not None:
            data, headers = urllib.parse.urlencode(form).encode(), {'Content-Type': 'application/x-www-form-urlencoded'}
        request = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
        try:
            response = self.opener.open(request)
            content = response.read()
            if raw:
                return response.status, content
            return response.status, json.loads(content) if content else None
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode()[:300]


def check(name, condition, detail=''):
    results.append((name, condition))
    print(('PASS ' if condition else 'FAIL ') + name + ('' if condition else f' -- {detail}'))


def wait_for(fn, timeout=20):
    end = time.time() + timeout
    value = fn()
    while not value and time.time() < end:
        time.sleep(1)
        value = fn()
    return value


def main(image, video, cabin):
    api = Client()
    email = os.environ.get('ADMIN_EMAIL', 'admin@test')
    password = os.environ.get('ADMIN_PASSWORD', 'secret123')
    status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    if status != 200:
        api.req('POST', '/api/users', {'name': 'admin', 'email': email, 'password': password})
        status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    check('login', status == 200, status)

    status, devices = api.req('GET', '/api/devices?uniqueId=' + PHONE)
    device = devices[0] if devices else api.req('POST', '/api/devices', {'name': 'Dashcam ABC-123', 'uniqueId': PHONE, 'model': 'JT1078'})[1]
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() - 60))

    cam = Dashcam(HOST, JT808_PORT, PHONE)
    cam.register()
    cam.report()
    check('position received', wait_for(lambda: api.req('GET', f"/api/positions?deviceId={device['id']}")[1]))

    def latest():
        return api.req('GET', f"/api/positions?id={api.req('GET', '/api/devices?id=' + str(device['id']))[1][0]['positionId']}")[1][0]

    cam.report(speed=0)
    first = wait_for(lambda: (p := latest())['speed'] == 0 and p)
    time.sleep(2)
    cam.report(speed=0)
    second = wait_for(lambda: (p := latest())['id'] != first['id'] and p)
    check('stopped period start carried over',
          second and second['attributes'].get('motionTime') == first['attributes'].get('motionTime'),
          (first['attributes'], second and second['attributes']))
    cam.report(speed=45)
    moving = wait_for(lambda: (p := latest())['attributes'].get('motion') and p)
    check('moving period starts again',
          moving and moving['attributes'].get('motionTime') > first['attributes'].get('motionTime'), moving)

    adas_number = cam.alarm('adas', 1, [(image, 0), (video, 2)])
    check('server requested ADAS attachments', bool(adas_number))
    check('ADAS attachments uploaded', [s for _, s in cam.files] == [0, 0], cam.files)
    dms_number = cam.alarm('dms', 2, [(cabin, 0)])
    check('DMS attachment uploaded', len(cam.files) == 3 and cam.files[-1][1] == 0, cam.files)

    def events(kind):
        until = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + 60))
        status, items = api.req('GET', f"/api/reports/events?deviceId={device['id']}&type={kind}&from={started}&to={until}")
        return items if status == 200 else []

    alarms = wait_for(lambda: len(events('alarm')) >= 2 and events('alarm'))
    names = sorted(e['attributes'].get('alarm') for e in alarms or [])
    check('ADAS and DMS alarm events', names == ['forwardCollision', 'phoneCall'], names)

    media = wait_for(lambda: len(events('media')) >= 3 and events('media'))
    check('three media events', media and len(media) >= 3, media)
    files = [e['attributes'].get('file') for e in media or []]
    kinds = sorted(e['attributes'].get('media') for e in media or [])
    check('image and video media types', kinds[:3] == ['image', 'image', 'video'], kinds)
    status, content = api.req('GET', f'/api/media/{PHONE}/{files[0]}', raw=True)
    check('media file downloadable', status == 200 and len(content) > 1000, status)
    with open(image, 'rb') as handle:
        original = handle.read()
    downloaded = [api.req('GET', f'/api/media/{PHONE}/{name}', raw=True)[1] for name in files]
    check('uploaded image identical to original', original in downloaded)

    positions = [api.req('GET', f"/api/positions?id={e['positionId']}")[1][0] for e in media]
    numbers = {p['attributes'].get('alarmNumber') for p in positions}
    check('media linked to alarm numbers', {adas_number, dms_number} <= numbers, numbers)
    check('media tagged with alarm name', {'forwardCollision', 'phoneCall'} <= {p['attributes'].get('mediaAlarm') for p in positions})

    cam.start_command_listener(image)
    status, types = api.req('GET', f"/api/commands/types?deviceId={device['id']}")
    type_names = {t['type'] for t in types}
    check('dashcam commands offered', {'requestPhoto', 'liveVideo', 'liveVideoStop'} <= type_names, type_names)
    status, _ = api.req('POST', '/api/commands/send', {'deviceId': device['id'], 'type': 'requestPhoto', 'attributes': {'index': 1}})
    check('photo command sent', status in (200, 202), status)
    check('photo arrived as media event', wait_for(lambda: len(events('media')) >= 4))
    status, _ = api.req('POST', '/api/commands/send', {'deviceId': device['id'], 'type': 'liveVideo', 'attributes': {'index': 2}})
    check('live video command sent', status in (200, 202), status)
    check('device asked to stream to video server', wait_for(lambda: ('127.0.0.1', 7611, 2) in cam.live_requests), cam.live_requests)
    api.req('POST', '/api/commands/send', {'deviceId': device['id'], 'type': 'liveVideoStop', 'attributes': {'index': 2}})
    check('live video stop delivered', wait_for(lambda: any(r[0] == 'stop' for r in cam.live_requests)), cam.live_requests)
    cam.close()

    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:4]))
