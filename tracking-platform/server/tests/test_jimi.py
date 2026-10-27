#!/usr/bin/env python3
"""
Prueba de extremo a extremo de las dashcams Jimi GT06 (JC400 / JC261) contra un servidor en marcha.
Uso: TRACCAR_URL=http://127.0.0.1:8082 ADMIN_EMAIL=... ADMIN_PASSWORD=... python3 test_jimi.py clip.mp4 cabina.jpg
"""
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jimi_simulator import JimiCamera, event_name  # noqa: E402
from test_dashcam import Client, check, results, wait_for  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
GT06_PORT = int(os.environ.get('GT06_PORT', '5023'))
UPLOAD_PORT = int(os.environ.get('JIMI_UPLOAD_PORT', '5262'))
IMEI = os.environ.get('JIMI_IMEI', '862798052429087')


def raw_request(method, url, data=None):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        return opener.open(urllib.request.Request(url, data=data, method=method), timeout=10).status
    except urllib.error.HTTPError as error:
        return error.code


def main(front, cabin):
    api = Client()
    email = os.environ.get('ADMIN_EMAIL', 'admin@test')
    password = os.environ.get('ADMIN_PASSWORD', 'secret123')
    status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    if status != 200:
        api.req('POST', '/api/users', {'name': 'admin', 'email': email, 'password': password})
        status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    check('login', status == 200, status)

    status, devices = api.req('GET', '/api/devices?uniqueId=' + IMEI)
    device = devices[0] if devices else api.req('POST', '/api/devices', {
        'name': 'JC400 Demo', 'uniqueId': IMEI, 'model': 'JC400',
        'attributes': {'dashcam.kind': 'dashcam', 'dashcam.protocol': 'jimi', 'dashcam.channels': 2}})[1]
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() - 120))

    cam = JimiCamera(HOST, GT06_PORT, IMEI)
    cam.login()
    names = [event_name(IMEI, 'F', 1) + '.mp4', event_name(IMEI, 'I', 2) + '.jpg']
    cam.alarm(0x93, names)

    def events(kind):
        until = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + 120))
        status, items = api.req('GET', f"/api/reports/events?deviceId={device['id']}&type={kind}&from={started}&to={until}")
        return items if status == 200 else []

    alarms = wait_for(lambda: events('alarm'))
    check('JC400 alarm event (accident)', alarms and alarms[0]['attributes'].get('alarm') == 'accident', alarms)
    alarm_position = api.req('GET', f"/api/positions?id={alarms[0]['positionId']}")[1][0] if alarms else {}
    check('alarm lists event files', alarm_position.get('attributes', {}).get('eventFiles') == ','.join(names),
          alarm_position.get('attributes'))
    check('alarm position decoded', abs(alarm_position.get('latitude', 0) + 12.0464) < 0.001
          and abs(alarm_position.get('longitude', 0) + 77.0428) < 0.001, alarm_position)

    for name, path in zip(names, [front, cabin]):
        with open(path, 'rb') as handle:
            check(f'upload {name[-6:]} accepted', cam.upload(UPLOAD_PORT, name, handle.read()) == 200)

    media = wait_for(lambda: len(events('media')) >= 2 and events('media'))
    check('two media events', media and len(media) == 2, media)
    positions = {p['attributes'].get('eventFile'): p for p in
                 (api.req('GET', f"/api/positions?id={e['positionId']}")[1][0] for e in media or [])}
    check('media linked to alarm files', set(positions) == set(names), list(positions))
    check('front is channel 1, cabin channel 2',
          positions.get(names[0], {}).get('attributes', {}).get('channel') == 1
          and positions.get(names[1], {}).get('attributes', {}).get('channel') == 2)
    for event in media or []:
        status, content = api.req('GET', f"/api/media/{IMEI}/{event['attributes']['file']}", raw=True)
        original = open(front if event['attributes']['media'] == 'video' else cabin, 'rb').read()
        check(f"{event['attributes']['media']} identical to original", status == 200 and content == original)

    check('unknown IMEI rejected', raw_request('POST', f'http://{HOST}:{UPLOAD_PORT}/upload/000000000000001',
                                               b'x') == 404)
    check('GET rejected', raw_request('GET', f'http://{HOST}:{UPLOAD_PORT}/upload/{IMEI}') == 405)

    status, types = api.req('GET', f"/api/commands/types?deviceId={device['id']}")
    check('custom commands still offered (main session kept)', 'custom' in {t['type'] for t in types}, types)
    status, _ = api.req('POST', '/api/commands/send', {
        'deviceId': device['id'], 'type': 'custom', 'attributes': {'data': 'RTMP,ON,INOUT'}})
    check('live video text command sent', status == 200, status)
    received = wait_for(lambda: not cam.commands.empty() and cam.commands.get())
    check('camera received RTMP,ON,INOUT', received == 'RTMP,ON,INOUT', received)
    cam.close()

    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:3]))
