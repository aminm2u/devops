# Docker Deployment Guide

This guide explains how to run the DevOps Platform using Docker.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB+ RAM available for Docker

## Quick Start

### 1. Clone and navigate to the project
```bash
git clone <repository-url>
cd devops-platform
```

### 2. Create environment file
```bash
cp .env.docker .env
```

Edit `.env` and update the following for production:
- `POSTGRES_PASSWORD`: Use a strong password
- `JWT_SECRET`: Use a secure random string (at least 32 characters)

### 3. Build and start containers
```bash
# Build images and start services
docker compose up -d --build

# Or for development with logs
docker compose up --build
```

### 4. Initialize the database
```bash
# Run database migrations
docker compose exec backend npx prisma db push

# Seed the database with initial data
docker compose exec backend npm run db:seed
```

### 5. Access the application

- **Frontend**: http://localhost
- **Backend API**: http://localhost/api
- **Database**: localhost:5432

## Services

| Service | Port | Description |
|---------|------|-------------|
| nginx | 80, 443 | Reverse proxy & load balancer |
| frontend | 3000 | React application |
| backend | 8080 | Node.js API server |
| database | 5432 | PostgreSQL database |
| redis | 6379 | Redis cache |

## Common Commands

### Container Management
```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View running containers
docker compose ps

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f backend
docker compose logs -f frontend
```

### Database Operations
```bash
# Connect to PostgreSQL
docker compose exec database psql -U devops -d devops

# Reset database (WARNING: destroys all data)
docker compose exec backend npm run db:reset

# Re-seed database
docker compose exec backend npm run db:seed
```

### Backend Operations
```bash
# Run Prisma commands
docker compose exec backend npx prisma generate
docker compose exec backend npx prisma db push
docker compose exec backend npx prisma migrate dev

# Execute scripts
docker compose exec backend node dist/index.js
```

### Frontend Operations
```bash
# Rebuild frontend
docker compose build frontend

# Access container shell
docker compose exec frontend sh
```

### Maintenance
```bash
# Remove all containers and volumes
docker compose down -v

# Remove unused images
docker image prune -a

# Full cleanup (containers, volumes, images)
docker system prune -a --volumes
```

## Environment Variables

### Database
- `POSTGRES_DB`: Database name (default: devops)
- `POSTGRES_USER`: Database user (default: devops)
- `POSTGRES_PASSWORD`: Database password (default: devops123)

### Backend
- `NODE_ENV`: Environment (development/production)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `JWT_EXPIRES_IN`: Token expiration (default: 7d)
- `PORT`: Backend port (default: 8080)

### Frontend
- `VITE_API_URL`: Backend API URL
- `VITE_SOCKET_URL`: WebSocket server URL

## Production Deployment

### 1. Security Hardening

```bash
# Generate secure JWT secret
openssl rand -base64 32

# Update .env with secure values
JWT_SECRET=<generated-secret>
POSTGRES_PASSWORD=<strong-password>
```

### 2. SSL/TLS Setup

1. Place your SSL certificates in `nginx/certs/`:
   - `fullchain.pem`
   - `privkey.pem`

2. Uncomment the HTTPS server block in `nginx/nginx.conf`

3. Restart nginx:
```bash
docker compose restart nginx
```

### 3. Backup Strategy

```bash
# Backup database
docker compose exec database pg_dump -U devops devops > backup_$(date +%Y%m%d).sql

# Restore database
cat backup_20240101.sql | docker compose exec -T database psql -U devops -d devops
```

### 4. Monitoring

```bash
# View resource usage
docker stats

# Check container health
docker inspect --format='{{.State.Health.Status}}' devops-backend
```

## Troubleshooting

### Port Conflicts
If ports are already in use, modify `docker-compose.yml`:
```yaml
ports:
  - "8081:8080"  # Change host port
```

### Database Connection Issues
1. Check if database is healthy:
```bash
docker compose ps database
docker compose logs database
```

2. Verify connection string:
```bash
docker compose exec backend node -e "console.log(process.env.DATABASE_URL)"
```

### Memory Issues
Increase Docker memory limit:
- Docker Desktop: Settings → Resources → Memory (4GB+)
- Linux: Edit `/etc/docker/daemon.json`

### Build Failures
1. Clean build cache:
```bash
docker compose build --no-cache
```

2. Check Docker logs:
```bash
docker compose logs backend
docker compose logs frontend
```

## Development Mode

For development with hot-reload:

```bash
# Start only database and redis
docker compose up -d database redis

# Run backend locally
cd backend
npm install
npm run dev

# Run frontend locally
cd frontend
npm install
npm run dev
```

## Container Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Nginx                            │
│                   (Port 80/443)                      │
└──────────────┬──────────────────────┬───────────────┘
               │                      │
               ▼                      ▼
┌──────────────────────┐  ┌──────────────────────┐
│      Frontend        │  │       Backend         │
│    (React/Vite)      │  │   (Node.js/Express)   │
│    Port: 3000        │  │    Port: 8080          │
└──────────────────────┘  └──────────┬───────────┘
                                     │
                          ┌──────────┴───────────┐
                          │                      │
                          ▼                      ▼
               ┌──────────────────┐  ┌──────────────────┐
               │    PostgreSQL    │  │      Redis        │
               │    Port: 5432    │  │    Port: 6379     │
               └──────────────────┘  └──────────────────┘
```

## License

See LICENSE file for details.
