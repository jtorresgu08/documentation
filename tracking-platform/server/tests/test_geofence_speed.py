#!/usr/bin/env python3
"""
Prueba de extremo a extremo del límite de velocidad propio de las geocercas: alertas al llegar a leve y cada vez que
empeora (peligroso, crítico) con su prioridad en el centro de alertas, sin alerta dentro de la tolerancia, alertas
desactivables por geocerca, y el reporte de criticidad (episodios, puntos por nivel, por geocerca y ranking).

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_geofence_speed.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import iso, login, send  # noqa: E402


def main():
    api, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    uid = f'gspeed-{suffix}'
    device = api.req('POST', '/api/devices', {'name': f'Zona escolar {suffix}', 'uniqueId': uid})[1]
    status, geofence = api.req('POST', '/api/geofences', {'name': f'Colegio {suffix}', 'area': 'CIRCLE (-12.1000 -77.0300, 800)',
                                                         'attributes': {'speedLimitKmh': 40}})
    check('geofence with own limit', status == 200 and geofence['attributes']['speedLimitKmh'] == 40, geofence)
    api.req('POST', '/api/permissions', {'deviceId': device['id'], 'geofenceId': geofence['id']})

    start = time.time() - 600
    speeds = [35, 44, 47, 52, 58, 50, 38, 46]
    for index, speed in enumerate(speeds):
        send(uid, start + index * 20, -12.1000 + index * 0.0002, -77.0300, speed)
        time.sleep(0.7)
    send(uid, start + 200, -12.2000, -77.0300, 90)  # outside the geofence
    deadline = time.time() + 20
    events = []
    while time.time() < deadline:
        events = api.req('GET', f'/api/reports/events?deviceId={device["id"]}&type=geofenceOverspeed'
                                f'&from={iso(start - 60)}&to={iso(time.time() + 60)}')[1]
        if len(events) >= 4:
            break
        time.sleep(1)
    levels = [event['attributes'].get('level') for event in events]
    check('alerts on mild and when it gets worse, not in tolerance', levels == ['mild', 'danger', 'critical', 'mild'], levels)
    first = events[0]['attributes'] if events else {}
    check('alert details', first.get('speedLimit') == 40 and first.get('excess') == 7 and first.get('speed') == 47
          and events[0].get('geofenceId') == geofence['id'], events[:1])
    status, types = api.req('GET', '/api/notifications/types')
    check('notification type available', any(item['type'] == 'geofenceOverspeed' for item in types), types)
    status, alerts = api.req('GET', f'/api/alerts?deviceId={device["id"]}&type=geofenceOverspeed'
                                    f'&from={iso(start - 60)}&to={iso(time.time() + 60)}')
    severities = sorted(item['severity'] for item in alerts)
    check('priorities in the alert center', severities == ['critical', 'high', 'medium', 'medium'], severities)

    query = f'deviceId={device["id"]}&from={iso(start - 60)}&to={iso(time.time() + 60)}'
    status, report = api.req('GET', f'/api/geofence-speed/report?{query}')
    episodes = report.get('episodes', []) if status == 200 else []
    check('two speeding episodes', len(episodes) == 2, episodes)
    worst = next((item for item in episodes if item['level'] == 'critical'), {})
    check('critical episode with points per level', worst.get('maxSpeed') == 58 and worst.get('maxExcess') == 18
          and worst.get('points') == {'tolerance': 1, 'mild': 1, 'danger': 2, 'critical': 1}
          and worst.get('geofenceName') == f'Colegio {suffix}' and worst.get('speedLimit') == 40, worst)
    summary = report.get('summary', {})
    check('summary by level', summary.get('episodesByLevel', {}).get('critical') == 1
          and summary.get('episodesByLevel', {}).get('mild') == 1 and summary.get('pointsByLevel', {}).get('danger') == 2, summary)
    check('ranking score', report.get('units', [{}])[0].get('score') == 6, report.get('units'))
    status, only = api.req('GET', f'/api/geofence-speed/report?{query}&level=critical')
    check('level filter', status == 200 and [item['level'] for item in only['episodes']] == ['critical'], only.get('episodes'))

    geofence['attributes']['speedAlert'] = False
    api.req('PUT', f'/api/geofences/{geofence["id"]}', geofence)
    time.sleep(1)
    later = time.time()
    send(uid, later, -12.1000, -77.0300, 30)
    time.sleep(0.7)
    send(uid, later + 20, -12.1002, -77.0300, 70)
    time.sleep(4)
    events = api.req('GET', f'/api/reports/events?deviceId={device["id"]}&type=geofenceOverspeed'
                            f'&from={iso(start - 60)}&to={iso(time.time() + 60)}')[1]
    check('alerts can be turned off per geofence', len(events) == 4, len(events))
    status, report = api.req('GET', f'/api/geofence-speed/report?deviceId={device["id"]}&from={iso(start - 60)}&to={iso(time.time() + 60)}')
    check('report still counts speeding without alerts', status == 200 and len(report['episodes']) == 3, len(report.get('episodes', [])))

    api.req('DELETE', f'/api/devices/{device["id"]}')
    api.req('DELETE', f'/api/geofences/{geofence["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
