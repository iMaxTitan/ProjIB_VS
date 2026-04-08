

# ===== FILE: infra-app-vps.md =====

---
name: App VPS (Production) configuration
description: Прод-сервер Hetzner CAX11 — порт 443, pm2 cs-platform, /opt/cs-platform/, также проксирует дев :8080
type: reference
---

## App VPS — Production

- **VPS:** Hetzner CAX11 (ARM aarch64), Ubuntu 24.04, 4GB RAM, 40GB disk
- **Public IP:** `91.99.156.163`, **Internal IP:** `10.0.0.2`
- **SSH:** `ssh -i ~/.ssh/id_nas root@91.99.156.163`
- **Work dir:** `/opt/cs-platform/`
- **URL:** `https://maxtitan.me` (порт 443)
- **pm2:** `cs-platform` (PORT=443) + `digest-cron` (cron "0 9 * * 1", --no-autorestart)
- **SSL:** `certificates/maxtitan.pem` + `maxtitan-key.pem`, HTTPS через server.js
- **Logs:** `ssh -i ~/.ssh/id_nas root@91.99.156.163 'pm2 logs cs-platform --lines 50 --nostream'`

## Deploy (прод)

```bash
bash deploy.sh
```
Скрипт: build → tar → ssh sync → pm2 restart. Env из `.env.local` на VPS.
`NEXT_PUBLIC_API_URL=https://maxtitan.me` (без порта).

## PostgREST подключение

- **Server-side:** `POSTGREST_URL=http://10.0.0.3:3000` + `POSTGREST_DIRECT=1` (напрямую по внутренней сети, без `/rest/v1/` префикса)
- **Browser:** через `server.js` proxy `/rest/v1/*` → `10.0.0.3:3000`
- **ВАЖНО:** DB VPS закрыт снаружи — подключение ТОЛЬКО по внутренней сети `10.0.0.x`

## Прокси

- `/rest/v1/*` → PostgREST на DB VPS (`10.0.0.3:3000`)
- `:8080` → DB VPS `:3001` (дев-сервер, чтобы дев использовал SSL сертификат прода)

## Важно

- digest-cron ТОЛЬКО с `--no-autorestart`
- НЕ добавлять NAT redirect (443→3000)
- **GRE тоннель:** `gre-mt` к MikroTik (91.203.62.148), подсеть 10.77.0.0/24
- MikroTik LAN: static DNS `maxtitan.me → 192.168.88.154`


# ===== FILE: infra-db-vps.md =====

---
name: DB VPS Infrastructure
description: Self-hosted PostgreSQL on Hetzner VPS — connection details, PostgREST config, internal network
type: reference
---

## DB VPS (Hetzner CPX, Nuremberg)
- **Public IP:** 46.225.234.164
- **Internal IP:** 10.0.0.3 (Hetzner Cloud Network `cs-internal`)
- **SSH:** `ssh -i ~/.ssh/id_nas root@46.225.234.164`
- **OS:** Ubuntu 24.04, x86_64, 4GB RAM, 75GB disk (NVMe)

## Components
- **PostgreSQL 16.13** — port 5432, database `csplatform`
- **pgvector 0.6.0** — KB embeddings (1024 dims HNSW)
- **PostgREST 12.2.3** — port 3000, systemd service
- **Nginx** — port 8443, reverse proxy `/rest/v1/` → PostgREST
- **Adminer** — port 5050 (PHP built-in server, systemd). Логин: postgres / CsDb2026 / csplatform
  - Доступ через WireGuard: http://10.77.1.1:5050 (проброс iptables wg0→enp7s0→10.0.0.3:5050)
  - pgAdmin удалён (Apache disabled)
- **Swap:** 2GB

