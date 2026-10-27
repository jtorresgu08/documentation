#!/usr/bin/env python3
"""
Simulador de dashcam Jimi IoT con protocolo GT06 (JC400 / JC261).

  - inicio de sesión y alarma JC400 (0x95) con la lista de archivos del evento, por TCP (puerto gt06, 5023)
  - subida de los archivos del evento por HTTP (puerto jimiupload, 5262), como hace la cámara con UPLOAD,...
  - escucha comandos de texto del servidor (0x80), p. ej. RTMP,ON,INOUT para video en vivo

Uso:
  python3 jimi_simulator.py --host 127.0.0.1 --imei 862798052429087 --front clip.mp4 --cabin cabina.jpg
"""
import argparse
import queue
import socket
import struct
import threading
import time
import urllib.request
import uuid
from datetime import datetime, timezone


def crc16_x25(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0x8408 if crc & 1 else crc >> 1
    return ~crc & 0xFFFF


def packet(protocol: int, content: bytes, serial: int) -> bytes:
    body = bytes([len(content) + 5, protocol]) + content + struct.pack('>H', serial)
    return b'\x78\x78' + body + struct.pack('>H', crc16_x25(body)) + b'\r\n'


def bcd_imei(imei: str) -> bytes:
    return bytes.fromhex(imei.rjust(16, '0'))


class JimiCamera:
    def __init__(self, host, port, imei):
        self.host = host
        self.imei = imei
        self.serial = 0
        self.sock = socket.create_connection((host, port), timeout=10)
        self.commands = queue.Queue()
        self.running = True
        self.log = print
        threading.Thread(target=self._read, daemon=True).start()

    def _next(self):
        self.serial = (self.serial + 1) & 0xFFFF
        return self.serial

    def _read(self):
        buffer = b''
        while self.running:
            try:
                chunk = self.sock.recv(4096)
            except (socket.timeout, OSError):
                if not self.running:
                    return
                continue
            if not chunk:
                return
            buffer += chunk
            while len(buffer) >= 5 and buffer[:2] in (b'\x78\x78', b'\x79\x79'):
                long_header = buffer[:2] == b'\x79\x79'
                length = struct.unpack('>H', buffer[2:4])[0] if long_header else buffer[2]
                total = (4 if long_header else 3) + length + 2
                if len(buffer) < total:
                    break
                frame, buffer = buffer[:total], buffer[total:]
                protocol = frame[4] if long_header else frame[3]
                if protocol == 0x80:
                    start = 5 if long_header else 4
                    text = frame[start + 5:start + 1 + frame[start]].decode('ascii', 'replace')
                    self.log(f'[{self.imei}] comando recibido: {text}')
                    self.commands.put(text)

    def login(self):
        self.sock.sendall(packet(0x01, bcd_imei(self.imei), self._next()))
        time.sleep(0.5)
        self.log(f'[{self.imei}] sesión iniciada')

    def alarm(self, event, files, lat=-12.0464, lon=-77.0428, speed=40):
        """JC400 alarm (0x95) listing the event files, like the camera does before uploading them."""
        now = datetime.now(timezone.utc)
        date = bytes([now.year - 2000, now.month, now.day, now.hour, now.minute, now.second])
        # JC400 layout: date, satellites, latitude, longitude, flags (before speed), speed (2 bytes)
        flags = 1 << 12 | 90  # gps fixed, course 90
        if lat >= 0:
            flags |= 1 << 10  # north
        if lon < 0:
            flags |= 1 << 11  # west
        gps = date + bytes([9]) + struct.pack('>II', int(abs(lat) * 1800000), int(abs(lon) * 1800000))
        gps += struct.pack('>HH', flags, speed)
        names = ','.join(files).encode()
        # power (0.1 V), event code, event data, file names
        content = b'\xff\xff\x01' + gps + struct.pack('>H', 120) + bytes([event]) + struct.pack('>H', 0) + names
        self.sock.sendall(packet(0x95, content, self._next()))
        self.log(f'[{self.imei}] alarma 0x{event:02x} con {len(files)} archivos')

    def upload(self, port, name, data):
        boundary = uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                'Content-Type: application/octet-stream\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
        request = urllib.request.Request(
            f'http://{self.host}:{port}/upload/{self.imei}', data=body, method='POST',
            headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=30) as response:
            self.log(f'[{self.imei}] archivo {name} ({len(data)} bytes) subido: HTTP {response.status}')
            return response.status

    def close(self):
        self.running = False
        self.sock.close()


def event_name(imei, camera, index, moment=None):
    moment = moment or datetime.now()
    return f'EVENT_{imei}_00000000_{moment:%Y_%m_%d_%H_%M_%S}_{camera}_{index}'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5023)
    parser.add_argument('--upload-port', type=int, default=5262)
    parser.add_argument('--imei', default='862798052429087')
    parser.add_argument('--front', required=True, help='archivo de la cámara frontal (mp4 o jpg)')
    parser.add_argument('--cabin', help='archivo de la cámara de cabina (mp4 o jpg)')
    parser.add_argument('--event', type=lambda value: int(value, 0), default=0x93, help='código de alarma (0x93 choque)')
    parser.add_argument('--wait', type=int, default=30)
    args = parser.parse_args()

    cam = JimiCamera(args.host, args.port, args.imei)
    cam.login()
    files = [(event_name(args.imei, 'F', 1) + '.' + args.front.rsplit('.', 1)[-1], args.front)]
    if args.cabin:
        files.append((event_name(args.imei, 'I', 2) + '.' + args.cabin.rsplit('.', 1)[-1], args.cabin))
    cam.alarm(args.event, [name for name, _ in files])
    time.sleep(1)
    for name, path in files:
        with open(path, 'rb') as handle:
            cam.upload(args.upload_port, name, handle.read())
    print(f'Esperando comandos {args.wait} s...')
    time.sleep(args.wait)
    cam.close()


if __name__ == '__main__':
    main()
