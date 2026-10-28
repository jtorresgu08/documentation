#!/usr/bin/env python3
"""
Simulador de dashcam JT/T 808 + extensión de seguridad activa (ADAS/DMS) + JT/T 1078.

Sirve para probar el servidor sin cámaras reales:
  - registro, autenticación y posiciones (0x0100, 0x0102, 0x0200)
  - alarmas ADAS / DMS con adjuntos (0x64 / 0x65 -> el servidor pide los archivos con 0x9208)
  - subida de adjuntos al servidor de adjuntos (0x1210, 0x1211, flujo 0x30316364, 0x1212)
  - foto bajo demanda (0x8801 -> 0x0801 en varios paquetes)
  - solicitud de video en vivo (0x9101 / 0x9102)
  - grabaciones de la memoria (0x9205 -> 0x1205) y su reproducción (0x9201 / 0x9202)

Uso:
  python3 dashcam_simulator.py --host 127.0.0.1 --port 5015 --phone 013912345678 \
      --image foto.jpg --video clip.mp4 --alarm adas:1 --alarm dms:2
"""
import argparse
import queue
import socket
import struct
import threading
import time
from datetime import datetime, timezone


def bcd(value: str) -> bytes:
    return bytes.fromhex(value)


def bcd_time(moment: datetime) -> bytes:
    return bytes.fromhex(moment.strftime('%y%m%d%H%M%S'))


def parse_bcd_time(data: bytes):
    text = data.hex()
    if text == '000000000000':
        return None
    return datetime.strptime(text, '%y%m%d%H%M%S')


def escape(data: bytes) -> bytes:
    return data.replace(b'\x7d', b'\x7d\x01').replace(b'\x7e', b'\x7d\x02')


def unescape(data: bytes) -> bytes:
    return data.replace(b'\x7d\x02', b'\x7e').replace(b'\x7d\x01', b'\x7d')


def checksum(data: bytes) -> int:
    value = 0
    for b in data:
        value ^= b
    return value


class Jt808Connection:
    """One TCP connection speaking JT/T 808 frames (and raw attachment data frames)."""

    def __init__(self, host, port, phone):
        self.phone = phone
        self.serial = 0
        self.sock = socket.create_connection((host, port), timeout=10)
        self.messages = queue.Queue()
        self.buffer = b''
        self.running = True
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _read(self):
        while self.running:
            try:
                chunk = self.sock.recv(65536)
            except (socket.timeout, OSError):
                if not self.running:
                    return
                continue
            if not chunk:
                return
            self.buffer += chunk
            while True:
                start = self.buffer.find(b'\x7e')
                end = self.buffer.find(b'\x7e', start + 1) if start >= 0 else -1
                if start < 0 or end < 0:
                    break
                frame = unescape(self.buffer[start + 1:end])
                self.buffer = self.buffer[end + 1:]
                if len(frame) < 13:
                    continue
                msg_id, props = struct.unpack('>HH', frame[:4])
                body = frame[12:-1]
                self.messages.put((msg_id, body))

    def send(self, msg_id, body=b'', packet=None):
        self.serial = (self.serial + 1) & 0xFFFF
        props = len(body)
        extra = b''
        if packet is not None:
            props |= 1 << 13
            extra = struct.pack('>HH', packet[1], packet[0])
        header = struct.pack('>HH', msg_id, props) + bcd(self.phone) + struct.pack('>H', self.serial) + extra
        payload = header + body
        self.sock.sendall(b'\x7e' + escape(payload + bytes([checksum(payload)])) + b'\x7e')

    def send_raw(self, data):
        self.sock.sendall(data)

    def expect(self, msg_id, timeout=10):
        deadline = time.time() + timeout
        skipped = []
        try:
            while time.time() < deadline:
                try:
                    received, body = self.messages.get(timeout=max(0.1, deadline - time.time()))
                except queue.Empty:
                    break
                if received == msg_id:
                    return body
                skipped.append((received, body))
        finally:
            for item in skipped:
                self.messages.put(item)
        raise TimeoutError(f'no se recibió 0x{msg_id:04x}')

    def close(self):
        self.running = False
        try:
            self.sock.close()
        except OSError:
            pass


