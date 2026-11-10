# Production Deployment Guide (Linux + Docker)

End-to-end guide for deploying the DevOps Central Platform to a **production Linux server** using Docker Compose. Assumes Docker Engine + compose plugin are installed and this repository has been cloned onto the server.

> For local development, see [README.md](README.md) and [DOCKER.md](DOCKER.md).

---

## 1. Architecture Overview

```
                    ┌─────────────────────────────────────────────┐
                    │                Host (Linux)                 │
  :80 / :443 ──────▶│  nginx ──┬──▶ frontend (nginx:alpine, :3000)│
                    │          └──▶ backend  (Node 20,      :8080)│
                    │                 ├──▶ database (Postgres 15) │
                    │                 └──▶ redis    (Redis 7)     │
                    └─────────────────────────────────────────────┘
```

| Service | Container | Image | Host port |
|---|---|---|---|
| Reverse proxy | `devops-nginx` | `nginx:alpine` | **80, 443** |
| API server | `devops-backend` | built from `./backend` | 8080 |
| Web app | `devops-frontend` | built from `./frontend` | 3000 |
| Database | `devops-db` | `postgres:15-alpine` | 5432 |
| Cache | `devops-redis` | `redis:7-alpine` | 6379 |

All traffic should go through nginx on ports 80/443. Backend (`:8080`), frontend (`:3000`), Postgres (`:5432`) and Redis (`:6379`) are also exposed on the host — if the server is internet-facing, restrict those with a firewall and leave only 80/443 open.

---

## 2. Prerequisites

- Linux host with Docker Engine and the compose plugin:
  ```bash
  docker --version && docker compose version
  ```
- Repository cloned (e.g. to `/opt/devops-platform`).
- A domain name with an **A record** pointing to the server's public IP (required for TLS certificates).
- Ports 80 and 443 free on the host.

---

## 3. Configure Environment

```bash
cp .env.docker .env
```

Then edit `.env` — change these at minimum for production:

```ini
# Strong random secret (generate: openssl rand -hex 32)
JWT_SECRET=<replace-me>

# Database credentials (choose a strong password)
POSTGRES_PASSWORD=<replace-me>

# Public URL of the app — used by the backend for CORS
FRONTEND_URL=https://your-domain.com
```

⚠️ **`VITE_API_URL` and `VITE_SOCKET_URL` are build-time variables.** They get baked into the frontend bundle when its Docker image is built. For a standard setup behind nginx they should be:

```ini
VITE_API_URL=https://your-domain.com/api
VITE_SOCKET_URL=https://your-domain.com
```

If you change them later, you must rebuild the frontend image (see §8).

---

## 4. TLS Certificates (required — nginx will not start without them)

The reverse proxy config (`nginx/nginx.conf`) ships with the **HTTPS server block enabled by default**. It expects a certificate and key mounted from `nginx/certs/`:

```
nginx/certs/fullchain.pem
nginx/certs/privkey.pem
```

**If these files are missing, the `nginx` container will exit on startup.** Pick one of:

### Option A — Let's Encrypt via webroot (recommended)

nginx already serves ACME challenges on port 80 at `/.well-known/acme-challenge/`.

```bash
# 1. Install certbot (Debian/Ubuntu)
sudo apt install certbot

# 2. Get the cert (nginx container must be running for the webroot to serve,
#    see the HTTP-only workaround below if nginx won't start yet)
sudo certbot certonly --webroot -w /var/www/certbot -d your-domain.com
```

> Because the ACME path is served from inside the nginx container, the simplest flow is: obtain the cert with the **standalone** method while nginx is stopped (`sudo certbot certonly --standalone -d your-domain.com`), copy the files, then start the stack. Or use the nginx container as the webroot by bind-mounting a shared directory — either works; the key requirement is that the challenge file ends up reachable on port 80.

```bash
# 3. Copy certs into place
sudo mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem  nginx/certs/
```

