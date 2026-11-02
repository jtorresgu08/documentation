#!/usr/bin/env python3
"""
Prueba de extremo a extremo de la cobranza: configuración de cobro por cliente, factura mensual (unidades x precio
+ cargo fijo, una sola por mes), aviso al cliente, enlace de pago de Mercado Pago, factura vencida, suspensión
automática, pago notificado por Mercado Pago (verificado contra su API), reactivación, pago manual, anulación y
permisos.

Mercado Pago se simula con un servidor local en el puerto 18090; el servidor Traccar debe tener:
    billing.mercadoPago.accessToken = TEST-local-mock-token
    billing.mercadoPago.url = http://127.0.0.1:18090

Uso: TRACCAR_URL=http://127.0.0.1:8082 python3 test_billing.py
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_dashcam import check, results  # noqa: E402
from test_operations import login  # noqa: E402

TOKEN = os.environ.get('MP_TOKEN', 'TEST-local-mock-token')
preferences = []
payments = {}


class MercadoPagoMock(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if self.headers.get('Authorization') != f'Bearer {TOKEN}':
            self.reply(401, {'message': 'invalid token'})
            return False
        return True

    def do_POST(self):
        if not self.authorized():
            return
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        if self.path == '/checkout/preferences':
            preferences.append(body)
            pref = f'pref-{len(preferences)}'
            self.reply(201, {'id': pref, 'init_point': f'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id={pref}'})
        else:
            self.reply(404, {})

    def do_GET(self):
        if not self.authorized():
            return
        payment = payments.get(self.path.rsplit('/', 1)[-1]) if self.path.startswith('/v1/payments/') else None
        self.reply(200, payment) if payment else self.reply(404, {'message': 'not found'})


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 18090), MercadoPagoMock)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    admin, status = login(os.environ.get('ADMIN_EMAIL', 'admin@test'), os.environ.get('ADMIN_PASSWORD', 'secret123'))
    check('login', status == 200, status)
    suffix = str(int(time.time()))
    password = 'Cobro2026!'
    _, client_user = admin.req('POST', '/api/users', {'name': f'Transportes Cobro {suffix}', 'email': f'cobro-{suffix}@test', 'password': password})
    devices = []
    for index in range(2):
        _, device = admin.req('POST', '/api/devices', {'name': f'Unidad cobro {index} {suffix}', 'uniqueId': f'bill-{index}-{suffix}'})
        admin.req('POST', '/api/permissions', {'userId': client_user['id'], 'deviceId': device['id']})
        devices.append(device)

    settings = {'price': 30, 'fixedFee': 10, 'currency': 'PEN', 'day': 1, 'dueDays': 0, 'graceDays': 0, 'autoSuspend': True}
    status, saved = admin.req('PUT', f'/api/billing/clients/{client_user["id"]}', settings)
    check('billing settings saved', status == 200 and saved['price'] == 30 and saved['autoSuspend'] is True, saved)
    status, _ = admin.req('PUT', f'/api/billing/clients/{client_user["id"]}', {**settings, 'day': 31})
    check('billing day must be 1 to 28', status == 400, status)
    status, clients = admin.req('GET', '/api/billing/clients')
    row = next((c for c in clients if c['id'] == client_user['id']), {}) if status == 200 else {}
    check('client listed with its units', row.get('units') == 2 and row.get('billed') is True, row)

    status, invoice = admin.req('POST', f'/api/billing/clients/{client_user["id"]}/issue')
    check('invoice: 2 units x 30 + 10 fixed = 70', status == 200 and invoice['amount'] == 70 and invoice['units'] == 2 and invoice['status'] == 'pending', invoice)
    status, again = admin.req('POST', f'/api/billing/clients/{client_user["id"]}/issue')
    check('one invoice per month', status == 200 and again['id'] == invoice['id'], again)

    client, status = login(f'cobro-{suffix}@test', password)
    status, mine = client.req('GET', '/api/billing/me')
    check('the client sees its open invoice', status == 200 and [i['id'] for i in mine['open']] == [invoice['id']] and mine['mercadoPago'] is True, mine)
    status, _ = client.req('GET', '/api/billing/clients')
    check('a client cannot see the billing of others', status == 403, status)
    status, _ = client.req('PUT', f'/api/billing/invoices/{invoice["id"]}/paid', {'method': 'cash'})
    check('nor mark its own invoice as paid', status == 403, status)

    status, link = client.req('POST', f'/api/billing/invoices/{invoice["id"]}/checkout')
    check('Mercado Pago payment link', status == 200 and link['paymentUrl'].startswith('https://www.mercadopago.com.pe/'), link)
    sent = preferences[-1] if preferences else {}
    check('payment link for the invoice amount and reference', sent.get('external_reference') == f'invoice-{invoice["id"]}'
          and sent['items'][0]['unit_price'] == 70 and sent['items'][0]['currency_id'] == 'PEN'
          and sent.get('notification_url', '').endswith('/api/billing/mercadopago/webhook'), sent)
    client.req('POST', f'/api/billing/invoices/{invoice["id"]}/checkout')
    check('the link is created once', len(preferences) == 1, len(preferences))

    time.sleep(1.5)
    status, run = admin.req('POST', '/api/billing/run')
    check('billing run: overdue and suspended', status == 200 and run['overdue'] >= 1 and run['suspended'] >= 1, run)
    _, users = admin.req('GET', '/api/users')
    suspended = next(u for u in users if u['id'] == client_user['id'])
    check('the account is suspended', suspended['disabled'] is True and suspended['attributes'].get('billingSuspended') is True, suspended)
    _, status = login(f'cobro-{suffix}@test', password)
    check('a suspended client cannot log in', status != 200, status)

    status, _ = admin.req('POST', '/api/billing/mercadopago/webhook', {'type': 'payment', 'data': {'id': '1001'}})
    check('webhook of an unknown payment accepted (ignored)', status == 200, status)
    payments['1002'] = {'id': 1002, 'status': 'approved', 'external_reference': f'invoice-{invoice["id"]}', 'transaction_amount': 50, 'currency_id': 'PEN'}
    admin.req('POST', '/api/billing/mercadopago/webhook', {'type': 'payment', 'data': {'id': '1002'}})
    payments['1003'] = {'id': 1003, 'status': 'pending', 'external_reference': f'invoice-{invoice["id"]}', 'transaction_amount': 70, 'currency_id': 'PEN'}
    admin.req('POST', '/api/billing/mercadopago/webhook?type=payment&data.id=1003')
    _, listed = admin.req('GET', '/api/billing/invoices?status=overdue')
    check('a partial or pending payment does not pay the invoice', any(i['id'] == invoice['id'] for i in listed), [i['id'] for i in listed])

    payments['1004'] = {'id': 1004, 'status': 'approved', 'external_reference': f'invoice-{invoice["id"]}', 'transaction_amount': 70, 'currency_id': 'PEN'}
    status, _ = admin.req('POST', '/api/billing/mercadopago/webhook?type=payment&data.id=1004', {})
    _, listed = admin.req('GET', '/api/billing/invoices')
    paid = next((i for i in listed if i['id'] == invoice['id']), {})
    check('approved payment pays the invoice', paid.get('status') == 'paid' and paid.get('paymentMethod') == 'mercadopago' and paid.get('paymentRef') == '1004', paid)
    _, users = admin.req('GET', '/api/users')
    back = next(u for u in users if u['id'] == client_user['id'])
    check('the account is reactivated after paying', back['disabled'] is False and 'billingSuspended' not in back['attributes'], back)
    client, status = login(f'cobro-{suffix}@test', password)
    check('the client logs in again', status == 200, status)
    status, mine = client.req('GET', '/api/billing/me')
    check('no open invoices left', status == 200 and mine['open'] == [], mine)
    status, own = client.req('GET', '/api/billing/invoices')
    check('the client sees its invoice history', status == 200 and [i['id'] for i in own] == [invoice['id']], own)

    _, second_user = admin.req('POST', '/api/users', {'name': f'Cliente manual {suffix}', 'email': f'cobro2-{suffix}@test', 'password': password})
    admin.req('PUT', f'/api/billing/clients/{second_user["id"]}', {**settings, 'price': 0, 'fixedFee': 99.9, 'autoSuspend': False})
    _, second = admin.req('POST', f'/api/billing/clients/{second_user["id"]}/issue')
    check('fixed fee only, no units', second['amount'] == 99.9 and second['units'] == 0, second)
    status, other_checkout = client.req('POST', f'/api/billing/invoices/{second["id"]}/checkout')
    check('a client cannot pay or see invoices of others', status in (403, 404), status)
    status, manual = admin.req('PUT', f'/api/billing/invoices/{second["id"]}/paid', {'method': 'transfer', 'reference': 'BCP-778899'})
    check('manual payment', status == 200 and manual['status'] == 'paid' and manual['paymentRef'] == 'BCP-778899', manual)
    status, _ = admin.req('PUT', f'/api/billing/invoices/{second["id"]}/void')
    check('a paid invoice cannot be voided', status == 400, status)
    status, _ = admin.req('DELETE', f'/api/billing/invoices/{second["id"]}')
    check('only voided invoices can be deleted', status == 400, status)

    status, summary = admin.req('GET', '/api/billing/summary')
    check('summary with collected amounts', status == 200 and summary.get('paidThisMonth', {}).get('PEN', 0) >= 169.9 and summary['mercadoPago'] is True, summary)

    for user in (client_user, second_user):
        admin.req('PUT', f'/api/billing/clients/{user["id"]}', {**settings, 'price': 0, 'fixedFee': 0, 'autoSuspend': False})
    # paid invoices are records: they stay in the database, hidden once their account is deleted
    for device in devices:
        admin.req('DELETE', f'/api/devices/{device["id"]}')
    for user in (client_user, second_user):
        admin.req('DELETE', f'/api/users/{user["id"]}')
    server.shutdown()
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} OK')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
