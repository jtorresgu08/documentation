#!/usr/bin/env python3
"""
Prueba de la retención de almacenamiento: borra lo mayor a 365 días, compacta posiciones de más de 30 días sin perder
eventos ni la forma del recorrido, recomprime fotos y videos y sobrescribe la multimedia más antigua al llegar al tope.

Requiere en traccar.xml (y ffmpeg instalado para los videos):
  retention.days=365, retention.compactDays=30, retention.compactInterval=30,
  retention.media.compressDays=7, retention.media.maxSize=0.005 (GB), media.path=<carpeta>
Uso: TRACCAR_URL=http://127.0.0.1:8082 MEDIA_PATH=./media python3 test_retention.py foto.jpg
"""
import io
import os
import random
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402

BASE = os.environ.get('TRACCAR_URL', 'http://127.0.0.1:8082')
HOST = urllib.parse.urlparse(BASE).hostname
OSMAND_PORT = int(os.environ.get('OSMAND_PORT', '5055'))
MEDIA = os.environ.get('MEDIA_PATH', './media')
UNIQUE_ID = 'retention-001'
DAY = 86400
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def iso(seconds):
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(seconds))


def send(moment, lat, lon, speed, course=0, **extra):
    query = urllib.parse.urlencode({'id': UNIQUE_ID, 'timestamp': int(moment), 'lat': f'{lat:.6f}',
                                    'lon': f'{lon:.6f}', 'speed': speed / 1.852, 'bearing': course, **extra})
    opener.open(f'http://{HOST}:{OSMAND_PORT}/?{query}').read()


def drive(start, seconds, speed, lat, course=0, ignition='true'):
    for second in range(seconds):
        lat += speed / 3.6 / 111320
        send(start + second, lat, -77.0, speed, course, ignition=ignition)
    return lat


def media_file(name, data, age_days):
    path = os.path.join(MEDIA, UNIQUE_ID, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as handle:
        handle.write(data)
    moment = time.time() - age_days * DAY
    os.utime(path, (moment, moment))
    return path


def big_jpeg():
    from PIL import Image, ImageDraw
    image = Image.new('RGB', (2560, 1440))
    draw = ImageDraw.Draw(image)
    rng = random.Random(1)
    for _ in range(400):
        x, y = rng.randint(0, 2500), rng.randint(0, 1400)
        draw.rectangle([x, y, x + rng.randint(20, 200), y + rng.randint(20, 200)],
                       fill=(rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255)))
    output = io.BytesIO()
    image.save(output, 'JPEG', quality=97)
    return output.getvalue()


