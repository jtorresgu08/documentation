#!/usr/bin/env bash
# Preparación inicial de un VPS Ubuntu 24.04 (Contabo / OVH). Ejecutar como root una sola vez:
#   curl -fsSL <este archivo> | bash   o   sudo bash setup-server.sh
set -euo pipefail

GPS_PORTS="${GPS_PORTS:-5001:5100}"
SSH_PORT="${SSH_PORT:-22}"

echo "==> Actualizando el sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl gnupg ufw fail2ban unattended-upgrades git

echo "==> Actualizaciones de seguridad automáticas"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Instalando Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Con muchos puertos GPS publicados, el proxy de espacio de usuario de Docker crea un proceso por puerto
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<JSON
{
  "userland-proxy": false,
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" }
}
JSON
systemctl restart docker

echo "==> Firewall (UFW)"
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow "${GPS_PORTS}/tcp"
ufw allow "${GPS_PORTS}/udp"
ufw allow 5261/tcp   # adjuntos ADAS/DMS de dashcams
ufw allow "${VIDEO_PORT:-7611}/tcp"   # video JT/T 1078 (si instalas el servidor de video)
ufw --force enable

echo "==> Fail2ban para SSH"
cat > /etc/fail2ban/jail.local <<JAIL
[sshd]
enabled = true
port = ${SSH_PORT}
maxretry = 5
bantime = 1h
JAIL
systemctl enable --now fail2ban

echo "==> Swap de 4 GB (si no existe)"
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

cat <<MSG

Listo. Pasos siguientes (ver infra/DEPLOY.md):
  1. Desactiva el acceso SSH por contraseña y usa claves (PasswordAuthentication no).
  2. git clone del repositorio, cd tracking-platform/infra, cp .env.example .env y edítalo.
  3. docker compose up -d --build
MSG