## PostgREST Config
- `/etc/postgrest.conf`
- `server-host = "*"` (слушает на всех интерфейсах, внешний доступ закрыт iptables)
- `jwt-secret-is-base64 = false` (IMPORTANT: jose library uses raw string, not base64-decoded)
- DB roles: `authenticator` (login), `anon`, `authenticated`, `service_role` (BYPASSRLS)
- **iptables:** порт 3000 разрешён только для `10.0.0.0/24` и `127.0.0.1`, остальное DROP

## PostgreSQL Tuning
- `/etc/postgresql/16/main/conf.d/tuning.conf`
- shared_buffers=1GB, effective_cache_size=3GB, work_mem=32MB, random_page_cost=1.1, jit=off

## Network
- App VPS (10.0.0.2) → DB VPS (10.0.0.3) via Hetzner Cloud Network
- server.js proxies `/rest/v1/*` → PostgREST (10.0.0.3:3000)
- `POSTGREST_URL=http://10.0.0.3:3000` + `POSTGREST_DIRECT=1` — server-side direct access (без `/rest/v1/` префикса)
- `NEXT_PUBLIC_API_URL=https://maxtitan.me` — browser via HTTPS proxy

## Firewall (ufw) — updated 2026-04-01
- SSH: 22 from anywhere (key-only auth)
- PostgREST/PostgreSQL/pgAdmin: internal only (10.0.0.0/16)
- PostgreSQL: WireGuard (10.77.0.0/16) — для MCP postgres и dev-машины
- Dev server/law-fetcher: internal only (10.0.0.x)
- **Нет публичных портов кроме SSH** — все внешние IP-правила удалены

## Key Config
- `server.js` — PostgREST proxy for browser requests
- `config/index.ts` — `config.db.url` (browser), `config.db.serverUrl` (server-side direct)
- `db-server.ts` — creates PostgREST client with service-role key
- Env vars: POSTGREST_URL, POSTGREST_HOST, POSTGREST_PORT, POSTGREST_SERVICE_KEY, POSTGREST_ANON_KEY, POSTGREST_JWT_SECRET


# ===== FILE: infra-deploy-flow.md =====

---
name: Deploy flow — prod build + dev sync
description: Как деплоить на прод (build + deploy.sh) и синкать исходники на дев (rsync без билда, next dev hot reload)
type: reference
---

## Прод — билд + деплой

```bash
bash deploy.sh
```

1. `npm run build` — локально на PC
2. tar (.next, public, server.js, next.config.js, package.json, ...) → ssh → App VPS `/opt/cs-platform/`
3. `pm2 restart cs-platform`

## Дев — синк исходников (БЕЗ билда!)

Дев = полноценный `next dev` сервер с hot reload. Билдить НЕ НУЖНО.

```bash
SSH_OPTS="-i $HOME/.ssh/id_nas -o StrictHostKeyChecking=no"
DEV_VPS="root@46.225.234.164"
DEV_DIR="/opt/cs-dev"

# Синк всех исходников (после крупных изменений):
tar czf - src public server.js next.config.js package.json package-lock.json templates data data_sources scripts 2>/dev/null \
  | ssh $SSH_OPTS "$DEV_VPS" "cd $DEV_DIR && tar xzf -"

# npm install — только если менялись зависимости:
ssh $SSH_OPTS "$DEV_VPS" "cd $DEV_DIR && npm install"

# Рестарт — только если next dev завис или OOM:
ssh $SSH_OPTS "$DEV_VPS" "pm2 restart cs-dev"
```

**Why:** Дев-сервер (next dev) автоматически перекомпилирует изменённые файлы. Рестарт pm2 обычно не нужен — hot reload подхватит. Рестарт нужен только при изменении server.js, next.config.js или OOM.

**How to apply:** При "деплой на дев" / "синк на дев" — синхронизировать исходники, НЕ билдить. При "деплой" без уточнения — билд + deploy.sh на прод.


# ===== FILE: infra-dev-vps.md =====

---
name: Dev VPS configuration
description: Dev-сервер (next dev) на DB VPS — hot reload, порт 8080, pm2 cs-dev, /opt/cs-dev/
type: reference
---

