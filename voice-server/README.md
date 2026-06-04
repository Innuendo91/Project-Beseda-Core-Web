# voice-server (mediasoup) v2

Minimal audio SFU signaling server using mediasoup + WS.

## Quick start
```bash
cp .env.example .env
# edit .env: set VOICE_JWT_SECRET and ANNOUNCED_IP
npm install
npm start
```

Healthcheck:
```bash
curl http://127.0.0.1:4001/health
```

## Firewall
Open:
- TCP: PORT (default 4001)
- UDP: RTP_MIN_PORT..RTP_MAX_PORT (default 40000-40100)

## Nginx WS proxy example
```
location /voice/ {
  proxy_pass http://127.0.0.1:4001/voice/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 3600s;
  proxy_send_timeout 3600s;
}
```