def main(photo):
    api = Client()
    email, password = os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123')
    status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    if status != 200:
        api.req('POST', '/api/users', {'name': 'admin', 'email': email, 'password': password})
        status, _ = api.req('POST', '/api/session', form={'email': email, 'password': password})
    check('login', status == 200, status)
    device = api.req('POST', '/api/devices', {'name': 'Retención', 'uniqueId': UNIQUE_ID})[1]
    now = time.time()

    # history in time order: 400 days ago (expires), 60 days ago (compacted), 10 days ago (kept as is), now
    old = now - 400 * DAY
    drive(old, 100, 40, -12.3)
    send(old + 200, -12.3, -77.0, 0, alarm='sos')
    month2 = now - 60 * DAY
    lat = drive(month2, 1800, 50, -12.2)                     # 30 min driving at 1 s
    lat = drive(month2 + 1800, 600, 50, lat, course=90)      # turn
    send(month2 + 2400, lat, -77.0, 0, alarm='sos', ignition='false')
    drive(month2 + 2401, 3600, 0, lat, course=90, ignition='false')  # 1 h parked
    recent = now - 10 * DAY
    drive(recent, 600, 50, -12.1)
    send(now - 60, -12.05, -77.0, 0, ignition='false')
    time.sleep(3)

    def count(start, end):
        status, items = api.req('GET', f"/api/positions?deviceId={device['id']}&from={iso(start)}&to={iso(end)}")
        return len(items) if status == 200 else -1

    before_month2 = count(month2 - 60, month2 + 7000)
    before_recent = count(recent - 60, recent + 700)
    check('history stored', count(old - 60, old + 300) == 101 and before_month2 == 6001 and before_recent == 600,
          (count(old - 60, old + 300), before_month2, before_recent))

    def distance():
        status, summary = api.req('GET', f"/api/reports/summary?deviceId={device['id']}"
                                         f"&from={iso(month2 - 60)}&to={iso(month2 + 7000)}")
        return summary[0]['distance'] if status == 200 and summary else None

    distance_before = distance()

    # media: expired, compressible photo and video, recent photo, and old fillers over the size limit
    if os.path.isdir(os.path.join(MEDIA, UNIQUE_ID)):
        shutil.rmtree(os.path.join(MEDIA, UNIQUE_ID))
    expired = media_file('expired.jpg', open(photo, 'rb').read(), 400)
    large = big_jpeg()
    big = media_file('evento-grande.jpg', large, 10)
    video_path = os.path.join(MEDIA, UNIQUE_ID, 'clip-alta.mp4')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=25',
                    '-t', '4', '-c:v', 'libx264', '-crf', '12', video_path], check=True)
    video_size = os.path.getsize(video_path)
    os.utime(video_path, (now - 9 * DAY, now - 9 * DAY))
    fillers = [media_file(f'relleno-{i}.bin', os.urandom(1024 * 1024), 200 - i) for i in range(6)]
    recent_photo = media_file('reciente.jpg', large, 1)

    status, report = api.req('POST', '/api/system/retention')
    check('retention run', status == 200 and 'error' not in report, report)
    print('report:', report)

    check('expired positions deleted', count(old - 60, old + 300) == 0, count(old - 60, old + 300))
    check('expired events deleted', report.get('eventsExpired', 0) >= 1, report)
    after_month2 = count(month2 - 60, month2 + 7000)
    check('old history compacted (>95% smaller)', 0 < after_month2 < before_month2 * 0.05, (after_month2, before_month2))
    check('recent history untouched', count(recent - 60, recent + 700) == 600, count(recent - 60, recent + 700))

    status, positions = api.req('GET', f"/api/positions?deviceId={device['id']}&from={iso(month2 - 60)}&to={iso(month2 + 7000)}")
    times = [p['fixTime'] for p in positions]
    alarms = [p for p in positions if p['attributes'].get('alarm') == 'sos']
    check('alarm position kept', len(alarms) == 1, alarms)
    status, events = api.req('GET', f"/api/reports/events?deviceId={device['id']}&type=alarm&from={iso(month2 - 60)}&to={iso(month2 + 7000)}")
    check('alarm event still points to its position', events and events[0]['positionId'] == alarms[0]['id'], events)
    check('turn kept', any(p['course'] == 90 and p['speed'] > 0 for p in positions), times[:5])
    check('distance preserved in reports', distance_before and abs(distance() - distance_before) < distance_before * 0.01,
          (distance(), distance_before))
    status, current = api.req('GET', f"/api/positions?id={api.req('GET', '/api/devices?id=' + str(device['id']))[1][0]['positionId']}")
    check('current position kept', status == 200 and len(current) == 1, current)

    check('expired photo deleted', not os.path.exists(expired))
    check('large photo recompressed', os.path.exists(big) and os.path.getsize(big) < len(large) * 0.6,
          (os.path.exists(big) and os.path.getsize(big), len(large)))
    check('recompressed photo keeps its date', os.path.exists(big) and abs(os.path.getmtime(big) - (now - 10 * DAY)) < 300)
    check('video recompressed with ffmpeg', os.path.getsize(video_path) < video_size * 0.9,
          (os.path.getsize(video_path), video_size))
    check('recent photo untouched', os.path.getsize(recent_photo) == len(large))
    check('oldest media overwritten over the limit', not os.path.exists(fillers[0]) and os.path.exists(fillers[-1]),
          [os.path.exists(f) for f in fillers])
    check('media folder under the limit', report.get('mediaSize', 1 << 40) <= 0.005 * 1024 ** 3, report)

    status, again = api.req('POST', '/api/system/retention')
    check('second run is incremental', again.get('positionsCompacted') == 0 and again.get('mediaCompressed') == 0, again)
    status, info = api.req('GET', '/api/system/status')
    check('status shows retention', info['retention']['days'] == 365 and info['retention']['last']['start'] > 0,
          info.get('retention'))

    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main(sys.argv[1])
