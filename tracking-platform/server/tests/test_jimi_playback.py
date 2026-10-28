#!/usr/bin/env python3
"""
Prueba de extremo a extremo de las grabaciones de las dashcams Jimi GT06 (JC400 / JC261): lista de la tarjeta por
FILELIST (subida HTTP en TXT o JSON), reproducción por nombre con REPLAYLIST y descarga de un minuto con HVIDEO.

Uso: TRACCAR_URL=http://127.0.0.1:8082 python3 test_jimi_playback.py clip.mp4
"""
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jimi_simulator import JimiCamera  # noqa: E402
from test_dashcam import Client, check, results, wait_for  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
GT06_PORT = int(os.environ.get('GT06_PORT', '5023'))
UPLOAD_PORT = int(os.environ.get('JIMI_UPLOAD_PORT', '5262'))
IMEI = '862798052420001'


def iso(seconds):
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(seconds))


def main(clip):
    api = Client()
    email, password = os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123')
    status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    if status != 200:
        api.req('POST', '/api/users', {'name': 'admin', 'email': email, 'password': password})
        status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    check('login', status == 200, status)

    status, devices = api.req('GET', '/api/devices?uniqueId=' + IMEI)
    device = devices[0] if devices else api.req('POST', '/api/devices', {
        'name': 'JC400 Grabaciones', 'uniqueId': IMEI, 'model': 'JC400',
        'attributes': {'dashcam.kind': 'dashcam', 'dashcam.protocol': 'jimi', 'dashcam.channels': 2,
                       'decoder.timezone': 'GMT-5'}})[1]
    now = time.time()
    period = f"deviceId={device['id']}&from={iso(now - 6 * 3600)}&to={iso(now + 60)}"

    status, body = api.req('GET', '/api/video/recordings?channel=0&' + period)
    check('offline camera answers 409', status == 409, (status, body))

    cam = JimiCamera(HOST, GT06_PORT, IMEI)
    cam.log = lambda *args: None
    cam.login()
    cam.start_storage(clip, UPLOAD_PORT, tz_offset=-5)  # files named in Lima time
    time.sleep(1)

    status, items = api.req('GET', '/api/video/recordings?channel=0&' + period)
    check('recordings from the FILELIST upload (TXT)', status == 200 and len(items) == 4, (status, items))
    if status != 200:
        return
    check('FILELIST command sent to the camera', not cam.commands.empty() and 'FILELIST' in list(cam.commands.queue))
    check('one-minute files joined into hour blocks',
          all(len(item['files']) == 60 and item['end'] - item['start'] == 3600000 for item in items), items[0])
    first = min(items, key=lambda item: item['start'])
    check('file names converted from the device timezone', abs(first['start'] / 1000 - (now - 3 * 3600)) < 120,
          (first['start'], now - 3 * 3600))
    check('road and cabin cameras', sorted({item['channel'] for item in items}) == [1, 2], items)

    status, cabin = api.req('GET', '/api/video/recordings?channel=2&' + period)
    check('camera filter', status == 200 and len(cabin) == 2 and {i['channel'] for i in cabin} == {2}, cabin)
    status, recent = api.req('GET', f"/api/video/recordings?deviceId={device['id']}&channel=1"
                                    f"&from={iso(now - 3600)}&to={iso(now)}")
    check('period filter', status == 200 and len(recent) == 1, recent)

    cam.storage['format'] = 'json'
    status, again = api.req('GET', '/api/video/recordings?channel=0&' + period)
    check('recordings from a JSON upload', status == 200 and len(again) == 4, (status, again))

    # playback: the web panel sends REPLAYLIST with up to eight files from the chosen minute
    block = recent[0]
    batch = block['files'][10:18]
    status, _ = api.req('POST', '/api/commands/send', {
        'deviceId': device['id'], 'type': 'custom', 'attributes': {'data': 'REPLAYLIST,' + ','.join(batch)}})
    replay = wait_for(lambda: cam.replays and cam.replays[-1], 10)
    check('REPLAYLIST reaches the camera with the file names', replay == batch, replay)

    # download a minute: HVIDEO makes the camera upload that file to the media gallery
    started = iso(time.time() - 5)
    name = block['files'][20]
    status, _ = api.req('POST', '/api/commands/send', {
        'deviceId': device['id'], 'type': 'custom', 'attributes': {'data': f'HVIDEO,{name[:19]},1'}})
    hvideo = wait_for(lambda: cam.hvideos and cam.hvideos[-1], 10)
    check('HVIDEO reaches the camera', hvideo == [name[:19], '1'], hvideo)

    def media():
        until = iso(time.time() + 60)
        status, items = api.req('GET', f"/api/reports/events?deviceId={device['id']}&type=media&from={started}&to={until}")
        return items if status == 200 else []

    events = wait_for(lambda: media(), 20)
    check('downloaded minute in the media gallery', events and events[0]['attributes'].get('media') == 'video', events)
    if events:
        status, content = api.req('GET', f"/api/media/{IMEI}/{events[0]['attributes']['file']}", raw=True)
        check('video identical to the camera file', status == 200 and content == open(clip, 'rb').read())

    status, _ = api.req('POST', '/api/commands/send', {'deviceId': device['id'], 'type': 'custom',
                                                       'attributes': {'data': 'RTMP,ON,OUT'}})
    check('live command still works', status in (200, 202), status)
    cam.close()

    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main(sys.argv[1])
