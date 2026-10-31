#!/usr/bin/env python3
"""
Prueba de extremo a extremo de los campos personalizados de logística: definición por el gerente (texto, número,
fecha, lista, casilla; del pedido o de la entrega; obligatorios, visibles al cliente, por tipo de pedido), herencia
a su rama, validación al crear pedidos y al entregar, valores en la parada y en el pedido, y lo que ve el cliente.

Uso: TRACCAR_URL=http://127.0.0.1:8082 ADMIN_EMAIL=... ADMIN_PASSWORD=... python3 test_custom_fields.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import Client, check, results  # noqa: E402
from test_operations import iso, login  # noqa: E402

FIELDS = [
    {'key': 'factura', 'label': 'N.° de factura', 'type': 'text', 'scope': 'order', 'required': True, 'showToCustomer': True},
    {'key': 'condicion', 'label': 'Condición de la carga', 'type': 'select', 'scope': 'delivery', 'required': True, 'options': ['Bueno', 'Dañado']},
    {'key': 'temperatura', 'label': 'Temperatura', 'type': 'number', 'scope': 'delivery', 'types': ['delivery']},
    {'key': 'instalado', 'label': 'Equipo instalado', 'type': 'checkbox', 'scope': 'delivery', 'required': True, 'types': ['service']},
    {'key': 'vence', 'label': 'Vencimiento', 'type': 'date', 'scope': 'order'},
]


def main():
    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    password = 'Campos2026!'
    status, manager = admin.req('POST', '/api/users', {'name': f'Empresa {suffix}', 'email': f'emp-{suffix}@test', 'password': password,
                                                       'userLimit': 5, 'deviceLimit': 5, 'attributes': {'plan': 'reseller'}})
    company, _ = login(f'emp-{suffix}@test', password)
    status, worker = company.req('POST', '/api/users', {'name': f'Operador {suffix}', 'email': f'op-{suffix}@test', 'password': password})
    operator, _ = login(f'op-{suffix}@test', password)

    status, _ = company.req('PUT', '/api/dispatch/fields', [{'key': 'lista', 'label': 'Lista sin opciones', 'type': 'select', 'scope': 'order'}])
    check('list without options rejected', status == 400, status)
    status, _ = company.req('PUT', '/api/dispatch/fields', [{'key': 'Mal Clave', 'label': 'X', 'type': 'text', 'scope': 'order'}])
    check('invalid key rejected', status == 400, status)
    status, saved = company.req('PUT', '/api/dispatch/fields', FIELDS)
    check('manager defines fields', status == 200 and len(saved['fields']) == 5 and saved['editable'] is True, saved)
    status, inherited = operator.req('GET', '/api/dispatch/fields')
    check('branch inherits the fields', status == 200 and [f['key'] for f in inherited['fields']] == [f['key'] for f in FIELDS]
          and inherited['editable'] is False, inherited)
    status, _ = operator.req('PUT', '/api/dispatch/fields', FIELDS)
    check('non managers cannot define fields', status in (400, 401, 403), status)

    base = {'name': 'Cliente campos', 'latitude': -12.06, 'longitude': -77.04}
    status, _ = operator.req('POST', '/api/dispatch/orders', [base])
    check('required order field enforced', status == 400, status)
    status, orders = operator.req('POST', '/api/dispatch/orders', [{**base, 'custom': {'factura': 'F001-778', 'vence': '2026-12-31'},
                                                                    'attributes': {'custom.inventado': 'x'}}])
    order = orders[0] if status == 200 else {}
    check('order with custom values', status == 200 and order['attributes'].get('custom.factura') == 'F001-778'
          and order['attributes'].get('custom.vence') == '2026-12-31' and 'custom.inventado' not in order['attributes'], order)
    status, service = company.req('POST', '/api/dispatch/orders', [{**base, 'name': 'Instalación', 'type': 'service', 'custom': {'factura': 'F001-779'}}])

    status, device = company.req('POST', '/api/devices', {'name': f'Camión {suffix}', 'uniqueId': f'cf-{suffix}'})
    status, plan = company.req('POST', '/api/dispatch/plan', {'orderIds': [order['id'], service[0]['id']], 'vehicles': [
        {'deviceId': device['id'], 'shiftStart': iso(time.time()), 'shiftEnd': iso(time.time() + 8 * 3600)}]})
    status, trips = company.req('POST', '/api/dispatch/plan/commit', {'routes': plan['routes']})
    trip = trips[0] if status == 200 else {}
    stops = {s['attributes'].get('custom.factura'): s for s in trip.get('stops', [])}
    delivery = stops.get('F001-778', {})
    check('stops carry the order values', delivery.get('attributes', {}).get('custom.vence') == '2026-12-31', delivery.get('attributes'))

    anonymous = Client()
    token = trip['driverToken']
    status, _ = anonymous.req('POST', f'/api/dispatch/driver/{token}/stops/{delivery["id"]}', {'status': 'delivered'})
    check('required delivery field enforced', status == 400, status)
    status, _ = anonymous.req('POST', f'/api/dispatch/driver/{token}/stops/{delivery["id"]}', {'status': 'delivered', 'custom': {'condicion': 'Malo'}})
    check('list options enforced', status == 400, status)
    status, _ = anonymous.req('POST', f'/api/dispatch/driver/{token}/stops/{delivery["id"]}', {'status': 'delivered', 'custom': {'condicion': 'Bueno', 'temperatura': 'frío'}})
    check('numbers enforced', status == 400, status)
    status, result = anonymous.req('POST', f'/api/dispatch/driver/{token}/stops/{delivery["id"]}', {'status': 'delivered', 'custom': {'condicion': 'Bueno', 'temperatura': '4,5'}})
    stop = next((s for s in result.get('stops', []) if s['id'] == delivery['id']), {}) if status == 200 else {}
    check('delivery with custom values', status == 200 and stop['attributes'].get('custom.condicion') == 'Bueno'
          and stop['attributes'].get('custom.temperatura') == 4.5, stop.get('attributes'))
    status, delivered = operator.req('GET', '/api/dispatch/orders?status=delivered')
    synced = next((o for o in delivered if o['id'] == order['id']), {}) if status == 200 else {}
    check('values copied to the order', synced.get('attributes', {}).get('custom.condicion') == 'Bueno', synced.get('attributes'))

    install = stops.get('F001-779', {})
    status, _ = anonymous.req('POST', f'/api/dispatch/driver/{token}/stops/{install["id"]}', {'status': 'delivered', 'custom': {'condicion': 'Bueno'}})
    check('fields only for their order type (service checkbox required)', status == 400, status)
    status, result = anonymous.req('POST', f'/api/dispatch/driver/{token}/stops/{install["id"]}', {'status': 'delivered', 'custom': {'condicion': 'Bueno', 'instalado': True, 'temperatura': 9}})
    stop = next((s for s in result.get('stops', []) if s['id'] == install['id']), {}) if status == 200 else {}
    check('service fields stored, delivery-only fields ignored', status == 200 and stop['attributes'].get('custom.instalado') is True
          and 'custom.temperatura' not in stop['attributes'], stop.get('attributes'))

    status, tracking = anonymous.req('GET', f'/api/dispatch/track/{delivery["trackingToken"]}')
    check('customer sees only the visible fields', status == 200 and tracking['fields'] == [{'label': 'N.° de factura', 'type': 'text', 'value': 'F001-778'}], tracking.get('fields'))

    for item in company.req('GET', '/api/dispatch/trips')[1]:
        company.req('DELETE', f'/api/dispatch/trips/{item["id"]}')
    for item in (order, service[0]):
        company.req('DELETE', f'/api/dispatch/orders/{item["id"]}')
    admin.req('DELETE', f'/api/devices/{device["id"]}')
    admin.req('DELETE', f'/api/users/{worker["id"]}')
    admin.req('DELETE', f'/api/users/{manager["id"]}')
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
