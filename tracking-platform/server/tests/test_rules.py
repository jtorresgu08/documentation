#!/usr/bin/env python3
"""
Prueba de extremo a extremo de los sensores tipo Wialon y las alertas personalizadas: sensores con fórmula, bits,
validación y acumulación calculados por el servidor (y su vista previa), alertas por valor de sensor (por nombre),
velocidad con condición adicional, entrada digital (solo al cambiar), horario, evento SOS, máximo por día, "probar
ahora", historial, permisos y borrado.

Uso (servidor con osmand.port=5055): TRACCAR_URL=http://127.0.0.1:8082 python3 test_rules.py
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402
from test_operations import login, send  # noqa: E402


def wait_events(api, rule_id, count, timeout=20):
    end = time.time() + timeout
    events = []
    while time.time() < end:
        events = api.req('GET', f'/api/alert-rules/events?ruleId={rule_id}&days=1')[1]
        if len(events) >= count:
            break
        time.sleep(1)
    return events


def main():
    api, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    uid = f'rules-{suffix}'
    sensors = [
        {'id': 'ign', 'name': 'Ignición', 'type': 'ignition', 'source': 'in1'},
        {'id': 'temp', 'name': 'Temperatura cámara', 'type': 'temperature', 'formula': 'temp1 * 0.1', 'unit': '°C',
         'lowerBound': -40, 'upperBound': 60},
        {'id': 'door', 'name': 'Puerta de carga', 'type': 'door', 'formula': 'io1:2'},
        {'id': 'fuel', 'name': 'Combustible', 'type': 'fuel', 'source': 'adc1', 'multiplier': 0.1,
         'validatorId': 'ign', 'validation': 'nonZero'},
        {'id': 'hours', 'name': 'Horas relativas', 'type': 'engineHoursRelative', 'source': 'in1', 'accumulate': 'time'},
    ]
    device = api.req('POST', '/api/devices', {'name': f'Reglas {suffix}', 'uniqueId': uid,
                                              'attributes': {'sensors': json.dumps(sensors)}})[1]
    now = time.time()
    send(uid, now - 300, -12.05, -77.05, 0, in1='true', temp1=50, io1=4, adc1=1500)
    time.sleep(1)
    send(uid, now - 120, -12.05, -77.05, 0, in1='true', temp1=52, io1=4, adc1=1490)
    deadline = time.time() + 20
    position = {}
    while time.time() < deadline:
        positions = api.req('GET', f'/api/positions?deviceId={device["id"]}')[1]
        position = positions[0] if positions else {}
        if position.get('attributes', {}).get('sensor.temp') == 5.2:
            break
        time.sleep(1)
    attributes = position.get('attributes', {})
    check('formula sensor computed', attributes.get('sensor.temp') == 5.2, attributes)
    check('bit sensor computed', attributes.get('sensor.door') == 1.0, attributes)
    check('validated sensor computed', attributes.get('sensor.fuel') == 149.0, attributes)
    check('relative engine hours accumulated', abs(attributes.get('sensor.hours', 0) - 0.05) < 0.01, attributes)

    status, preview = api.req('POST', '/api/sensors/preview', {'deviceId': device['id'], 'sensors': json.dumps(
        sensors + [{'id': 'bad', 'name': 'Mala', 'type': 'numeric', 'formula': 'temp1 *'}])})
    check('preview values and history', status == 200 and preview['values'].get('temp') == 5.2
          and len(preview['history']) >= 2 and 'temp1' in preview['parameters'], preview)
    check('preview formula error', 'bad' in preview.get('errors', {}), preview.get('errors'))

    def rule(name, config):
        base = {'deviceIds': [device['id']], 'severity': 'high', 'channels': ['web'], 'cooldown': 0}
        status, created = api.req('POST', '/api/alert-rules', {
            'name': name, 'enabled': True, 'config': json.dumps({**base, **config}), 'attributes': {}})
        return status, created

    status, cold = rule('Cadena de frío', {'type': 'sensor', 'severity': 'critical',
                                           'condition': {'sensorName': 'temperatura cámara', 'op': 'outside', 'min': 2, 'max': 8},
                                           'message': '{unit}: temperatura {detail}'})
    check('sensor rule created', status == 200 and cold.get('id'), cold)
    status, speed = rule('Exceso 60', {'type': 'speed', 'condition': {'limit': 60}, 'maxPerDay': 1,
                                       'extra': [{'kind': 'ignition', 'state': 'on'}]})
    status, door = rule('Puerta abierta', {'type': 'digital', 'condition': {'sensorType': 'door', 'state': 'on'}})
    status, sos = rule('SOS', {'type': 'event', 'severity': 'critical', 'condition': {'events': ['alarm:sos']}})
    status, night = rule('Solo de madrugada', {'type': 'speed', 'condition': {'limit': 10},
                                               'schedule': {'days': [1, 2, 3, 4, 5, 6, 7], 'from': '00:00',
                                                            'to': '23:59', 'invert': True}})
    status, bad = api.req('POST', '/api/alert-rules', {'name': 'x', 'config': json.dumps({'type': 'nope'}), 'attributes': {}})
    check('unknown rule type rejected', status == 400, status)

    status, tested = api.req('POST', '/api/alert-rules/test', {'name': 't', 'config': json.dumps({
        'deviceIds': [device['id']], 'type': 'sensor', 'condition': {'sensorName': 'Temperatura cámara', 'op': 'lt', 'value': 6}}),
        'attributes': {}})
    check('test now finds the unit', status == 200 and tested['matching'] == 1 and tested['units'][0]['holds'], tested)

    # the door was already open when the rule started: no alert until it closes and opens again
    t = time.time()
    send(uid, t, -12.05, -77.05, 0, in1='true', temp1=95, io1=4, adc1=1480)
    events = wait_events(api, cold['id'], 1)
    check('sensor out of range fires once', len(events) == 1 and 'temperatura 9.50' in events[0]['attributes']['message']
          and events[0]['attributes']['severity'] == 'critical', [e['attributes'] for e in events])
    check('door already open does not fire', wait_events(api, door['id'], 1, 3) == [])
    send(uid, t + 20, -12.05, -77.05, 0, in1='true', temp1=96, io1=0, adc1=1480)
    time.sleep(1)
    send(uid, t + 40, -12.05, -77.05, 0, in1='true', temp1=97, io1=4, adc1=1480)
    check('door opening fires', len(wait_events(api, door['id'], 1)) == 1)
    check('sensor rule does not repeat in the same episode', len(wait_events(api, cold['id'], 2, 3)) == 1)

    send(uid, t + 60, -12.04, -77.05, 80, in1='true', temp1=50, io1=0, adc1=1480)
    check('speed with ignition fires', len(wait_events(api, speed['id'], 1)) == 1)
    send(uid, t + 80, -12.03, -77.05, 20, in1='true', temp1=50, io1=0, adc1=1480)
    time.sleep(1)
    send(uid, t + 100, -12.02, -77.05, 85, in1='true', temp1=50, io1=0, adc1=1480)
    check('daily maximum respected', len(wait_events(api, speed['id'], 2, 4)) == 1)
    check('outside-schedule rule silent all day', wait_events(api, night['id'], 1, 2) == [])

    send(uid, t + 120, -12.02, -77.05, 0, in1='true', temp1=50, alarm='sos')
    events = wait_events(api, sos['id'], 1)
    check('SOS event rule fires', len(events) == 1 and events[0]['attributes']['ruleName'] == 'SOS', events)

    status, rules = api.req('GET', '/api/alert-rules')
    counts = {item['name']: item['week'] for item in rules}
    check('rules list with weekly counts', counts.get('Cadena de frío') == 1 and counts.get('SOS') == 1, counts)
    status, alerts = api.req('GET', f'/api/alerts?deviceId={device["id"]}&from={time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t - 600))}'
                                    f'&to={time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 60))}&type=ruleTriggered')
    check('custom alerts in the alert center with their priority', status == 200 and any(
        item['severity'] == 'critical' for item in alerts), [(a.get('severity'), a['attributes'].get('ruleName')) for a in alerts])

    other = Client()
    other_email = f'rules-{suffix}@test'
    api.req('POST', '/api/users', {'name': 'Otro', 'email': other_email, 'password': 'secret123'})
    other.req('POST', '/api/session', form={'email': other_email, 'password': 'secret123'})
    status, _ = other.req('PUT', f'/api/alert-rules/{cold["id"]}', {'name': 'x', 'enabled': False, 'config': '{"type":"speed"}', 'attributes': {}})
    check('other user cannot change the rule', status == 404, status)
    status, foreign = other.req('POST', '/api/alert-rules', {'name': 'x', 'enabled': True, 'attributes': {},
                                                            'config': json.dumps({'type': 'speed', 'deviceIds': [device['id']]})})
    check('rule on a unit without access rejected', status in (400, 403), status)

    cold_config = json.loads(cold['config'])
    status, _ = api.req('PUT', f'/api/alert-rules/{cold["id"]}', {'name': 'Cadena de frío', 'enabled': False,
                                                                  'config': json.dumps(cold_config), 'attributes': {}})
    check('rule paused', status == 200)
    for item in (cold, speed, door, sos, night):
        api.req('DELETE', f'/api/alert-rules/{item["id"]}')
    status, rules = api.req('GET', '/api/alert-rules')
    check('rules deleted', status == 200 and not any(item['id'] == cold['id'] for item in rules))
    api.req('DELETE', f'/api/devices/{device["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