## Dev VPS (на DB VPS) — next dev с hot reload

- **VPS:** Hetzner DB VPS (тот же що і БД)
- **IP:** `46.225.234.164`
- **SSH:** `ssh -i ~/.ssh/id_nas root@46.225.234.164`
- **Work dir:** `/opt/cs-dev/` (повні вихідники + node_modules)
- **pm2 name:** `cs-dev`
- **PORT:** `8080` (слухає на VPS)
- **NODE_ENV:** `development` (next dev, компіляція на льоту, hot reload)
- **URL:** `https://maxtitan.me:8080/` (прод VPS проксирує :8080 → DB VPS :8080)
- **NEXT_PUBLIC_API_URL:** `https://maxtitan.me:8080`
- **NEXT_PUBLIC_BASE_URL:** `https://maxtitan.me:8080`
- **POSTGREST_URL:** `https://localhost:8080` (server.js проксирує /rest/v1/* → PostgREST localhost:3000)
- **PostgREST:** `localhost:3000` (на тому ж VPS)
- **node args:** `--max-old-space-size=2560` (2.5GB heap для dev mode)

## Deploy на дев (без білду!)

```bash
# Синхронізувати тільки змінені вихідники — hot reload підхопить
SSH_OPTS="-i $HOME/.ssh/id_nas -o StrictHostKeyChecking=no"
VPS="root@46.225.234.164"
scp $SSH_OPTS <файл> $VPS:/opt/cs-dev/<шлях>
# Hot reload підхопить зміни автоматично. Рестарт pm2 НЕ потрібен.
```

## Рестарт (якщо потрібен)

```bash
ssh -i ~/.ssh/id_nas root@46.225.234.164 "pm2 restart cs-dev"
# Якщо OOM або проблеми — почистити кеш:
ssh -i ~/.ssh/id_nas root@46.225.234.164 "pm2 stop cs-dev && rm -rf /opt/cs-dev/.next && pm2 start cs-dev --update-env"
```

## Прод VPS прокси (dev-proxy.js)

- **pm2 name:** `dev-proxy` на прод VPS (91.99.156.163)
- **Слухає:** `:8080` (HTTPS з SSL сертифікатом прода)
- **Проксирує:** → `10.0.0.3:8080` (DB VPS, server.js)
- **Підтримує WebSocket** (для HMR)

## Особливості
- Перша завантаження сторінки повільна (компіляція ~5-10с), далі з кешу
- Sourcemaps працюють — можна дебажити в браузері
- Не потребує `npm run build`
- При додаванні нових npm-пакетів — потрібен `npm install` на VPS

## Схема мережі
```
Браузер → maxtitan.me:443  → App VPS (прод, Next.js PORT=443)
Браузер → maxtitan.me:8080 → App VPS dev-proxy → 10.0.0.3:8080 → DB VPS server.js (next dev)
                               server.js /rest/v1/* → localhost:3000 (PostgREST)
```

## Відмінності від прода
- Прод: `91.99.156.163`, порт 443, pm2 `cs-platform`, NODE_ENV=production
- Дев: `46.225.234.164`, порт 8080, pm2 `cs-dev`, NODE_ENV=development


# ===== FILE: infra-network-tunnel.md =====

---
name: Network tunnel via MikroTik
description: GRE/WireGuard туннель поднимается на роутере MikroTik, вся LAN имеет доступ к 10.77.x.x
type: reference
---

Туннель к VPS поднимается на **роутере MikroTik**, не на локальной машине.
Вся локальная сеть автоматически маршрутизируется через роутер в подсеть 10.77.0.0/16.

**Следствие:** с любой машины в LAN доступны адреса 10.77.x.x напрямую — не нужен SSH-туннель или локальный WireGuard.

- MCP postgres подключается к `10.77.1.2:5432` (через роутер)
- Adminer: `http://10.77.1.1:5050`
- Static DNS на роутере: `maxtitan.me → 192.168.88.154`