def location_basic(lat, lon, speed_kmh=0.0, course=0, alarm=0, moment=None):
    status = 0b11  # acc on, gps fixed
    if lat < 0:
        status |= 1 << 2
    if lon < 0:
        status |= 1 << 3
    moment = moment or datetime.now(timezone.utc)
    return struct.pack('>IIIIHHH', alarm, status, int(abs(lat) * 1e6), int(abs(lon) * 1e6), 150,
                       int(speed_kmh * 10), course) + bcd_time(moment)


ADAS_NAMES = {1: 'colisión frontal', 2: 'salida de carril', 3: 'distancia insegura', 4: 'peatón',
              5: 'cambio de carril frecuente', 6: 'exceso señal de tránsito', 7: 'obstáculo'}
DMS_NAMES = {1: 'fatiga', 2: 'celular', 3: 'fumando', 4: 'distracción', 5: 'conductor ausente'}


class Dashcam:
    def __init__(self, host, port, phone, lat=-12.0464, lon=-77.0428, timezone_offset=8):
        self.host = host
        self.port = port
        self.phone = phone
        self.lat = lat
        self.lon = lon
        self.alarm_serial = 0
        self.files = []
        self.photo = None
        self.live_requests = []
        self.photo_requests = 0
        self.playback_requests = []
        self.playback_controls = []
        self.log = print
        # JT808 devices report local time; Traccar assumes GMT+8 unless the device has a timezone attribute
        self.tz_offset = timezone_offset
        self.conn = Jt808Connection(host, port, phone)
        self.commands = threading.Thread(target=self._commands, daemon=True)
        # recordings on the memory card (device local time): two per channel in the last hours, one with an alarm
        now = self._device_time().replace(microsecond=0)
        self.recordings = []
        for channel in (1, 2, 3, 4):
            self.recordings.append((channel, now - _hours(3), now - _hours(2), 0))
            self.recordings.append((channel, now - _hours(1.5), now - _hours(0.5), 1 << 32 if channel == 2 else 0))

    def _device_time(self):
        return datetime.now(timezone.utc).replace(tzinfo=None) + _hours(self.tz_offset)

    def register(self):
        body = struct.pack('>HH', 15, 100) + b'SIMUL' + b'DASHCAM-SIM'.ljust(20, b'\0') + b'SIM0001' + b'\x01' + 'ABC-123'.encode()
        self.conn.send(0x0100, body)
        response = self.conn.expect(0x8100)
        auth = response[3:]
        self.conn.send(0x0102, auth)
        self.conn.expect(0x8001)
        self.log(f'[{self.phone}] registrado y autenticado')

    def report(self, speed=35.0, extensions=b''):
        self.conn.send(0x0200, location_basic(self.lat, self.lon, speed, 90, moment=self._device_time()) + extensions)
        self.conn.expect(0x8001)

    def alarm(self, kind, alarm_type, files):
        """Sends an ADAS or DMS alarm announcing len(files) attachments and uploads them when requested."""
        self.alarm_serial += 1
        now = self._device_time()
        reference = b'SIM0001' + bcd_time(now) + bytes([self.alarm_serial & 0xFF, len(files), 0])
        common = struct.pack('>BHII', 40, 150, int(abs(self.lat) * 1e6), int(abs(self.lon) * 1e6)) + bcd_time(now) + b'\x00\x01'
        if kind == 'adas':
            block = struct.pack('>IBBB', self.alarm_serial, 1, alarm_type, 2) + bytes([60, 8, 0, 0, 0]) + common + reference
            ext = bytes([0x64, len(block)]) + block
        else:
            block = struct.pack('>IBBB', self.alarm_serial, 1, alarm_type, 2) + bytes([3]) + b'\0' * 4 + common + reference
            ext = bytes([0x65, len(block)]) + block
        self.conn.send(0x0200, location_basic(self.lat, self.lon, 40, 90, moment=now) + ext)
        self.conn.expect(0x8001)
        name = (ADAS_NAMES if kind == 'adas' else DMS_NAMES).get(alarm_type, alarm_type)
        self.log(f'[{self.phone}] alarma {kind.upper()} "{name}" enviada con {len(files)} adjuntos')
        if not files:
            return None
        request = self.conn.expect(0x9208)
        ip_len = request[0]
        ip = request[1:1 + ip_len].decode()
        tcp_port = struct.unpack('>H', request[1 + ip_len:3 + ip_len])[0]
        offset = 5 + ip_len
        reference_back = request[offset:offset + 16]
        alarm_number = request[offset + 16:offset + 48].decode()
        assert reference_back == reference, 'referencia de alarma distinta'
        self.log(f'[{self.phone}] el servidor pide los adjuntos en {ip}:{tcp_port} (alarma {alarm_number})')
        self.upload_attachments(ip, tcp_port, reference, alarm_number, kind, alarm_type, files)
        return alarm_number

    def upload_attachments(self, ip, port, reference, alarm_number, kind, alarm_type, files):
        attach = Jt808Connection(ip, port, self.phone)
        try:
            code = f'{0x64 if kind == "adas" else 0x65:02x}{alarm_type:02x}'
            named = []
            for index, (path, file_type) in enumerate(files):
                ext = path.rsplit('.', 1)[-1]
                name = f'{file_type:02d}_{1 if kind == "adas" else 2}_{code}_{index}_{alarm_number}.{ext}'
                with open(path, 'rb') as handle:
                    named.append((name, file_type, handle.read()))
            body = b'SIM0001' + reference + alarm_number.encode() + bytes([0, len(named)])
            for name, _, data in named:
                body += bytes([len(name)]) + name.encode() + struct.pack('>I', len(data))
            attach.send(0x1210, body)
            attach.expect(0x8001)
            for name, file_type, data in named:
                attach.send(0x1211, bytes([len(name)]) + name.encode() + bytes([file_type]) + struct.pack('>I', len(data)))
                attach.expect(0x8001)
                for offset in range(0, len(data), 64 * 1024):
                    chunk = data[offset:offset + 64 * 1024]
                    attach.send_raw(struct.pack('>I', 0x30316364) + name.encode().ljust(50, b'\0')
                                    + struct.pack('>II', offset, len(chunk)) + chunk)
                attach.send(0x1212, bytes([len(name)]) + name.encode() + bytes([file_type]) + struct.pack('>I', len(data)))
                result = attach.expect(0x9212)
                status = result[1 + result[0] + 1]
                self.log(f'[{self.phone}] adjunto {name} ({len(data)} bytes): {"OK" if status == 0 else "incompleto"}')
                self.files.append((name, status))
        finally:
            attach.close()

    def start_command_listener(self, photo_path):
        self.photo = photo_path
        self.commands.start()

    def _commands(self):
        while self.conn.running:
            try:
                msg_id, body = self.conn.messages.get(timeout=0.5)
            except queue.Empty:
                continue
            if msg_id == 0x8801:
                self.photo_requests += 1
                channel = body[0]
                self.log(f'[{self.phone}] pedido de foto, canal {channel}')
                self.send_photo(channel)
            elif msg_id == 0x9101:
                ip_len = body[0]
                ip = body[1:1 + ip_len].decode()
                tcp_port, _ = struct.unpack('>HH', body[1 + ip_len:5 + ip_len])
                channel = body[5 + ip_len]
                self.live_requests.append((ip, tcp_port, channel))
                self.log(f'[{self.phone}] pedido de video en vivo: canal {channel} hacia {ip}:{tcp_port}')
                self.conn.send(0x0001, struct.pack('>HHB', 0, 0x9101, 0))
            elif msg_id == 0x9102:
                self.log(f'[{self.phone}] fin del video en vivo, canal {body[0]}')
                self.live_requests.append(('stop', 0, body[0]))
                self.conn.send(0x0001, struct.pack('>HHB', 0, 0x9102, 0))
            elif msg_id == 0x9205:
                channel = body[0]
                start, end = parse_bcd_time(body[1:7]), parse_bcd_time(body[7:13])
                self.log(f'[{self.phone}] consulta de grabaciones: canal {channel} {start} - {end}')
                self.send_recordings(channel, start, end)
            elif msg_id == 0x9201:
                ip_len = body[0]
                ip = body[1:1 + ip_len].decode()
                offset = 1 + ip_len
                tcp_port, _ = struct.unpack('>HH', body[offset:offset + 4])
                channel, _, _, _, mode, speed = body[offset + 4:offset + 10]
                start, end = parse_bcd_time(body[offset + 10:offset + 16]), parse_bcd_time(body[offset + 16:offset + 22])
                self.playback_requests.append({'ip': ip, 'port': tcp_port, 'channel': channel, 'mode': mode,
                                               'speed': speed, 'start': start, 'end': end})
                self.log(f'[{self.phone}] reproducción: canal {channel} {start} - {end} hacia {ip}:{tcp_port}')
                self.send_recordings(channel, start, end)
            elif msg_id == 0x9202:
                channel, control, speed = body[0], body[1], body[2]
                self.playback_controls.append({'channel': channel, 'control': control, 'speed': speed,
                                               'seek': parse_bcd_time(body[3:9])})
                self.log(f'[{self.phone}] control de reproducción: canal {channel} acción {control}')
                self.conn.send(0x0001, struct.pack('>HHB', 0, 0x9202, 0))
            elif msg_id == 0x8800:
                self.log(f'[{self.phone}] el servidor confirmó la foto')
            else:
                self.conn.messages.put((msg_id, body))
                time.sleep(0.05)

    def send_photo(self, channel):
        with open(self.photo, 'rb') as handle:
            data = handle.read()
        header = struct.pack('>IBBBB', int(time.time()) & 0xFFFFFFFF, 0, 0, 0, channel)
        payload = header + location_basic(self.lat, self.lon, 30, 90, moment=self._device_time()) + data
        size = 900
        packets = [payload[i:i + size] for i in range(0, len(payload), size)]
        for index, packet in enumerate(packets, 1):
            self.conn.send(0x0801, packet, packet=(index, len(packets)))
        self.log(f'[{self.phone}] foto enviada en {len(packets)} paquetes')

    def send_recordings(self, channel, start, end):
        items = [item for item in self.recordings
                 if (channel == 0 or item[0] == channel)
                 and (start is None or item[2] > start) and (end is None or item[1] < end)]
        body = struct.pack('>HI', 0, len(items))
        for item_channel, item_start, item_end, alarm in items:
            body += bytes([item_channel]) + bcd_time(item_start) + bcd_time(item_end) + struct.pack('>Q', alarm)
            body += bytes([0, 1, 1]) + struct.pack('>I', 512 * 1024 * 1024)
        self.conn.send(0x1205, body)

    def close(self):
        self.conn.close()


def _hours(value):
    from datetime import timedelta
    return timedelta(hours=value)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5015)
    parser.add_argument('--phone', default='013912345678', help='12 dígitos, igual al identificador del dispositivo')
    parser.add_argument('--image', required=True, help='JPEG para adjuntos y fotos')
    parser.add_argument('--video', help='MP4 para adjuntos de video')
    parser.add_argument('--alarm', action='append', default=[], help='adas:N o dms:N (se puede repetir)')
    parser.add_argument('--wait', type=int, default=60, help='segundos esperando comandos (foto / video)')
    args = parser.parse_args()

    cam = Dashcam(args.host, args.port, args.phone)
    cam.register()
    cam.report()
    for item in args.alarm:
        kind, number = item.split(':')
        files = [(args.image, 0)] + ([(args.video, 2)] if args.video else [])
        cam.alarm(kind, int(number), files)
    cam.start_command_listener(args.image)
    print(f'Esperando comandos {args.wait} s (envía "Pedir foto" o "Video en vivo" desde la plataforma)...')
    end = time.time() + args.wait
    while time.time() < end:
        cam.report(speed=30)
        time.sleep(10)
    cam.close()


if __name__ == '__main__':
    main()