Set up auto-renewal by re-copying after each certbot renewal (e.g. a deploy hook or cron job).

### Option B — HTTP-only trial run

For a quick internal trial without TLS, comment out the entire `listen 443 ssl http2` server block in `nginx/nginx.conf` (and the port-80 redirect-to-HTTPS if you want port 80 to serve the app directly). Remember to restore it for real production use.

---

## 5. Build and Start

```bash
docker compose up -d --build
```

First build takes a few minutes (backend compiles TypeScript, frontend runs a Vite production build). Check status:

```bash
docker compose ps
```

All services should show `Up` — `database` and `redis` also pass their built-in healthchecks, and `backend` reports healthy on `GET /health`.

---

## 6. Initialize the Database (one-time, manual)

The project uses **`prisma db push`** (there is no migrations directory), so the schema must be pushed and seeded manually after the first startup:

```bash
# Create/sync the schema (81 models)
docker compose exec backend npx prisma db push

# Seed roles, permissions, and default users
docker compose exec backend npm run db:seed:built
```

### Default seeded accounts

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@devops-platform.local` | `password` |
| DevOps Admin | `devops-admin@devops-platform.local` | `password` |
| DevOps Engineer | `engineer@devops-platform.local` | `password` |
| Viewer | `viewer@devops-platform.local` | `password` |

🔒 **Log in and change the admin password immediately** — these credentials ship publicly in the repo.

---

## 7. Verify the Deployment

```bash
# Health endpoint via nginx (should return 200)
curl -i http://localhost/health

# Over HTTPS
curl -i https://your-domain.com/health

# Container states + healthchecks
docker compose ps

# Backend logs (look for successful DB/Redis connection)
docker compose logs -f backend
```

Then open `https://your-domain.com` in a browser and log in with the admin account.

---

## 8. Redeploying After Code Changes

```bash
git pull

# Rebuild and restart whatever changed:
docker compose up -d --build backend      # backend code changed
docker compose up -d --build frontend     # frontend code or VITE_* vars changed

# If the Prisma schema changed:
docker compose exec backend npx prisma db push
```

> ⚠️ The backend image does **not** pick up new code automatically — a stale image is the most common cause of "new API route returns 404" after a pull. When unsure, rebuild both apps:
> ```bash
> docker compose up -d --build
> ```

---

## 9. Backup & Restore

### Backup

```bash
# Database dump
docker compose exec database pg_dump -U devops devops > backup_$(date +%F).sql

# Uploaded files
docker run --rm -v devops-platform_uploads_data:/data -v $(pwd):/out alpine \
  tar czf /out/uploads_$(date +%F).tar.gz -C /data .
```

### Restore

```bash
cat backup_2026-01-01.sql | docker compose exec -T database psql -U devops devops
```

> Volume names are prefixed with the directory name of the compose project (e.g. `devops-platform_...` if cloned to `/opt/devops-platform`). Check exact names with `docker volume ls`.

---

## 10. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `devops-nginx` exits immediately | TLS certs missing from `nginx/certs/`. Provide `fullchain.pem` + `privkey.pem` (§4), or comment out the 443 block for an HTTP-only run. |
| `curl http://localhost/health` → connection refused | `nginx` or `backend` not up — `docker compose ps`, check `docker compose logs backend`. |
| New API routes return 404 after `git pull` | Stale backend image — `docker compose up -d --build backend` (§8). |
| Frontend still calls the old API URL | `VITE_API_URL` / `VITE_SOCKET_URL` are baked in at build time — rebuild the frontend image. |
| Backend can't reach the database | Postgres healthcheck failing or wrong `POSTGRES_PASSWORD` in `.env`; backend builds `DATABASE_URL` from those vars. |
| Port 80/443 already in use | Another service (e.g. host nginx/certbot) is bound — stop it or change the published ports in `docker-compose.yml`. |
| Login rejected with correct password | Database not seeded — run §6. |
