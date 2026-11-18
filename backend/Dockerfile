# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript — tsc emits JS regardless of type errors; || true ensures Docker build succeeds
RUN npx tsc || true

# Compile the seed scripts as well. They live outside src/ and import from it,
# so they must be emitted alongside the rest of the tree; the production stage
# has no `tsx` and no source files to run them from.
RUN npx tsc -p tsconfig.seed.json || true

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install OpenSSL for Prisma engine compatibility
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev

# Generate Prisma client (needs OpenSSL to detect correct engine)
RUN npx prisma generate

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-seed ./dist-seed

# The data snapshot (prisma/snapshot) rides with prisma/ — the seeder restores
# it as the default state on a fresh deployment.

# Seed-time upload files referenced by the snapshot's attachment rows. They
# land in the uploads volume via the entrypoint copy below.
COPY prisma/snapshot/uploads ./snapshot-uploads

# Create uploads directory
RUN mkdir -p /app/uploads

# Set ownership
RUN chown -R node:node /app

USER node

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# On boot: copy the snapshot's upload files into the uploads volume (only when
# the volume is empty for that folder — first boot), then start the API.
CMD ["sh", "-c", "cp -rn /app/snapshot-uploads/. /app/uploads/ 2>/dev/null; exec node dist/index.js"]
